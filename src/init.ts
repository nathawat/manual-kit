// init: scaffold manual/ in a project and fill in the project inputs. Creates only missing files; a config value a
// person set is never changed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import YAML from 'yaml'
import { CONFIG_FILES, ConfigSchema, formatIssues, type AdapterConfig } from './config.ts'
import { LOGIN_NAME, PENDING, fillDocument, loginSpec, mergeAnswers, withAppHost, type Answers } from './inputs.ts'

export const DEFAULT_TITLE = 'คู่มือการใช้งานระบบ'

export interface InitOptions {
  languages: string[]
  title: string
  adapter: AdapterConfig['type']
  /** Write a CI job: github (.github/workflows), gitlab (.gitlab/ci + include), or none. */
  ci: CiProvider | false
  /** Book folder names; the first gets the sample page. Default: user-guide. */
  books?: string[]
  /** Write the sample "about" page (default true). */
  samples?: boolean
  /** The manual folder (absolute); default <projectRoot>/manual. */
  manualDir?: string
  /** Add manual/.gitignore with dist/ (default false: the built documents are committed with the manual). */
  ignoreDist?: boolean
  /** Project inputs (flags and/or an answers file) filled into the config and shots.yaml. */
  answers?: Answers
}

/**
 * The project a manual folder belongs to: the nearest folder above it with .git; else the current folder when the
 * manual is inside it; else the manual's parent folder.
 */
export function findProjectRoot(manualDir: string, cwd = process.cwd()): string {
  const dir = resolve(manualDir)
  for (let d = dirname(dir); ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return d
    if (dirname(d) === d) break
  }
  const here = resolve(cwd)
  return dir.startsWith(here + sep) ? here : dirname(dir)
}

export type CiProvider = 'github' | 'gitlab'

/** `--ci` without a provider: GitLab when the project has .gitlab-ci.yml, else GitHub (also the default). */
export function detectCi(projectRoot: string): CiProvider {
  if (existsSync(join(projectRoot, '.gitlab-ci.yml'))) return 'gitlab'
  return 'github'
}

const BOOK_TITLES: Record<string, Record<string, string>> = {
  'user-guide': { th: 'คู่มือผู้ใช้', en: 'User guide' },
  'admin-guide': { th: 'คู่มือผู้ดูแลระบบ', en: 'Administrator guide' },
  'operations-guide': { th: 'คู่มือการปฏิบัติงานระบบ', en: 'Operations guide' },
}
/** A known book's title per language, or the folder name in words ("teacher-guide" -> "Teacher guide") to edit later. */
const bookTitle = (book: string, lang: string) => {
  const known = BOOK_TITLES[book]?.[lang]
  if (known) return known
  const words = book.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const ABOUT: Record<string, { title: string; body: string }> = {
  th: {
    title: 'เกี่ยวกับคู่มือนี้',
    body: 'คู่มือนี้อธิบายวิธีใช้งานระบบทีละขั้น แต่ละบทเริ่มจากสิ่งที่ผู้อ่านต้องการทำ แล้วพาไปตามหน้าจอจริงของระบบ\n\nเมื่อระบบเปลี่ยน ทีมงานจะปรับคู่มือให้ตรงกันก่อนส่งมอบทุกครั้ง\n',
  },
  en: {
    title: 'About this manual',
    body: 'This manual explains how to use the system step by step. Each chapter starts from what the reader wants to do and follows the real screens.\n\nWhen the system changes, the team updates the manual to match before every delivery.\n',
  },
}

/**
 * CI: installs manual-kit from a pinned source given by the repository variable MANUAL_KIT_SPEC, never from the
 * npm registry by name (manual-kit is not published there; whoever registers the name would run in your CI).
 *   - a release tarball:  https://host/manual-kit-0.2.0.tgz  + MANUAL_KIT_SHA256 (checked before install)
 *   - a git commit:       git+https://github.com/org/manual-kit.git#<full 40-character commit SHA>
 */
export const CI_WORKFLOW = `# Keeps the manual in step with the code: fails when a page's sources changed since it was signed,
# a UI string a page uses disappeared, or a new screen/role has no page.
# Set the repository variable MANUAL_KIT_SPEC (and MANUAL_KIT_SHA256 for a tarball); see the manual-kit README.
name: manual
on: [pull_request]
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    env:
      MANUAL_KIT_SPEC: \${{ vars.MANUAL_KIT_SPEC }}
      MANUAL_KIT_SHA256: \${{ vars.MANUAL_KIT_SHA256 }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - name: Check that manual-kit is pinned
        id: pin
        shell: bash
        run: |
          set -euo pipefail
          spec="\${MANUAL_KIT_SPEC:-}"
          case "$spec" in
            git+https://*#*)
              sha="\${spec##*#}"
              if ! [[ "$sha" =~ ^[0-9a-f]{40}$ ]]; then echo "::error::MANUAL_KIT_SPEC must end with a full 40-character commit SHA"; exit 1; fi
              echo "kind=git" >> "$GITHUB_OUTPUT" ;;
            https://*.tgz)
              if ! [[ "\${MANUAL_KIT_SHA256:-}" =~ ^[0-9a-f]{64}$ ]]; then echo "::error::set MANUAL_KIT_SHA256 (sha256 of the tarball)"; exit 1; fi
              echo "kind=tarball" >> "$GITHUB_OUTPUT" ;;
            *)
              echo "::error::set the repository variable MANUAL_KIT_SPEC to a .tgz URL (with MANUAL_KIT_SHA256) or git+https://...#<commit SHA>; never the npm name"
              exit 1 ;;
          esac
      - name: Install manual-kit
        shell: bash
        run: |
          set -euo pipefail
          mkdir -p "$RUNNER_TEMP/mk" && cd "$RUNNER_TEMP/mk" && npm init -y > /dev/null
          if [ "\${{ steps.pin.outputs.kind }}" = tarball ]; then
            curl -fsSL "$MANUAL_KIT_SPEC" -o manual-kit.tgz
            echo "$MANUAL_KIT_SHA256  manual-kit.tgz" | sha256sum -c -
            npm install --no-audit --no-fund --ignore-scripts ./manual-kit.tgz
          else
            npm install --no-audit --no-fund "$MANUAL_KIT_SPEC"
          fi
      - name: manual-kit check
        # --allow-unsigned: pages waiting for a person to sign are listed, not failed (signing is never done by CI)
        run: '"$RUNNER_TEMP/mk/node_modules/.bin/manual-kit" check --allow-unsigned'
`

export const GITLAB_JOB_FILE = '.gitlab/ci/manual-check.gitlab-ci.yml'
export const GITLAB_INCLUDE = `include:\n  - local: ${GITLAB_JOB_FILE}\n`

/** The GitLab CI equivalent of CI_WORKFLOW: same pin rules (POSIX sh), same install, same check. */
export const GITLAB_JOB = `# Keeps the manual in step with the code (merge requests): fails when a page's sources changed since it was
# signed, a UI string a page uses disappeared, or a new screen/role has no page.
# Set the CI/CD variable MANUAL_KIT_SPEC (and MANUAL_KIT_SHA256 for a tarball); see the manual-kit README.
# Include it from .gitlab-ci.yml:  include: [{ local: ${GITLAB_JOB_FILE} }]
manual-check:
  image: node:24
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - |
      spec="\${MANUAL_KIT_SPEC:-}"
      case "$spec" in
        git+https://*#*)
          echo "\${spec##*#}" | grep -Eq '^[0-9a-f]{40}$' || { echo "MANUAL_KIT_SPEC must end with a full 40-character commit SHA"; exit 1; } ;;
        https://*.tgz)
          echo "\${MANUAL_KIT_SHA256:-}" | grep -Eq '^[0-9a-f]{64}$' || { echo "set MANUAL_KIT_SHA256 (sha256 of the tarball)"; exit 1; } ;;
        *)
          echo "MANUAL_KIT_SPEC must be a .tgz URL (with MANUAL_KIT_SHA256) or git+https://...#<commit SHA>; never the npm name"; exit 1 ;;
      esac
    - |
      MK="\${TMPDIR:-/tmp}/manual-kit-ci"
      mkdir -p "$MK" && cd "$MK" && npm init -y > /dev/null
      case "$MANUAL_KIT_SPEC" in
        https://*)
          curl -fsSL "$MANUAL_KIT_SPEC" -o manual-kit.tgz
          echo "$MANUAL_KIT_SHA256  manual-kit.tgz" | sha256sum -c -
          npm install --no-audit --no-fund --ignore-scripts ./manual-kit.tgz ;;
        *)
          npm install --no-audit --no-fund "$MANUAL_KIT_SPEC" ;;
      esac
      cd "$CI_PROJECT_DIR"
    # --allow-unsigned: pages waiting for a person to sign are listed, not failed (signing is never done by CI)
    - '"$MK/node_modules/.bin/manual-kit" check --allow-unsigned'
  # Optional: also build and keep the documents for review (needs pandoc and Playwright's Chromium in the image).
  # after_script:
  #   - '"$MK/node_modules/.bin/manual-kit" build pdf'
  # artifacts:
  #   when: always
  #   expire_in: 2 weeks
  #   paths: [manual/dist/]
`

/** The config init writes for a new manual (before any answers). */
export function scaffoldConfig(opts: Pick<InitOptions, 'languages' | 'title' | 'adapter'>, books: string[], manualDir: string, projectRoot: string) {
  return {
    projectRoot: relative(manualDir, projectRoot).split(sep).join('/') || '.',
    languages: opts.languages,
    books: Object.fromEntries(books.map((b) => [b, { title: Object.fromEntries(opts.languages.map((l) => [l, bookTitle(b, l)])) }])),
    document: {
      title: opts.title,
      client: '',
      docNumber: '',
      version: '1.0',
      classification: '',
      approvers: [],
      revisions: [],
      purpose: '',
      glossary: [],
      logos: [],
      developer: PENDING,
    },
    outputs: { pdf: true, docx: true, dir: 'dist' },
    media: 'screenshots',
    adapter: { type: opts.adapter, ...(opts.adapter === 'json-i18n' ? { files: Object.fromEntries(opts.languages.map((l) => [l, `locales/${l}.json`])) } : {}), data: {} },
    capture: { baseUrl: 'http://localhost:5173', allowlist: ['localhost', '127.0.0.1'] },
    wording: { superlatives: true, forbidden: [] },
  }
}

const SHOTS_TEMPLATE = `# Screenshots ({{shot:id}}) and step-by-step images ({{steps:id}}).\n# Actions run first, then the highlight is drawn and the image is taken.\n# shots:\n#   sign-in:\n#     url: /login\n#     caption: { th: หน้าเข้าสู่ระบบ, en: The sign-in page }\n#     highlight: "button[type=submit]"\n#     mask: [".email"]\nshots: {}\nsteps: {}\n`

export interface InitResult {
  created: string[]
  existed: string[]
  /** Config keys (and `login`) the answers filled in. */
  filled: string[]
  /** Set when the config is not YAML and the answers could not be written into it. */
  notFilled?: string
}

/**
 * Creates what is missing and fills the answers into manual.config.yaml and shots.yaml. Only blank keys, or keys
 * still at the value init wrote, take an answer: a value a person set is never changed. Running it again converges.
 */
export function initManual(projectRoot: string, opts: InitOptions): InitResult {
  const manualDir = opts.manualDir ?? join(projectRoot, 'manual')
  const manualRel = relative(projectRoot, manualDir).split(sep).join('/')
  const rel = (file: string) => relative(projectRoot, file).split(sep).join('/')
  const created: string[] = []
  const existed: string[] = []
  const filled: string[] = []
  let notFilled: string | undefined
  const answers = withAppHost(opts.answers ?? { config: {} })
  const write = (file: string, text: string) => {
    ;(existsSync(file) ? [] : created).push(rel(file))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
  }

  const found = CONFIG_FILES.map((f) => join(manualDir, f)).find((f) => existsSync(f))
  const configFile = found ?? join(manualDir, 'manual.config.yaml')
  const doc = !found ? undefined : /\.ya?ml$/.test(found) ? YAML.parseDocument(readFileSync(found, 'utf8')) : null
  const current = (doc?.toJS() ?? {}) as { languages?: string[]; books?: object; adapter?: { type?: InitOptions['adapter'] } }
  const languages = current.languages ?? opts.languages
  const books = opts.books?.length ? opts.books : Object.keys(current.books ?? {}).length ? Object.keys(current.books!) : ['user-guide']
  for (const b of books) if (!/^[a-z0-9][a-z0-9-]*$/.test(b)) throw new Error(`book "${b}": use lower-case letters, digits and "-" (it is a folder name)`)

  if (doc === null) {
    existed.push(rel(configFile))
    if (Object.keys(answers.config).length || answers.login) notFilled = `${rel(configFile)} is not YAML: set the answers in it by hand`
  } else {
    const defaults = scaffoldConfig({ languages, title: doc ? DEFAULT_TITLE : opts.title, adapter: current.adapter?.type ?? opts.adapter }, books, manualDir, projectRoot)
    const target = doc ?? YAML.parseDocument(`# manual-kit config. Text fields take a string or { th: ..., en: ... }.\n${YAML.stringify(defaults)}`)
    // a book named on the command line joins the config with its default title
    const bookTitles = Object.fromEntries(books.map((b) => [b, { title: defaults.books[b]!.title }]))
    filled.push(...fillDocument(target, mergeAnswers({ config: { books: bookTitles } }, answers).config, defaults))
    const parsed = ConfigSchema.safeParse(target.toJS())
    if (!parsed.success) throw new Error(`the answers make an invalid config:\n${formatIssues(parsed.error.issues)}`)
    if (!doc || filled.length) write(configFile, target.toString())
    else existed.push(rel(configFile))
  }

  const shotsFile = join(manualDir, 'shots.yaml')
  const shots = YAML.parseDocument(existsSync(shotsFile) ? readFileSync(shotsFile, 'utf8') : SHOTS_TEMPLATE)
  const spec = answers.login && loginSpec(answers.login)
  const addLogin = !!spec && Object.keys((shots.toJS() as { logins?: object } | null)?.logins ?? {}).length === 0
  if (addLogin) {
    shots.setIn(['logins', LOGIN_NAME], spec)
    filled.push('login')
  }
  if (addLogin || !existsSync(shotsFile)) write(shotsFile, shots.toString())
  else existed.push(rel(shotsFile))

  const files: Record<string, string> = opts.ignoreDist ? { 'manual/.gitignore': 'dist/\n' } : {}
  for (const lang of languages) {
    for (const [i, book] of books.entries()) {
      if (i === 0 && opts.samples !== false) {
        const a = ABOUT[lang] ?? ABOUT.en!
        files[`manual/pages/${lang}/${book}/01-about.md`] = `---\nid: about\ntitle: ${YAML.stringify(a.title).trim()}\naudience: []\nbook: ${book}\nkind: concept\nroutes: []\ncovers: []\nsources: []\n---\n${a.body}`
      } else files[`manual/pages/${lang}/${book}/.gitkeep`] = ''
    }
  }
  // the CI job runs in the project: name the manual folder when it is not ./manual
  const inCi = (job: string) => (manualRel === 'manual' ? job : job.replace(/manual-kit" check /g, `manual-kit" -m ${manualRel} check `))
  if (opts.ci === 'github') files['.github/workflows/manual-check.yml'] = inCi(CI_WORKFLOW)
  if (opts.ci === 'gitlab') {
    files[GITLAB_JOB_FILE] = inCi(GITLAB_JOB)
    // an existing .gitlab-ci.yml is never edited: the caller prints the include line instead
    files['.gitlab-ci.yml'] = `# manual-kit: the manual check job\n${GITLAB_INCLUDE}`
  }
  for (const [key, text] of Object.entries(files)) {
    // manual/... goes into the manual folder, everything else (CI) into the project
    const file = key.startsWith('manual/') ? join(manualDir, key.slice('manual/'.length)) : join(projectRoot, key)
    if (existsSync(file)) existed.push(rel(file))
    else write(file, text)
  }
  return { created, existed, filled, ...(notFilled ? { notFilled } : {}) }
}
