import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig, localize } from '../src/config.ts'
import { loadShots } from '../src/shots.ts'

function manualDir(file: string, body: string) {
  const root = mkdtempSync(join(tmpdir(), 'mk-config-'))
  const dir = join(root, 'manual')
  mkdirSync(dir)
  writeFileSync(join(dir, file), body)
  return { root, dir }
}

describe('loadConfig', () => {
  it('reads a YAML config and fills defaults', async () => {
    const { root, dir } = manualDir('manual.config.yaml', 'document:\n  title: { th: คู่มือครู, en: Teacher guide }\n')
    const { config, projectRoot } = await loadConfig(dir)
    expect(projectRoot).toBe(resolve(root))
    expect(config.languages).toEqual(['th'])
    expect(config.outputs).toMatchObject({ pdf: true, docx: false })
    expect(config.capture.allowlist).toEqual(['localhost', '127.0.0.1'])
    expect(config.media).toBe('screenshots')
    expect(config.adapter).toEqual({ type: 'none', sections: [], data: {} })
    expect(config.sections.cover).toBe(true)
    expect(config.wording.superlatives).toBe(true)
  })

  it('reads a JSON config', async () => {
    const { dir } = manualDir('manual.config.json', JSON.stringify({ languages: ['th', 'en'], document: { title: 'Guide' }, outputs: { docx: true } }))
    const { config } = await loadConfig(dir)
    expect(config.languages).toEqual(['th', 'en'])
    expect(config.outputs.docx).toBe(true)
  })

  it('reads a TypeScript config (default export)', async () => {
    const { dir } = manualDir(
      'manual.config.ts',
      "const languages: string[] = ['th', 'en']\nexport default { languages, document: { title: { th: 'คู่มือ', en: 'Manual' } }, adapter: { type: 'json-i18n', files: { th: 'th.json', en: 'en.json' } } }\n",
    )
    const { config } = await loadConfig(dir)
    expect(config.adapter.type).toBe('json-i18n')
  })

  it('resolves projectRoot relative to the manual folder', async () => {
    const { dir } = manualDir('manual.config.yaml', 'projectRoot: /opt/app\ndocument: { title: X }\n')
    expect((await loadConfig(dir)).projectRoot).toBe('/opt/app')
  })

  it('rejects an invalid config with the path of every problem', async () => {
    const { dir } = manualDir('manual.config.yaml', 'languages: []\ndocument: {}\nmedia: video\ncapture: { allowlist: [] }\n')
    const err = await loadConfig(dir).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConfigError)
    const msg = (err as Error).message
    expect(msg).toContain('languages')
    expect(msg).toContain('document.title')
    expect(msg).toContain('media')
    expect(msg).toContain('capture.allowlist')
  })

  it('rejects an unknown adapter type', async () => {
    const { dir } = manualDir('manual.config.yaml', 'document: { title: X }\nadapter: { type: rails }\n')
    await expect(loadConfig(dir)).rejects.toThrow(/adapter/)
  })

  it('fails clearly when there is no config file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mk-config-'))
    await expect(loadConfig(root)).rejects.toThrow(/manual\.config\.\(ts\|json\|yaml\)/)
  })

  it('rejects a forbidden-word rule whose pattern is not a valid regex', async () => {
    const { dir } = manualDir('manual.config.yaml', 'document: { title: X }\nwording: { forbidden: [{ pattern: "(", message: m }] }\n')
    await expect(loadConfig(dir)).rejects.toThrow(/wording\.forbidden\.0\.pattern/)
  })
})

describe('hide selectors (they become injected CSS)', () => {
  it('capture.hide refuses a selector that could end the CSS rule, naming the key', async () => {
    for (const [sel, bad] of [['nav } body { display: none', '"}"'], ['.a { color: red', '"{"'], ['.a; b', '";"'], ['.a /* x', '"/*"']]) {
      const { dir } = manualDir('manual.config.yaml', `document: { title: X }\ncapture: { hide: [".ok", ${JSON.stringify(sel)}] }\n`)
      const msg = ((await loadConfig(dir).catch((e: unknown) => e)) as Error).message
      expect(msg).toContain(`capture.hide.1: ${bad} is not allowed in a CSS selector`)
    }
  })

  it('capture.hide refuses a selector that is not valid CSS, and accepts real ones', async () => {
    for (const sel of ['[data-x', '.a)', 'a,,b', '> .a', '.a +', '', '"open', '<div>']) {
      const { dir } = manualDir('manual.config.yaml', `document: { title: X }\ncapture: { hide: [${JSON.stringify(sel)}] }\n`)
      await expect(loadConfig(dir), sel).rejects.toThrow(/capture\.hide\.0: .* is not a valid CSS selector/)
    }
    const ok = ['#__next-build-watcher', '[data-nextjs-toast]', 'div.a > span:not(.b, .c)', '[title="a, b"]', 'a ~ b + c', 'li:nth-child(2n+1)', '.ปุ่ม']
    const { dir } = manualDir('manual.config.yaml', `document: { title: X }\ncapture: { hide: ${JSON.stringify(ok)} }\n`)
    expect((await loadConfig(dir)).config.capture.hide).toEqual(ok)
  })

  it('a hide: in shots.yaml is checked the same way, naming the shot', () => {
    const { dir } = manualDir('shots.yaml', 'shots:\n  home:\n    url: /\n    caption: Home\n    hide: [".chat", "body{display:none"]\n')
    expect(() => loadShots(dir)).toThrow(/shots\.home\.hide\.1: "\{" is not allowed in a CSS selector/)
  })
})

describe('localize', () => {
  it('picks the language, falls back to the primary, accepts plain strings', () => {
    expect(localize({ th: 'ก', en: 'A' }, 'en', 'th')).toBe('A')
    expect(localize({ th: 'ก' }, 'en', 'th')).toBe('ก')
    expect(localize('same', 'en', 'th')).toBe('same')
    expect(localize(undefined, 'en', 'th')).toBe('')
  })
})
