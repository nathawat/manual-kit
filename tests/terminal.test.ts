import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ansiToHtml, parseTranscript, terminalHtml } from '../src/terminal.ts'
import { runCliAsync } from './helpers/cli.ts'
import { cleanFixture } from './helpers/fixture.ts'
import { countColor } from './helpers/png.ts'
import { serveStatic } from './helpers/server.ts'

const ESC = '\u001b'
const TRANSCRIPT = [
  `${ESC}[2mWelcome to the demo shell${ESC}[0m`,
  '$ claude plugin marketplace add git@example.com:team/manual-kit.git',
  'Adding marketplace…',
  `${ESC}[32m✔ Successfully added marketplace: manual-kit${ESC}[0m`,
  '$ claude plugin install manual-kit@manual-kit',
  `${ESC}[1;32m✔${ESC}[0m Installed manual-kit <1.0> & ready (ติดตั้งแล้ว)`,
].join('\n')

describe('transcript parsing', () => {
  it('splits a transcript into a preamble and command blocks with their output and file line numbers', () => {
    const t = parseTranscript(TRANSCRIPT, '$ ')
    expect(t.blocks.map((b) => b.command)).toEqual([undefined, 'claude plugin marketplace add git@example.com:team/manual-kit.git', 'claude plugin install manual-kit@manual-kit'])
    expect(t.blocks.map((b) => b.output.map((l) => l.n))).toEqual([[1], [3, 4], [6]])
    expect(t.blocks[1]!.line).toBe(2)
  })

  it('a transcript without a preamble has no empty block 0, and the prompt is configurable', () => {
    const t = parseTranscript('> /manual ทำคู่มือ\nกำลังสแกน', '> ')
    expect(t.blocks).toHaveLength(2)
    expect(t.blocks[0]!.output).toEqual([])
    expect(t.blocks[1]!.command).toBe('/manual ทำคู่มือ')
  })

  it('turns ANSI colours into spans, escapes text exactly once and drops other escape sequences', () => {
    expect(ansiToHtml(`${ESC}[32mok${ESC}[0m <b> & "q"`)).toBe('<span class="fg-2">ok</span> &lt;b&gt; &amp; &quot;q&quot;')
    expect(ansiToHtml(`${ESC}[1;31mfail${ESC}[39m!${ESC}[0m`)).toBe('<span class="b fg-1">fail</span><span class="b">!</span>')
    expect(ansiToHtml(`${ESC}[38;5;208mx${ESC}[0m${ESC}[38;2;10;20;30my${ESC}[0m`)).toBe('<span style="color:#ff8700">x</span><span style="color:#0a141e">y</span>')
    expect(ansiToHtml(`a${ESC}[2K${ESC}[1Gb${ESC}]0;title\u0007c\r`)).toBe('abc')
    expect(ansiToHtml(`${ESC}[90mdim${ESC}[0m`)).toBe('<span class="fg-8">dim</span>')
  })

  it('renders a window with title, badge, numbered lines and command blocks', () => {
    const html = terminalHtml(parseTranscript(TRANSCRIPT, '$ '), { title: 'zsh — demo', badge: 'ตัวอย่าง', prompt: '$ ' })
    expect(html).toContain('<span class="mk-term-title">zsh — demo</span>')
    expect(html).toContain('<span class="mk-term-badge">ตัวอย่าง</span>')
    expect(html).toMatch(/<div class="mk-cmd" data-cmd="2" data-line="5"><span class="mk-prompt">\$ <\/span>claude plugin install manual-kit@manual-kit<\/div>/)
    expect(html).toContain('data-line="4"')
    expect(html).toContain('&lt;1.0&gt; &amp; ready')
    expect(html).not.toContain('&amp;lt;')
  })
})

describe('terminal shots, steps and clips', () => {
  let server: Awaited<ReturnType<typeof serveStatic>>
  beforeAll(async () => {
    server = await serveStatic(join(__dirname, 'fixtures/project/site'))
  })
  afterAll(() => server.close())

  const SHOTS = `
  install-term:
    terminal: { file: terminal/install.txt, title: "zsh — demo", badge: { th: ตัวอย่าง, en: Example } }
    caption: { th: "ติดตั้ง", en: "Install" }
    highlight: '[data-line="4"]'
`
  async function project(media = 'screenshots') {
    const root = await cleanFixture()
    rmSync(join(root, 'manual/media'), { recursive: true })
    mkdirSync(join(root, 'manual/terminal'))
    writeFileSync(join(root, 'manual/terminal/install.txt'), TRANSCRIPT)
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('http://127.0.0.1:4599', server.url).replace('media: screenshots', `media: ${media}`))
    const shots = join(root, 'manual/shots.yaml')
    writeFileSync(shots, readFileSync(shots, 'utf8').replace('shots:\n', `shots:\n${SHOTS.slice(1)}`))
    return root
  }
  const size = (file: string) => {
    const b = readFileSync(file)
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  }

  it('captures a transcript as a terminal window image with the highlight frame; check and shotlist know it', async () => {
    const root = await project()
    const r = await runCliAsync(['capture'], root)
    expect(r.stderr).toBe('')
    expect(r.stdout).toMatch(/captured 4/)
    const png = join(root, 'manual/media/th/install-term.png')
    const s = size(png)
    expect(s.width).toBe(960)
    expect(s.height).toBeGreaterThan(120)
    expect(s.height).toBeLessThan(500) // the window, not the whole viewport
    expect(countColor(png, [209, 36, 47])).toBeGreaterThan(200)
    expect((await runCliAsync(['shotlist'], root)).stdout).toContain('- Terminal: terminal/install.txt')
    // editing the transcript makes the image stale
    writeFileSync(join(root, 'manual/terminal/install.txt'), `${TRANSCRIPT}\n$ claude plugin list`)
    const pageFile = join(root, 'manual/pages/th/user-guide/01-sign-in.md')
    writeFileSync(pageFile, `${readFileSync(pageFile, 'utf8')}\n{{shot:install-term}}\n`)
    const check = await runCliAsync(['check', '--allow-unsigned'], root)
    expect(check.stdout).toMatch(/shot "install-term" \(th\) spec changed since capture/)
    // a missing transcript is an error
    rmSync(join(root, 'manual/terminal/install.txt'))
    expect((await runCliAsync(['check', '--allow-unsigned'], root)).stdout).toMatch(/terminal transcript "terminal\/install.txt" .*does not exist/)
  })

  it('steps reveal the session command by command with { show }', async () => {
    const root = await project('steps')
    const shots = join(root, 'manual/shots.yaml')
    writeFileSync(
      shots,
      `${readFileSync(shots, 'utf8')}
  install-steps:
    terminal: { file: terminal/install.txt }
    steps:
      - { text: "Add", actions: [{ show: 1 }], highlight: '[data-cmd="1"]' }
      - { text: "Install", actions: [{ show: 2, output: false }] }
      - { text: "Done", actions: [{ show: 2 }] }
`,
    )
    const r = await runCliAsync(['capture'], root)
    expect(r.stderr).toBe('')
    const h = [1, 2, 3].map((n) => size(join(root, `manual/media/en/install-steps-${n}.png`)).height)
    expect(h[0]).toBeLessThan(h[1]!)
    expect(h[1]).toBeLessThan(h[2]!)
  })

  it('a { show } action outside a terminal spec is refused', async () => {
    const root = await project()
    const shots = join(root, 'manual/shots.yaml')
    writeFileSync(shots, readFileSync(shots, 'utf8').replace('highlight: "#submit"', 'highlight: "#submit"\n    actions: [{ show: 1 }]'))
    const r = await runCliAsync(['capture'], root)
    expect(`${r.stdout}${r.stderr}`).toMatch(/"show" works only in a terminal spec/)
  })

  it('a clip of a terminal fills its viewport on every frame', async () => {
    const root = await project('steps+video')
    const shots = join(root, 'manual/shots.yaml')
    writeFileSync(
      shots,
      `${readFileSync(shots, 'utf8')}
clips:
  install-clip:
    terminal: { file: terminal/install.txt }
    viewport: { width: 800, height: 450 }
    caption: "Install"
    segments:
      - { caption: "Add the marketplace", actions: [{ show: 1, output: false }, { show: 1 }] }
      - { caption: "Install the plugin", actions: [{ show: 2 }], highlight: '[data-line="6"]' }
`,
    )
    const r = await runCliAsync(['capture'], root)
    expect(r.stderr).toBe('')
    const t = JSON.parse(readFileSync(join(root, 'manual/media/th/clips/install-clip/timeline.json'), 'utf8')) as { width: number; height: number; frames: { file: string }[] }
    expect([t.width, t.height]).toEqual([800, 450])
    expect(t.frames.length).toBe(6) // start, 2 actions + end, 1 action + end
    for (const f of t.frames) expect(size(join(root, 'manual/media/th/clips/install-clip', f.file))).toEqual({ width: 800, height: 450 })
  })

  it('a spec needs exactly one of url and terminal', async () => {
    const root = await project()
    const shots = join(root, 'manual/shots.yaml')
    writeFileSync(shots, readFileSync(shots, 'utf8').replace('    terminal: { file: terminal/install.txt, title', '    url: /x.html\n    terminal: { file: terminal/install.txt, title'))
    expect((await runCliAsync(['check', '--allow-unsigned'], root)).stdout).toMatch(/url or terminal/)
  })
})
