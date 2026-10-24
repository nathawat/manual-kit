import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import YAML from 'yaml'
import { describe, expect, it } from 'vitest'
import { runCli } from './helpers/cli.ts'

const empty = () => mkdtempSync(join(tmpdir(), 'mk-init-'))

describe('init', () => {
  it('scaffolds a manual that checks, signs and builds end to end', () => {
    const root = empty()
    const r = runCli(['init', '--languages', 'th,en', '--title', 'คู่มือระบบตัวอย่าง'], root)
    expect(r.code).toBe(0)
    for (const f of ['manual/manual.config.yaml', 'manual/shots.yaml', 'manual/pages/th/user-guide/01-about.md', 'manual/pages/en/user-guide/01-about.md'])
      expect(existsSync(join(root, f)), f).toBe(true)
    // the built documents are committed with the manual by default (README): nothing ignores manual/dist
    expect(existsSync(join(root, 'manual/.gitignore'))).toBe(false)
    expect(r.stdout).toContain('manual-kit check')
    const config = YAML.parse(readFileSync(join(root, 'manual/manual.config.yaml'), 'utf8')) as { document: Record<string, unknown> }
    expect(config.document.title).toBe('คู่มือระบบตัวอย่าง')
    // the formal cover's slots are there to fill in
    expect(config.document.developer).toBe('(รอระบุ)')
    expect(config.document.logos).toEqual([])
    // a new page is unsigned: check fails only on signatures
    const first = JSON.parse(runCli(['check', '--json'], root).stdout) as { findings: { rule: string }[] }
    expect([...new Set(first.findings.map((f) => f.rule))]).toEqual(['signature'])
    expect(runCli(['sign', '--all'], root).code).toBe(0)
    expect(runCli(['check'], root).code).toBe(0)
    expect(runCli(['build', 'pdf', '--lang', 'th'], root).code).toBe(0)
    expect(existsSync(join(root, 'manual/dist/user-guide.th.pdf'))).toBe(true)
  })

  it('--ignore-dist keeps manual/dist out of git', () => {
    const root = empty()
    expect(runCli(['init', '--ignore-dist'], root).code).toBe(0)
    expect(readFileSync(join(root, 'manual/.gitignore'), 'utf8')).toBe('dist/\n')
  })

  it('points projectRoot at the project, however deep the manual folder is', () => {
    const root = empty()
    expect(runCli(['init', '-m', 'docs/manual', '--ci', 'github'], root).code).toBe(0)
    const cfg = (dir: string) => (YAML.parse(readFileSync(join(dir, 'manual.config.yaml'), 'utf8')) as { projectRoot: string }).projectRoot
    expect(cfg(join(root, 'docs/manual'))).toBe('../..')
    // the CI job lives in the project and checks the manual where it is
    expect(readFileSync(join(root, '.github/workflows/manual-check.yml'), 'utf8')).toContain('manual-kit" -m docs/manual check --allow-unsigned')
    expect(existsSync(join(root, 'docs/.github'))).toBe(false)
    // from inside a subfolder of a git repository: the repository is the project
    const repo = empty()
    mkdirSync(join(repo, '.git'))
    mkdirSync(join(repo, 'docs'))
    expect(runCli(['init', '-m', 'guide'], join(repo, 'docs')).code).toBe(0)
    expect(cfg(join(repo, 'docs/guide'))).toBe('../..')
    // discover before init scans the same project root, not the manual's parent
    const fresh = empty()
    mkdirSync(join(fresh, '.git'))
    writeFileSync(join(fresh, 'README.md'), '# Shop\n')
    expect(runCli(['-m', 'docs/manual', 'discover'], fresh).code).toBe(0)
    const d = JSON.parse(readFileSync(join(fresh, 'docs/manual/discovery.json'), 'utf8')) as { docs: { path: string }[] }
    expect(d.docs.map((x) => x.path)).toContain('README.md')
  })

  it('is idempotent: existing files are kept and a value a person set is never changed', () => {
    const root = empty()
    runCli(['init'], root)
    const config = join(root, 'manual/manual.config.yaml')
    const page = readFileSync(join(root, 'manual/pages/th/user-guide/01-about.md'), 'utf8')
    writeFileSync(config, readFileSync(config, 'utf8').replace('title: คู่มือการใช้งานระบบ', 'title: Mine'))
    const before = readFileSync(config, 'utf8')
    const r = runCli(['init', '--title', 'Other'], root)
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/exists manual\/manual\.config\.yaml/)
    expect(readFileSync(config, 'utf8')).toBe(before)
    expect(readFileSync(join(root, 'manual/pages/th/user-guide/01-about.md'), 'utf8')).toBe(page)
  })

  it('fills every project input from an answers file and flags, and the checklist lists only what is left', () => {
    const root = empty()
    const first = runCli(['init', '--books', 'staff-guide'], root)
    expect(first.code).toBe(0)
    const keys = (out: string) => [...out.matchAll(/^ {2}- ([^:]+):/gm)].map((m) => m[1])
    const missing = (out: string) => keys(out.slice(out.indexOf('Still missing'), out.indexOf('Confirm:')))
    expect(missing(first.stdout)).toEqual([
      'books.staff-guide.audience',
      'books.staff-guide.description',
      'books.staff-guide.icon',
      'capture.baseUrl',
      'capture.environment',
      'login',
      'document.client',
      'document.developer',
      'web.brand.name',
      'document.logos',
      'document.coverImage',
      'web.brand.colors.brand',
    ])
    mkdirSync(join(root, 'manual/assets'))
    for (const f of ['seal.png', 'logo.svg', 'cover.webp']) writeFileSync(join(root, 'manual/assets', f), '')
    writeFileSync(
      join(root, 'answers.yaml'),
      YAML.stringify({
        books: { 'staff-guide': { audience: 'Staff', description: 'Daily tasks', icon: 'assets/staff.png' } },
        capture: { baseUrl: 'https://staging.example.com', environment: 'staging' },
        document: { client: 'Example Org', developer: 'Example Co', logos: ['assets/seal.png', 'assets/logo.svg'], coverImage: 'assets/cover.webp' },
        web: { brand: { name: 'Example System' } },
        login: { type: 'form', userEnv: 'MANUAL_USER', passwordEnv: 'MANUAL_PASSWORD' },
      }),
    )
    const r = runCli(['init', '--answers', 'answers.yaml', '--brand-color', '#0d2470', '--outputs', 'pdf,web,video', '--redact', 'email,thai-name'], root)
    expect(r.code).toBe(0)
    // the icon file does not exist yet: the checklist says so instead of treating the path as an answer
    expect(missing(r.stdout)).toEqual(['books.staff-guide.icon'])
    expect(r.stdout).toContain('books.staff-guide.icon: file not found: assets/staff.png')
    expect(r.stdout).toMatch(/- outputs: pdf, web, video /)
    const cfg = YAML.parse(readFileSync(join(root, 'manual/manual.config.yaml'), 'utf8'))
    expect(cfg.capture).toMatchObject({ baseUrl: 'https://staging.example.com', environment: 'staging', allowlist: ['localhost', '127.0.0.1', 'staging.example.com'], redact: { presets: ['email', 'thai-name'] } })
    expect(cfg.document).toMatchObject({ client: 'Example Org', developer: 'Example Co', coverImage: 'assets/cover.webp' })
    expect(cfg.web.brand).toEqual({ name: 'Example System', colors: { brand: '#0d2470' } })
    expect(cfg.outputs).toMatchObject({ pdf: true, docx: false, web: true })
    expect(cfg.media).toBe('steps+video')
    // only the variable names reach shots.yaml, and capture can use the login
    const shots = readFileSync(join(root, 'manual/shots.yaml'), 'utf8')
    expect(YAML.parse(shots).logins.main.actions.map((a: { value?: string }) => a.value).filter(Boolean)).toEqual(['{env:MANUAL_USER}', '{env:MANUAL_PASSWORD}'])
    expect(runCli(['check', '--json'], root).code).not.toBe(2)
    // running it again changes nothing
    const config = readFileSync(join(root, 'manual/manual.config.yaml'), 'utf8')
    const again = runCli(['init', '--answers', 'answers.yaml', '--client', 'Someone else'], root)
    expect(again.stdout).not.toMatch(/^filled/m)
    expect(readFileSync(join(root, 'manual/manual.config.yaml'), 'utf8')).toBe(config)
    expect(readFileSync(join(root, 'manual/shots.yaml'), 'utf8')).toBe(shots)
  })

  it('takes environment variable names for the login, never the values', () => {
    const root = empty()
    writeFileSync(join(root, 'answers.yaml'), YAML.stringify({ login: { type: 'form', userEnv: 'MANUAL_USER', passwordEnv: 'MANUAL_PASSWORD', password: 'secret' } }))
    const r = runCli(['init', '--answers', 'answers.yaml'], root)
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/login/)
    expect(existsSync(join(root, 'manual'))).toBe(false)
    expect(runCli(['init', '--login', 'form', '--user-env', 'my password', '--password-env', 'P'], empty()).stderr).toMatch(/environment variable name/)
    const cookie = empty()
    expect(runCli(['init', '--login', 'cookie', '--cookie', 'session', '--cookie-env', 'APP_SESSION', '--app-url', 'https://uat.example.com/app'], cookie).code).toBe(0)
    const spec = YAML.parse(readFileSync(join(cookie, 'manual/shots.yaml'), 'utf8')).logins.main
    expect(spec.storage.cookies).toEqual([{ name: 'session', value: '{env:APP_SESSION}', path: '/' }])
  })

  it('refuses answers that make an invalid config and writes nothing', () => {
    const root = empty()
    const r = runCli(['init', '--brand-color', 'blue'], root)
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/web\.brand\.colors\.brand/)
    expect(existsSync(join(root, 'manual/manual.config.yaml'))).toBe(false)
  })

  it('without --ci prints no CI job and writes none; it says how to add one', () => {
    const root = empty()
    const r = runCli(['init', '--no-samples', '--languages', 'th', '--books', 'guide', '--adapter', 'generic', '--title', 'Manual'], root)
    expect(r.code).toBe(0)
    expect(r.stdout).not.toMatch(/runs-on|actions\/checkout|on:\s*\n|manual-check\.yml/)
    expect(r.stdout).toContain('manual-kit init --ci')
    expect(existsSync(join(root, '.github'))).toBe(false)
    expect(existsSync(join(root, '.gitlab'))).toBe(false)
  })

  it('--ci writes a workflow that installs manual-kit only from a pinned source, never by npm name', () => {
    const root = empty()
    runCli(['init', '--ci'], root)
    const text = readFileSync(join(root, '.github/workflows/manual-check.yml'), 'utf8')
    expect(text).not.toMatch(/npx manual-kit|npm (i|install) [^\n]*\bmanual-kit\b(?!\.tgz)/)
    const wf = YAML.parse(text) as { permissions: unknown; jobs: { check: { steps: { name?: string; run?: string }[] } } }
    expect(wf.permissions).toEqual({ contents: 'read' })
    const steps = wf.jobs.check.steps
    expect(steps.at(-1)!.run).toContain('manual-kit" check --allow-unsigned')
    // the pin check accepts a commit-pinned git URL or a tarball with its hash, and refuses everything else
    const pin = steps.find((s) => s.name === 'Check that manual-kit is pinned')!.run!
    const run = (env: Record<string, string>) =>
      spawnSync('bash', ['-c', pin], { env: { PATH: process.env.PATH!, GITHUB_OUTPUT: join(root, 'out.txt'), ...env }, encoding: 'utf8' }).status
    expect(run({ MANUAL_KIT_SPEC: '' })).toBe(1)
    expect(run({ MANUAL_KIT_SPEC: 'manual-kit' })).toBe(1)
    expect(run({ MANUAL_KIT_SPEC: 'git+https://github.com/org/manual-kit.git#main' })).toBe(1)
    expect(run({ MANUAL_KIT_SPEC: `git+https://github.com/org/manual-kit.git#${'a'.repeat(40)}` })).toBe(0)
    expect(run({ MANUAL_KIT_SPEC: 'https://example.com/manual-kit-0.2.0.tgz' })).toBe(1)
    expect(run({ MANUAL_KIT_SPEC: 'https://example.com/manual-kit-0.2.0.tgz', MANUAL_KIT_SHA256: 'b'.repeat(64) })).toBe(0)
  })

  it('--ci gitlab writes an equivalent GitLab job (pinned install, check --allow-unsigned) and includes it from a new .gitlab-ci.yml', () => {
    const root = empty()
    const r = runCli(['init', '--ci', 'gitlab'], root)
    expect(r.code).toBe(0)
    expect(existsSync(join(root, '.github'))).toBe(false)
    const text = readFileSync(join(root, '.gitlab/ci/manual-check.gitlab-ci.yml'), 'utf8')
    expect(text).not.toMatch(/npx manual-kit|npm (i|install) [^\n]*\bmanual-kit\b(?!\.tgz)/)
    const job = (YAML.parse(text) as Record<string, { image: string; script: string[]; rules: unknown[]; artifacts?: unknown }>)['manual-check']!
    expect(job.image).toMatch(/^node:24/)
    expect(job.rules).toEqual([{ if: '$CI_PIPELINE_SOURCE == "merge_request_event"' }])
    const script = job.script.join('\n')
    expect(script).toContain('sha256sum -c')
    expect(script).toMatch(/manual-kit" check --allow-unsigned/)
    expect(text).toMatch(/# *artifacts:/) // optional, commented out
    expect(YAML.parse(readFileSync(join(root, '.gitlab-ci.yml'), 'utf8'))).toEqual({ include: [{ local: '.gitlab/ci/manual-check.gitlab-ci.yml' }] })
    // the same pin rules as the GitHub workflow, in POSIX sh (GitLab runs the script with sh or bash)
    const pin = job.script.find((l) => l.includes('MANUAL_KIT_SPEC must'))!
    const run = (env: Record<string, string>) => spawnSync('sh', ['-c', pin], { env: { PATH: process.env.PATH!, ...env }, encoding: 'utf8' }).status
    expect(run({ MANUAL_KIT_SPEC: '' })).not.toBe(0)
    expect(run({ MANUAL_KIT_SPEC: 'manual-kit' })).not.toBe(0)
    expect(run({ MANUAL_KIT_SPEC: 'git+https://github.com/org/manual-kit.git#main' })).not.toBe(0)
    expect(run({ MANUAL_KIT_SPEC: `git+https://github.com/org/manual-kit.git#${'a'.repeat(40)}` })).toBe(0)
    expect(run({ MANUAL_KIT_SPEC: 'https://example.com/manual-kit-0.2.0.tgz' })).not.toBe(0)
    expect(run({ MANUAL_KIT_SPEC: 'https://example.com/manual-kit-0.2.0.tgz', MANUAL_KIT_SHA256: 'b'.repeat(64) })).toBe(0)
  })

  it('--ci without a provider detects .gitlab-ci.yml (keeps it, prints the include) or .github; default github', () => {
    const gl = empty()
    writeFileSync(join(gl, '.gitlab-ci.yml'), 'stages: [test]\n')
    const r = runCli(['init', '--ci'], gl)
    expect(r.code).toBe(0)
    expect(existsSync(join(gl, '.gitlab/ci/manual-check.gitlab-ci.yml'))).toBe(true)
    expect(readFileSync(join(gl, '.gitlab-ci.yml'), 'utf8')).toBe('stages: [test]\n')
    expect(r.stdout).toMatch(/add to \.gitlab-ci\.yml:[\s\S]*local: \.gitlab\/ci\/manual-check\.gitlab-ci\.yml/)
    const gh = empty()
    mkdirSync(join(gh, '.github'))
    runCli(['init', '--ci'], gh)
    expect(existsSync(join(gh, '.github/workflows/manual-check.yml'))).toBe(true)
    const none = empty()
    runCli(['init', '--ci'], none)
    expect(existsSync(join(none, '.github/workflows/manual-check.yml'))).toBe(true)
    expect(runCli(['init', '--ci', 'jenkins'], empty()).code).not.toBe(0)
  })

  it('--books creates every book; a book without pages warns in check and build instead of being skipped silently', () => {
    const root = empty()
    expect(runCli(['init', '--books', 'user-guide,admin-guide'], root).code).toBe(0)
    const cfg = YAML.parse(readFileSync(join(root, 'manual/manual.config.yaml'), 'utf8')) as { books: Record<string, { title: Record<string, string> }> }
    expect(Object.keys(cfg.books)).toEqual(['user-guide', 'admin-guide'])
    expect(cfg.books['admin-guide']!.title).toEqual({ th: 'คู่มือผู้ดูแลระบบ', en: 'Administrator guide' })
    expect(existsSync(join(root, 'manual/pages/th/admin-guide'))).toBe(true)
    runCli(['sign', '--all'], root)
    const report = JSON.parse(runCli(['check', '--json'], root).stdout) as { ok: boolean; findings: { rule: string; severity: string; message: string }[] }
    expect(report.ok).toBe(true)
    expect(report.findings.filter((f) => f.rule === 'book').map((f) => [f.severity, f.message])).toEqual([
      ['warning', 'book "admin-guide" has no pages in th: it will not be built'],
      ['warning', 'book "admin-guide" has no pages in en: it will not be built'],
    ])
    const b = runCli(['build', 'pdf', '--lang', 'th'], root)
    expect(b.code).toBe(0)
    expect(b.stderr).toMatch(/WARNING: book "admin-guide" has no pages in th: not built/)
  })

  it('--no-samples writes no pages; check warns for every empty book and build says there is nothing to build', () => {
    const root = empty()
    expect(runCli(['init', '--no-samples', '--languages', 'th'], root).code).toBe(0)
    expect(existsSync(join(root, 'manual/pages/th/user-guide/01-about.md'))).toBe(false)
    expect(existsSync(join(root, 'manual/pages/th/user-guide'))).toBe(true)
    const report = JSON.parse(runCli(['check', '--json'], root).stdout) as { findings: { rule: string }[] }
    expect(report.findings.map((f) => f.rule)).toEqual(['book'])
    const b = runCli(['build', 'pdf'], root)
    expect(b.code).toBe(2)
    expect(b.stderr).toMatch(/WARNING: book "user-guide" has no pages in th/)
    expect(b.stderr).toMatch(/nothing to build/)
  })
})

