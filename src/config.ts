// manual.config.(ts|json|yaml) -> typed ManualConfig. All validation of the config happens here (boundary);
// the rest of the tool trusts the parsed type.
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import YAML from 'yaml'
import { z } from 'zod'

export class ConfigError extends Error {
  override name = 'ConfigError'
}

/** A language code such as `th` or `en`. */
const Lang = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)?$/, 'language code like "th" or "en"')
/** Text that is either the same in every language or given per language. */
export const Localized = z.union([z.string(), z.record(Lang, z.string())])
export type Localized = z.infer<typeof Localized>

const Regex = z.string().refine(
  (s) => {
    try {
      new RegExp(s)
      return true
    } catch {
      return false
    }
  },
  { message: 'not a valid regular expression' },
)

/** Extra RegExp flags (`g` is always on): any of `i m s u v y d`, e.g. `m` so `^`/`$` match at line ends. */
const RegexFlags = z.string().regex(/^[imsuvyd]*$/, 'regex flags: any of i m s u v y d (g is always on)').optional()

const Color = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'a colour like #0d2470')

/** Where to find one kind of item with a regex (group 1 or a named group). */
const Extract = z.object({ files: z.array(z.string()).min(1), pattern: Regex, flags: RegexFlags })

/** `{{data:ns.path}}` reads `ns` from a JSON/YAML file in the project (path relative to projectRoot). */
const DataFiles = z.record(z.string(), z.string()).default({})

/**
 * Named UI regions inside a route (wizard steps, drawers, modals) that need their own coverage item `section:<id>`.
 * `component`: the item exists while a component of that name is defined in the source (a file or a function/const);
 * `selector`: a CSS selector (not checked against the code, it only names the region).
 */
const Section = z
  .object({
    id: z.string().regex(/^[\w.-]+$/, 'letters, digits, . _ -'),
    route: z.string().optional(),
    label: z.string().optional(),
    component: z.string().regex(/^[A-Za-z_$][\w$]*$/, 'a component name').optional(),
    selector: z.string().min(1).optional(),
  })
  .refine((s) => s.component || s.selector, { message: 'a section needs component or selector' })
const Sections = z.array(Section).default([])

const Common = { roles: Extract.optional(), flags: Extract.optional(), sections: Sections, data: DataFiles }

const GenericAdapter = z.object({
  type: z.literal('generic'),
  strings: z.record(Lang, z.object({ files: z.array(z.string()).min(1), pattern: Regex, flags: RegexFlags })).default({}),
  routes: Extract.optional(),
  ...Common,
})
const JsonI18nAdapter = z.object({
  type: z.literal('json-i18n'),
  files: z.record(Lang, z.string()),
  routes: Extract.optional(),
  ...Common,
})
/**
 * UI strings for nextjs/nuxt/react-spa: `i18n` = { lang: file } (JSON/YAML), or auto-detected (locales/, i18n/,
 * i18n/locales/, messages/ with <lang>.json|yaml|yml), or false. Without i18n files: text literals in JSX / Vue
 * templates (`strings.files`), the label is its own key and serves every language; `literals: all` adds every string
 * literal.
 */
const FrameworkStrings = z
  .object({ files: z.array(z.string()).min(1).optional(), literals: z.enum(['ui', 'all']).default('ui') })
  .prefault({})
const I18nFiles = z.union([z.record(Lang, z.string()), z.literal(false)]).optional()
const NextjsAdapter = z.object({ type: z.literal('nextjs'), i18n: I18nFiles, strings: FrameworkStrings, ...Common })
/** Nuxt routes the static scan cannot see (built at run time); `discover` notes name each one it skipped. */
const ExtraRoutes = z.array(z.string().startsWith('/', 'a route path starting with /')).default([])
const NuxtAdapter = z.object({ type: z.literal('nuxt'), i18n: I18nFiles, strings: FrameworkStrings, extraRoutes: ExtraRoutes, ...Common })
/**
 * Routes for react-spa: `files` are searched for <Route> elements and route objects (default `src/**` JS/TS), `dir`
 * holds TanStack Router file routes (default `src/routes`, false for none).
 */
const SpaRoutes = z
  .object({ files: z.array(z.string()).min(1).optional(), dir: z.union([z.string().min(1), z.literal(false)]).optional() })
  .prefault({})
const ReactSpaAdapter = z.object({ type: z.literal('react-spa'), routes: SpaRoutes, i18n: I18nFiles, strings: FrameworkStrings, ...Common })
const NoAdapter = z.object({ type: z.literal('none'), sections: Sections, data: DataFiles })
export const AdapterConfig = z.discriminatedUnion('type', [GenericAdapter, JsonI18nAdapter, NextjsAdapter, NuxtAdapter, ReactSpaAdapter, NoAdapter])
export type AdapterConfig = z.infer<typeof AdapterConfig>

const FontFace = z.object({
  family: z.string().min(1),
  files: z
    .object({ regular: z.string().optional(), bold: z.string().optional(), italic: z.string().optional(), boldItalic: z.string().optional() })
    .default({}),
})

const Person = z.object({ name: Localized, role: Localized })
/**
 * Why `s` cannot be a CSS selector list, or undefined. Braces, semicolons and comments would end the rule the selector
 * is put in (and start another), so they are refused outright; the rest is a structural check (balanced brackets and
 * quotes, no empty list entry, no dangling combinator).
 */
function selectorProblem(s: string): string | undefined {
  const cut = /[{};]|\/\*|\*\//.exec(s)?.[0]
  if (cut) return `"${cut}" is not allowed in a CSS selector`
  const invalid = `"${s}" is not a valid CSS selector`
  const closers: string[] = []
  const parts: string[] = []
  let quote = ''
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (c === '\\') i++
    else if (quote) quote = c === quote ? '' : quote
    else if (c === '"' || c === "'") quote = c
    else if (c === '(' || c === '[') closers.push(c === '(' ? ')' : ']')
    else if (c === ')' || c === ']') {
      if (closers.pop() !== c) return invalid
    } else if (c === ',' && !closers.length) {
      parts.push(s.slice(start, i))
      start = i + 1
    } else if ('<@!/'.includes(c)) return invalid
  }
  if (quote || closers.length) return invalid
  parts.push(s.slice(start))
  if (parts.some((p) => !p.trim() || /^\s*[>+~]|[>+~]\s*$/.test(p))) return invalid
  return undefined
}
/** A CSS selector that is put into injected CSS (capture.hide, a spec's hide): checked here, at load. */
export const CssSelector = z.string().superRefine((s, ctx) => {
  const problem = selectorProblem(s)
  if (problem) ctx.addIssue({ code: 'custom', message: problem })
})

const Revision = z.object({ version: z.string(), date: z.string(), author: Localized.default(''), changes: Localized })

/** Development overlays that must never appear in a manual's screenshots. */
export const DEV_OVERLAYS = [
  'nextjs-portal', // Next.js dev indicator, error overlay and toasts
  '#__next-build-watcher',
  '[data-nextjs-toast]',
  'vite-error-overlay',
  '#webpack-dev-server-client-overlay',
  '#nuxt-devtools-container',
  '#__nuxt-devtools-container',
  '#__vue-devtools-container__',
  '#vue-devtools-anchors',
  'astro-dev-toolbar',
  '#svelte-inspector-host',
  '#react-refresh-overlay',
]

/**
 * Loading indicators capture waits to disappear before each image. A progress bar with a value is real content, so
 * only indeterminate ones count.
 */
export const SPINNERS = [
  '[aria-busy="true"]',
  '[role="progressbar"]:not([aria-valuenow])',
  'progress:not([value])',
  '.spinner',
  '.loading',
  '.ant-spin-spinning',
  '.MuiCircularProgress-root',
  '.animate-spin',
]

/**
 * Text patterns `capture.redact.presets` names. Each is matched against one text node (or an input's value), so a name
 * split across elements is not found. The name presets match a whole text node and can catch a two-word label
 * ("Sign In"); check the images, or write your own `text` patterns.
 */
export const REDACT_PRESETS = {
  email: String.raw`[\w.+-]+@[\w-]+(?:\.[\w-]+)+`,
  'thai-name': String.raw`^(?!.*(?:ระบบ|หนังสือ|หน่วยงาน|มหาวิทยาลัย|สำนัก|คณะ|ข้อมูล|สถานะ|ประเภท|เอกสาร|ทั้งหมด|เลือก|ค้นหา|ยืนยัน|ยกเลิก|บันทึก|แก้ไข|เพิ่ม|ลบ|ส่ง|รับ|หน้า|การ))\s*(?:นาย|นางสาว|นาง|ดร\.|ผศ\.|รศ\.|ศ\.)?\s?[ก-๙]{2,15}\s+[ก-๙]{2,20}\s*$`,
  'latin-name': String.raw`^\s*[A-Z][a-z]+(?: [A-Z][a-z]+){1,2}\s*$`,
} as const

export const ConfigSchema = z.object({
  /** Project root (code the adapter reads, sources hashed). Relative to the manual folder. */
  projectRoot: z.string().default('..'),
  /** First language is the primary one. */
  languages: z.array(Lang).min(1).default(['th']),
  books: z
    .record(
      z.string(),
      z.object({
        title: Localized,
        /** The book's picture (PNG/SVG/WebP, relative to the manual folder): next to the book name on the formal PDF
         * cover and in the middle of the title cards of this book's clips. */
        icon: z.string().optional(),
        /** Who the book is for, as an eyebrow on its card on the web front page ("For <audience>"). */
        audience: Localized.optional(),
        /** One or two sentences on what the book covers, on its card on the web front page. */
        description: Localized.optional(),
        /** `publish outline`: title of the book's wiki document (default: "<document.title>: <title>"). */
        outline: z.object({ title: Localized.optional() }).optional(),
        /**
         * Page groups (front matter `group`) in the order the app's own menu shows them, with their titles (over
         * web.groups). Sets the order of the web sidebar and of the PDF/DOCX chapters; groups not listed come after.
         */
        groups: z
          .array(z.object({ id: z.string().min(1), title: Localized, icon: z.string().optional() }).strict())
          .refine((g) => new Set(g.map((x) => x.id)).size === g.length, { message: 'a group id is listed twice' })
          .optional(),
        /**
         * A role book: no pages folder of its own; its chapters are the pages of `book` (in that book's order) whose
         * front matter `audience` names one of `audience`, plus the pages with no audience (for everyone). It builds
         * PDF and DOCX only; the source book's web site links them on its role cards.
         */
        from: z.object({ book: z.string().min(1), audience: z.array(z.string().min(1)).min(1) }).strict().optional(),
      }),
    )
    .superRefine((books, ctx) => {
      for (const [id, b] of Object.entries(books)) {
        if (!b.from) continue
        const source = books[b.from.book]
        const problem = b.from.book === id ? 'a book cannot be made from itself' : !source ? `book "${b.from.book}" is not in books` : source.from ? `book "${b.from.book}" is itself made from another book` : ''
        if (problem) ctx.addIssue({ code: 'custom', path: [id, 'from', 'book'], message: problem })
      }
    })
    .default({}),
  document: z.object({
    title: Localized,
    subtitle: Localized.optional(),
    client: Localized.optional(),
    project: Localized.optional(),
    docNumber: z.string().optional(),
    version: z.string().default('1.0'),
    date: z.string().optional(),
    classification: Localized.optional(),
    preparedBy: Localized.optional(),
    approvers: z.array(Person).default([]),
    revisions: z.array(Revision).default([]),
    revisionsFromGitTags: z.boolean().default(false),
    purpose: Localized.optional(),
    scope: Localized.optional(),
    audience: Localized.optional(),
    glossary: z.array(z.object({ term: Localized, definition: Localized })).default([]),
    contact: Localized.optional(),
    /** Cover logos (relative to the manual folder): the organisation's seal first, the system's logo second. */
    logos: z.array(z.string().min(1)).max(2).default([]),
    /** Company that built the system, shown on the cover as the name alone (no "developed by" prefix). */
    developer: Localized.optional(),
    /** Illustration on the formal cover (relative to the manual folder). */
    coverImage: z.string().optional(),
    /**
     * Clips in PDF/DOCX. Video is web-only: none = a clip leaves nothing on paper; poster = its poster as a numbered
     * figure, with a QR code to the clip on the web when web.baseUrl is a full address.
     */
    clips: z.enum(['none', 'poster']).default('none'),
  }),
  outputs: z
    /** What `manual-kit build` (no format) makes. */
    .object({ pdf: z.boolean().default(true), docx: z.boolean().default(false), web: z.boolean().default(false), dir: z.string().default('dist') })
    .prefault({}),
  sections: z
    .object({
      cover: z.boolean().default(true),
      control: z.boolean().default(true),
      revisions: z.boolean().default(true),
      approval: z.boolean().default(true),
      toc: z.boolean().default(true),
      figures: z.boolean().default(true),
      tables: z.boolean().default(true),
      intro: z.boolean().default(true),
      appendix: z.boolean().default(true),
    })
    .prefault({}),
  /**
   * required: a page that was never signed, or changed since, fails check. warn: it is a warning (still listed).
   * Signing records that a person read the page; tools and CI never sign.
   */
  signing: z.enum(['required', 'warn']).default('required'),
  /** none = no images; screenshots = shots; steps = shots + step images; steps+video = also clips (capture + encode). */
  media: z.enum(['none', 'screenshots', 'steps', 'steps+video']).default('screenshots'),
  adapter: AdapterConfig.default({ type: 'none', sections: [], data: {} }),
  /**
   * The files discover, inventory and the adapter read: globs relative to projectRoot. A glob also covers everything
   * in a folder it names. Empty include = every file.
   */
  discover: z
    .object({ include: z.array(z.string().min(1)).default([]), exclude: z.array(z.string().min(1)).default([]) })
    .prefault({}),
  coverage: z
    .object({ include: z.array(z.string()).default(['*']), exclude: z.array(z.string()).default([]) })
    .prefault({}),
  capture: z
    .object({
      baseUrl: z.string().url().default('http://localhost:5173'),
      /** Which environment baseUrl is (e.g. staging, uat), so everyone knows what the screenshots show. */
      environment: z.string().optional(),
      /** Hostnames capture may open. `*.example.com` matches subdomains. Never point this at production data. */
      allowlist: z.array(z.string().min(1)).min(1).default(['localhost', '127.0.0.1']),
      /** Hosts pages may load CSS, fonts, images and scripts from (e.g. a font CDN) but capture never navigates to. */
      assetHosts: z.array(z.string().min(1)).default([]),
      viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).default({ width: 1280, height: 800 }),
      /** Shell command run in projectRoot before capturing (seed test accounts). */
      seed: z.string().optional(),
      /** Hidden (visibility: hidden) in every image: dev overlays by default. Set your own list, or [] for none. */
      hide: z.array(CssSelector).default(DEV_OVERLAYS),
      /** localStorage set before each page loads; `{lang}` is replaced with the language. */
      localStorage: z.record(z.string(), z.string()).default({}),
      /**
       * Clip defaults (a clip in shots.yaml can set its own). poster: card = a title card in the brand colour, frame = a
       * frame of the clip. cards: an intro and an outro title card around a captured clip.
       */
      /**
       * Before each image: no request open for 500 ms (networkIdle), web fonts loaded, and no visible element matching
       * `spinners`. After timeoutMs the image is taken anyway, with a warning naming what was still pending.
       */
      settle: z
        .object({
          networkIdle: z.boolean().default(true),
          spinners: z.array(z.string().min(1)).default(SPINNERS),
          timeoutMs: z.number().int().min(0).max(60_000).default(10_000),
        })
        .prefault({}),
      clips: z.object({ poster: z.enum(['card', 'frame']).default('card'), cards: z.boolean().default(true) }).prefault({}),
      /**
       * Private data covered in every shot, step and clip frame: text matching `presets`/`text` (regex sources) and
       * elements matching `images` (selectors). `blur` blurs what is under them, `box` paints a grey box.
       */
      redact: z
        .object({
          style: z.enum(['blur', 'box']).default('blur'),
          presets: z.array(z.enum(Object.keys(REDACT_PRESETS) as [keyof typeof REDACT_PRESETS])).default([]),
          text: z.array(Regex).default([]),
          images: z.array(z.string().min(1)).default([]),
        })
        .prefault({}),
    })
    .prefault({}),
  wording: z
    .object({
      superlatives: z.boolean().default(true),
      forbidden: z.array(z.object({ pattern: Regex, flags: z.string().default('i'), message: z.string(), lang: Lang.optional() })).default([]),
      /** Warn about system words in page text: route paths, ENV_NAMES, snake_case/camelCase, ns:keys, ALL-CAPS codes, "พัฒนาโดย". */
      plainLanguage: z.boolean().default(true),
      /** Words plainLanguage accepts (e.g. PDF, LINE), on top of a few common ones. */
      allow: z.array(z.string().min(1)).default([]),
      /**
       * Longest step, in characters (a token counts as its label): numbered steps under a how-to's "วิธี…" heading
       * and shots.yaml step texts. Per language; a language not listed gets 160; 0 = off.
       */
      stepLength: z.record(Lang, z.number().int().min(0)).default({ th: 120, en: 160 }),
      /** Warn when a how-to's steps are a plain numbered list while media is steps or steps+video (use {{steps:id}}). */
      stepImages: z.boolean().default(true),
      /** Warn when a quoted problem title is neither a UI string nor a message the code has (when discovery finds messages). */
      problemMessages: z.boolean().default(true),
      /** Warn about prose that points at the video ("ดูวิดีโอ", "watch the video"): the PDF and DOCX have no video. */
      videoInProse: z.boolean().default(true),
    })
    .prefault({}),
  fonts: z
    .object({
      /**
       * DOCX fonts. Thai text uses `thai` (w:cs), Latin text `latin` (w:ascii/hAnsi; default = thai).
       * Default with the neutral template: bundled Sarabun. Files are relative to the manual folder.
       * size = Thai body size in pt (default 16 for "TH ..." fonts such as TH Sarabun New, else 11 like the PDF).
       */
      docx: z
        .object({
          thai: FontFace,
          latin: FontFace.optional(),
          size: z.number().positive().max(72).optional(),
          latinSize: z.number().positive().max(72).optional(),
          /** Font Word should use when the family is missing (fontTable altName). */
          fallback: z.string().default('Tahoma'),
        })
        .optional(),
      /** Embed the font files in the DOCX so readers without the font see it (OFL fonts allow this). */
      embedFonts: z.boolean().default(true),
    })
    .prefault({}),
  docx: z
    .object({
      /** Justify body paragraphs the Thai way (thaiDistribute) and add zero-width spaces at Thai word boundaries. */
      thaiJustify: z.boolean().default(false),
      /** Lay the file out in a word processor once so the lists get page numbers (auto: LibreOffice if installed, else none; Word only when named). */
      finalize: z.enum(['auto', 'word', 'libreoffice', 'none']).default('auto'),
    })
    .prefault({}),
  /** `manual-kit publish outline`: an Outline wiki. The API key is read only from the environment (OUTLINE_API_KEY). */
  outline: z
    .object({
      /** The wiki's address, such as https://wiki.example.com. */
      baseUrl: z.string().url().optional(),
      /** Collection id or urlId (or --collection). */
      collection: z.string().min(1).optional(),
      /** Document the book documents go under (or --parent); default: the top of the collection. */
      parent: z.string().min(1).optional(),
    })
    .prefault({}),
  web: z
    .object({
      /** Where the web build is hosted (URL or path): canonical links, and the QR code under clips in PDF/DOCX (document.clips: poster). */
      baseUrl: z.string().optional(),
      /** Look of the site. Neutral defaults; set the product's own name, logo and colours. */
      brand: z
        .object({
          /** Name in the top bar (default: document.title). */
          name: Localized.optional(),
          /** Logo file (PNG/SVG/WebP), relative to the manual folder. */
          logo: z.string().optional(),
          /** Put the logo on a white rounded plate (a logo drawn for light backgrounds, on the brand-coloured bar). */
          logoPlate: z.boolean().default(false),
          colors: z
            .object({ brand: Color.optional(), brandInk: Color.optional(), accent: Color.optional(), link: Color.optional() })
            .prefault({}),
          /** Body font: a CSS family name and optional font files (relative to the manual folder). Default: bundled Sarabun. */
          font: z.object({ family: z.string().min(1), files: z.object({ regular: z.string().optional(), bold: z.string().optional() }).prefault({}) }).optional(),
        })
        .prefault({}),
      /** "Back to the app" link in the top bar. */
      backLink: z.object({ label: Localized, url: z.string().min(1) }).optional(),
      /**
       * Roles named by page front matter `audience`: a label, or { label, description } for the role cards of the "I
       * am a..." picker (default label: the value itself). Listed roles come first on the picker, in this order.
       */
      audiences: z.record(z.string(), z.union([Localized, z.object({ label: Localized, description: Localized.optional() }).strict()])).default({}),
      /** Sidebar groups named by page front matter `group` (default groups: by page kind). */
      groups: z.record(z.string(), z.object({ title: Localized, icon: z.string().optional() })).default({}),
      /** Front page of the site (dist/web/index.html). Every part is optional; a part without data is left out. */
      home: z
        .object({
          /** Hero title (default: document.title); a line break in the text breaks the line. */
          title: Localized.optional(),
          /** Short paragraph under the title (default: a sentence counting the books). */
          lede: Localized.optional(),
          /** Words under the search box that fill it when pressed ("Try: ..."). */
          hints: z.array(Localized).default([]),
          /** Heading of the journey strip (default: a generic one). */
          journeyTitle: Localized.optional(),
          /** Numbered steps of a typical flow, each linking to a page (id). Default label: the page title; default who:
           * the audience of the page's book, else the book title. */
          journey: z.array(z.object({ page: z.string().min(1), label: Localized.optional(), who: Localized.optional() })).default([]),
        })
        .prefault({}),
    })
    .prefault({}),
  templates: z
    .object({
      docx: z.string().optional(),
      /** Loaded after the built-in pdf.css; local url() references are inlined as data URIs. */
      pdfCss: z.string().optional(),
      /** PDF cover: formal (brand band, logos, illustration) or neutral (plain text). */
      cover: z.enum(['formal', 'neutral']).default('formal'),
    })
    .prefault({}),
})
export type ManualConfig = z.infer<typeof ConfigSchema>

export interface LoadedConfig {
  config: ManualConfig
  /** Absolute path of the manual/ folder. */
  manualDir: string
  /** Absolute path of the project the manual describes. */
  projectRoot: string
  configFile: string
}

export const CONFIG_FILES = ['manual.config.ts', 'manual.config.json', 'manual.config.yaml', 'manual.config.yml']

/** Whether `manualDir` has a manual config yet (before `init` it does not). */
export const hasConfig = (manualDir: string) => CONFIG_FILES.some((f) => existsSync(join(manualDir, f)))

async function readRaw(file: string): Promise<unknown> {
  if (file.endsWith('.ts')) {
    const mod = (await import(`${pathToFileURL(file).href}?t=${Date.now()}`)) as { default?: unknown }
    return mod.default
  }
  const text = readFileSync(file, 'utf8')
  return file.endsWith('.json') ? JSON.parse(text) : YAML.parse(text)
}

export function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')
}

export async function loadConfig(manualDir: string): Promise<LoadedConfig> {
  const dir = resolve(manualDir)
  const configFile = CONFIG_FILES.map((f) => join(dir, f)).find((f) => existsSync(f))
  if (!configFile) throw new ConfigError(`No manual.config.(ts|json|yaml) in ${dir}. Run "manual-kit init" first.`)
  let raw: unknown
  try {
    raw = await readRaw(configFile)
  } catch (e) {
    throw new ConfigError(`Cannot read ${configFile}: ${(e as Error).message}`)
  }
  const parsed = ConfigSchema.safeParse(raw ?? {})
  if (!parsed.success) throw new ConfigError(`Invalid config ${configFile}:\n${formatIssues(parsed.error.issues)}`)
  const config = parsed.data
  const projectRoot = isAbsolute(config.projectRoot) ? config.projectRoot : resolve(dir, config.projectRoot)
  return { config, manualDir: dir, projectRoot, configFile }
}

/** A role's label and description (web.audiences), in `lang`; the label defaults to the id. */
export function audienceText(config: ManualConfig, id: string, lang: string, primary: string): { label: string; description: string } {
  const v = config.web.audiences[id]
  if (v === undefined) return { label: id, description: '' }
  if (typeof v === 'object' && 'label' in v) return { label: localize(v.label, lang, primary) || id, description: localize(v.description, lang, primary) }
  return { label: localize(v, lang, primary) || id, description: '' }
}

/** Text for `lang`, falling back to the primary language, then to any value. */
export function localize(value: Localized | undefined, lang: string, primary: string): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  return value[lang] ?? value[primary] ?? Object.values(value)[0] ?? ''
}
