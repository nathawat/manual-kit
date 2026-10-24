import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, type Unzipped } from 'fflate'
import { describe, expect, it } from 'vitest'
import { deobfuscateFont } from '../src/build/fonts.ts'
import { DOMParser } from '@xmldom/xmldom'
import { SECTPR_ORDER, SETTINGS_ORDER, W, orderProblems, packageProblems, type XElement } from '../src/build/ooxml.ts'
import { runCli } from './helpers/cli.ts'
import { cleanFixture } from './helpers/fixture.ts'

const FONTS = fileURLToPath(new URL('../assets/fonts/', import.meta.url))
const text = (b: Uint8Array) => new TextDecoder().decode(b)

async function build(extraConfig = '') {
  const root = await cleanFixture()
  if (extraConfig) appendFileSync(join(root, 'manual/manual.config.yaml'), extraConfig)
  const r = runCli(['build', 'docx', '--lang', 'th', '--finalize', 'none'], root)
  expect(r.stderr).toBe('')
  expect(r.code).toBe(0)
  return { root, r, zip: unzipSync(readFileSync(join(root, 'manual/dist/user-guide.th.docx'))) }
}

/** Every XML part well-formed (xmllint), every relationship target present, every part typed. */
function assertPackageValid(zip: Unzipped) {
  expect(packageProblems(zip)).toEqual([])
  const doc = new DOMParser().parseFromString(text(zip['word/document.xml']!), 'text/xml')
  const sect = Array.from(doc.getElementsByTagNameNS(W, 'sectPr')) as unknown as XElement[]
  expect(sect.length).toBeGreaterThan(0)
  for (const s of sect) expect(orderProblems(s, SECTPR_ORDER)).toEqual([])
  const settings = new DOMParser().parseFromString(text(zip['word/settings.xml']!), 'text/xml').documentElement as unknown as XElement
  expect(orderProblems(settings, SETTINGS_ORDER)).toEqual([])
  const dir = mkdtempSync(join(tmpdir(), 'mk-docx-'))
  const types = text(zip['[Content_Types].xml']!)
  const defaults = [...types.matchAll(/<Default Extension="([^"]+)"/g)].map((m) => m[1]!.toLowerCase())
  const overrides = [...types.matchAll(/<Override PartName="([^"]+)"/g)].map((m) => m[1]!)
  for (const [name, bytes] of Object.entries(zip)) {
    if (name.endsWith('/')) continue
    const ext = name.split('.').pop()!.toLowerCase()
    expect(defaults.includes(ext) || overrides.includes(`/${name}`), `content type for ${name}`).toBe(true)
    if (ext === 'xml' || ext === 'rels') {
      const f = join(dir, 'part.xml')
      writeFileSync(f, bytes)
      execFileSync('xmllint', ['--noout', f])
    }
    if (ext === 'rels') {
      const base = name.replace(/_rels\/[^/]*\.rels$/, '')
      for (const m of text(bytes).matchAll(/<Relationship [^>]*>/g)) {
        if (/TargetMode="External"/.test(m[0])) continue
        const target = /Target="([^"]+)"/.exec(m[0])![1]!
        const path = target.startsWith('/') ? target.slice(1) : join(base, target).split('\\').join('/')
        expect(zip[path], `${name} -> ${target}`).toBeDefined()
      }
    }
  }
}

describe('docx fonts', () => {
  it('embeds Sarabun (all four faces, obfuscated) and uses it everywhere by default', async () => {
    const { zip } = await build()
    const fonts = Object.keys(zip).filter((k) => k.startsWith('word/fonts/'))
    expect(fonts).toHaveLength(4)
    const table = text(zip['word/fontTable.xml']!)
    const sarabun = /<w:font w:name="Sarabun">([\s\S]*?)<\/w:font>/.exec(table)![1]!
    expect(sarabun).toContain('<w:altName w:val="Tahoma"/>')
    for (const face of ['Regular', 'Bold', 'Italic', 'BoldItalic']) expect(sarabun).toMatch(new RegExp(`<w:embed${face} r:id="[^"]+" w:fontKey="\\{[0-9A-F-]{36}\\}"/>`))
    // the embedded regular face decodes back to the bundled TTF
    const m = /<w:embedRegular r:id="([^"]+)" w:fontKey="([^"]+)"\/>/.exec(sarabun)!
    const rels = text(zip['word/_rels/fontTable.xml.rels']!)
    const target = new RegExp(`Id="${m[1]}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${m[1]}"`).exec(rels)!
    const part = `word/${target[1] ?? target[2]}`
    expect(Buffer.from(deobfuscateFont(zip[part]!, m[2]!)).equals(readFileSync(join(FONTS, 'Sarabun-Regular.ttf')))).toBe(true)
    expect(Buffer.from(zip[part]!).equals(readFileSync(join(FONTS, 'Sarabun-Regular.ttf')))).toBe(false)

    const settings = text(zip['word/settings.xml']!)
    expect(settings).toMatch(/<w:embedTrueTypeFonts\s*\/>\s*<w:embedSystemFonts\s*\/>\s*<w:saveSubsetFonts w:val="0"\s*\/>/)
    const theme = text(zip['word/theme/theme1.xml']!)
    for (const block of ['majorFont', 'minorFont']) {
      const b = new RegExp(`<a:${block}>([\\s\\S]*?)</a:${block}>`).exec(theme)![1]!
      expect(b).toContain('<a:latin typeface="Sarabun"/>')
      expect(b).toContain('<a:cs typeface="Sarabun"/>')
      expect(b).toContain('<a:font script="Thai" typeface="Sarabun"/>')
    }
    const styles = text(zip['word/styles.xml']!)
    expect(styles).not.toMatch(/Theme="/)
    for (const f of styles.match(/<w:rFonts [^>]*>/g)!) if (!/Consolas|Courier/.test(f)) expect(f).toMatch(/w:cs="Sarabun"/)
    const sz = [...styles.matchAll(/<w:sz w:val="(\d+)"\s*\/>\s*(<w:szCs w:val="(\d+)"\s*\/>)?/g)]
    expect(sz.length).toBeGreaterThan(5)
    for (const s of sz) expect(s[3], `szCs after sz ${s[1]}`).toBe(s[1])
    assertPackageValid(zip)
  })

  it('embedFonts: false embeds nothing and warns that recipients need the font', async () => {
    const { zip, r } = await build('fonts: { embedFonts: false }\n')
    expect(Object.keys(zip).some((k) => k.startsWith('word/fonts/'))).toBe(false)
    expect(text(zip['word/settings.xml']!)).not.toContain('embedTrueTypeFonts')
    expect(text(zip['word/styles.xml']!)).toContain('w:cs="Sarabun"')
    expect(r.stdout).toMatch(/not embedded.*Sarabun.*installed.*Tahoma/s)
    assertPackageValid(zip)
  })

  it('uses a project font family and files from fonts.docx', async () => {
    const { zip } = await build(
      `fonts:\n  docx:\n    fallback: Leelawadee UI\n    thai:\n      family: Project Sans\n      files: { regular: ${join(FONTS, 'Sarabun-Regular.ttf')}, bold: ${join(FONTS, 'Sarabun-Bold.ttf')} }\n`,
    )
    expect(Object.keys(zip).filter((k) => k.startsWith('word/fonts/'))).toHaveLength(2)
    const table = text(zip['word/fontTable.xml']!)
    expect(table).toMatch(/<w:font w:name="Project Sans"><w:altName w:val="Leelawadee UI"\/>/)
    expect(text(zip['word/styles.xml']!)).toContain('w:ascii="Project Sans"')
    assertPackageValid(zip)
  })

  it('rejects a font file that does not exist', async () => {
    const root = await cleanFixture()
    appendFileSync(join(root, 'manual/manual.config.yaml'), 'fonts: { docx: { thai: { family: X, files: { regular: nope.ttf } } } }\n')
    const r = runCli(['build', 'docx', '--lang', 'th', '--finalize', 'none'], root)
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/nope\.ttf/)
  })
})

describe('docx fonts after a word processor re-saved the file', () => {
  it('re-applying fonts drops other embedded faces so no r:id dangles, and the verifier catches dangling ids', async () => {
    const { applyDocxFonts, resolveDocxFonts } = await import('../src/build/fonts.ts')
    const { verifyDocx } = await import('../src/verify-docx.ts')
    const { openProject } = await import('../src/project.ts')
    const { zip, root } = await build()
    // simulate Word: another embedded font with its own relationship
    const table = text(zip['word/fontTable.xml']!).replace('</w:fonts>', '<w:font w:name="Times New Roman"><w:embedRegular r:id="rIdWord9" w:fontKey="{00000000-0000-0000-0000-000000000000}"/></w:font></w:fonts>')
    zip['word/fontTable.xml'] = new TextEncoder().encode(table)
    zip['word/_rels/fontTable.xml.rels'] = new TextEncoder().encode(
      text(zip['word/_rels/fontTable.xml.rels']!).replace('</Relationships>', '<Relationship Id="rIdWord9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font9.odttf"/></Relationships>'),
    )
    zip['word/fonts/font9.odttf'] = new Uint8Array(64)
    expect(verifyDocx(zip).problems).toEqual([])
    applyDocxFonts(zip, resolveDocxFonts(await openProject(join(root, 'manual')))!, true)
    const v = verifyDocx(zip)
    expect(v.problems).toEqual([])
    expect(v.embeddedFonts).toEqual(['Sarabun'])
    // and a dangling id is reported
    zip['word/fontTable.xml'] = new TextEncoder().encode(text(zip['word/fontTable.xml']!).replace('</w:fonts>', '<w:font w:name="X"><w:embedRegular r:id="rIdNope" w:fontKey="{00000000-0000-0000-0000-000000000000}"/></w:font></w:fonts>'))
    expect(verifyDocx(zip).problems.join('\n')).toMatch(/rIdNope/)
  })
})
