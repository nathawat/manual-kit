// shots.yaml: what to photograph. Screenshots (`{{shot:id}}`) and step-by-step images (`{{steps:id}}`).
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import { z } from 'zod'
import { CssSelector, Localized, formatIssues } from './config.ts'

export const SHOTS_FILE = 'shots.yaml'
export const MANIFEST_FILE = 'media/manifest.json'

const Selector = z.string().min(1)
/** On an action with a target: skip the action when the target is not visible within OPTIONAL_MS (a button only some states show). */
const Optional = { optional: z.boolean().optional() }
export const Action = z.union([
  z.object({ click: Selector, ...Optional }).strict(),
  z.object({ fill: Selector, value: z.string(), ...Optional }).strict(),
  /** A key (Playwright name: Enter, Escape, Control+A...), on the focused element or on `on`. */
  z
    .object({ press: z.string().min(1), on: Selector.optional(), ...Optional })
    .strict()
    .refine((a) => !a.optional || a.on, { message: 'optional needs a target: press on an element (on: selector)' }),
  /** Choose an <option> by its value or its visible label. */
  z.object({ select: Selector, value: z.string(), ...Optional }).strict(),
  z.object({ select: Selector, label: z.string(), ...Optional }).strict(),
  z.object({ check: Selector, ...Optional }).strict(),
  z.object({ uncheck: Selector, ...Optional }).strict(),
  z.object({ hover: Selector, ...Optional }).strict(),
  /**
   * Choose files (relative to the manual folder) in an <input type=file>, or in the file chooser a button or drop area
   * opens. `contentHash` is set by loadShots, so a changed file recaptures.
   */
  z
    .object({ upload: Selector, files: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]), contentHash: z.string().optional(), ...Optional })
    .strict(),
  /** Press on an element, move to `to` (at `offset` px from its top-left, default its centre) and release. */
  z
    .object({ drag: Selector, to: Selector, offset: z.object({ x: z.number().min(0), y: z.number().min(0) }).strict().optional(), ...Optional })
    .strict(),
  z.object({ wait: Selector, ...Optional }).strict(),
  z.object({ waitMs: z.number().int().min(0).max(30_000) }).strict(),
  z.object({ goto: z.string().min(1) }).strict(),
  /** Terminal specs only: show the session up to command n (0 = the preamble); `output: false` hides command n's output. */
  z.object({ show: z.number().int().min(0), output: z.boolean().optional() }).strict(),
])
export type Action = z.infer<typeof Action>
/** How long an optional action waits for its target before it is skipped. */
export const OPTIONAL_MS = 3_000
const Viewport = z.object({ width: z.number().int().positive(), height: z.number().int().positive() })
/** Browser state set before the page loads. Values take {lang} and {env:NAME}. */
const Storage = z
  .object({
    localStorage: z.record(z.string(), z.string()).default({}),
    sessionStorage: z.record(z.string(), z.string()).default({}),
    cookies: z.array(z.object({ name: z.string().min(1), value: z.string(), path: z.string().default('/') })).default([]),
  })
  .strict()
export type Storage = z.infer<typeof Storage>
/** What a page looks like when signed in: an element on it, or a URL it starts with (joined to capture.baseUrl). */
const Signal = z.union([z.object({ selector: Selector }).strict(), z.object({ url: z.string().min(1) }).strict()], {
  error: 'give { selector: "..." } (an element on the page) or { url: /path } (the address starts with it)',
})
export type Signal = z.infer<typeof Signal>
/** A sign-in done once per language and capture run by its actions; shots that name it start signed in (cookies + localStorage). */
const ActionLogin = z.object({ url: z.string().min(1), actions: z.array(Action).min(1), storage: Storage.optional(), storageState: z.undefined().optional() })
export type ActionLogin = z.infer<typeof ActionLogin>
/**
 * A sign-in a person does by hand (`manual-kit login <name>`: SSO, 2FA), saved as a Playwright storageState file that
 * capture reuses. `until`: the sign-in is done (else the person presses Enter). `check`: capture's test that the saved
 * session still works on the start page (default: until).
 */
export const SavedLogin = z.object({ url: z.string().min(1), storageState: z.literal(true), until: Signal.optional(), check: Signal.optional() }).strict()
export type SavedLogin = z.infer<typeof SavedLogin>
export const LoginSpec = z.discriminatedUnion('storageState', [ActionLogin, SavedLogin])
export type LoginSpec = z.infer<typeof LoginSpec>
export const isSaved = (l: LoginSpec): l is SavedLogin => l.storageState === true
/** Saved-session file of a login, relative to the manual folder. A secret: the folder ignores itself in git. */
export const AUTH_DIR = '.auth'
export const authPath = (name: string) => `${AUTH_DIR}/${name}.json`
/** What part of the screen becomes the image (shots and steps). Default: the viewport. */
const Frame = {
  /** Photograph only this element. */
  element: Selector.optional(),
  /** A fixed region of the page, in CSS pixels from the top-left of the page. */
  crop: z.object({ x: z.number().int().min(0), y: z.number().int().min(0), width: z.number().int().positive(), height: z.number().int().positive() }).strict().optional(),
  /** Keep at most this many pixels from the top (of the viewport, element or crop); tall screens stay readable on paper. */
  maxHeight: z.number().int().positive().optional(),
}
const oneFrame = (s: { element?: string; crop?: unknown }) => !(s.element && s.crop)
const FRAME_MESSAGE = { message: 'use element and crop separately (element photographs one element, crop a fixed region)' }
/**
 * A command-line session instead of an app page: a transcript file (relative to the manual folder) rendered as a
 * terminal window (src/terminal.ts). `contentHash` is set by loadShots from the file, so editing it makes the images stale.
 */
export const TerminalSpec = z
  .object({
    file: z.string().min(1),
    title: Localized.optional(),
    /** A label in the title bar, e.g. { th: ตัวอย่าง } for an illustrative (scripted) session. */
    badge: Localized.optional(),
    /** What starts a command line in the transcript. */
    prompt: z.string().min(1).default('$ '),
    contentHash: z.string().optional(),
  })
  .strict()
export type TerminalSpec = z.infer<typeof TerminalSpec>
/** Default window of a terminal spec (an app page uses capture.viewport). */
export const TERMINAL_VIEWPORT = { width: 960, height: 600 }

/** Fields every spec kind shares. `hide`: elements made invisible (visibility: hidden) in the images. */
const Session = {
  login: z.string().min(1).optional(),
  storage: Storage.optional(),
  hide: z.array(CssSelector).default([]),
  /** The page to open (joined to capture.baseUrl), or `terminal` for a command-line session. Exactly one. */
  url: z.string().min(1).optional(),
  terminal: TerminalSpec.optional(),
}
const oneSource = (s: { url?: string; terminal?: unknown }) => !!s.url !== !!s.terminal
const SOURCE_MESSAGE = { message: 'give either url or terminal (an app page, or a transcript file), not both' }

export const ShotSpec = z.object({
  ...Session,
  caption: Localized,
  /** Text for screen readers when the caption does not describe the image well enough (default: caption). */
  alt: Localized.optional(),
  viewport: Viewport.optional(),
  actions: z.array(Action).default([]),
  highlight: Selector.optional(),
  mask: z.array(Selector).default([]),
  ...Frame,
}).refine(oneFrame, FRAME_MESSAGE).refine(oneSource, SOURCE_MESSAGE)
export type ShotSpec = z.infer<typeof ShotSpec>

export const StepsSpec = z.object({
  ...Session,
  viewport: Viewport.optional(),
  mask: z.array(Selector).default([]),
  /** Actions before the first step (sign in, open a dialog...). */
  setup: z.array(Action).default([]),
  steps: z
    .array(
      z.object({
        text: Localized,
        /** Short sub-bullets under the step text (the fields to fill...). Not in the image, so not in the spec hash. */
        details: z.array(Localized).optional(),
        alt: Localized.optional(),
        actions: z.array(Action).default([]),
        /** The control the reader acts on, framed in red; false = a step that only shows the system's response. */
        highlight: z.union([Selector, z.literal(false)]).optional(),
        /** false = photograph right after the actions, without waiting for the page to settle: a message that closes
         * itself after a few seconds would be gone by then. */
        settle: z.boolean().optional(),
      }),
    )
    .min(1),
  ...Frame,
}).refine(oneFrame, FRAME_MESSAGE).refine(oneSource, SOURCE_MESSAGE)
export type StepsSpec = z.infer<typeof StepsSpec>

/**
 * A video made elsewhere (a demo, a screen recording), used as it is: `capture` reads its size and length, `encode`
 * copies it and takes a poster frame. Paths are relative to the manual folder; `captions` is a WebVTT file (also the
 * transcript on the web). `contentHash` is set by loadShots, so a new video makes the clip stale.
 */
export const VideoSource = z
  .object({
    file: z.string().min(1),
    captions: z.string().min(1).optional(),
    /** Second of the video used as the poster. */
    posterAt: z.number().min(0).default(1),
    contentHash: z.string().optional(),
  })
  .strict()
export type VideoSource = z.infer<typeof VideoSource>

/** A short video: segments of actions, each with a caption burned into the picture. Media level steps+video. */
export const ClipSpec = z.object({
  ...Session,
  video: VideoSource.optional(),
  /** Figure caption (PDF/DOCX/web). */
  caption: Localized,
  alt: Localized.optional(),
  /** Poster: a title card (card) or a frame of the clip (frame). Default: capture.clips.poster. */
  poster: z.enum(['card', 'frame']).optional(),
  /** Intro and outro title cards around a captured clip. Default: capture.clips.cards. */
  cards: z.boolean().optional(),
  viewport: Viewport.optional(),
  mask: z.array(Selector).default([]),
  setup: z.array(Action).default([]),
  segments: z
    .array(
      z.object({
        /** Text burned into the video while this segment plays. */
        caption: Localized,
        actions: z.array(Action).default([]),
        highlight: Selector.optional(),
        /** How long the end of the segment stays on screen (ms); at least the time to read the caption. */
        holdMs: z.number().int().min(500).max(20_000).default(2500),
      }),
    )
    .default([]),
})
  .refine((c) => [c.url, c.terminal, c.video].filter(Boolean).length === 1, { message: 'give one of url, terminal or video (an app page, a transcript file or a ready-made video)' })
  .refine((c) => !!c.video || c.segments.length > 0, { message: 'a captured clip needs segments (at least one)' })
export type ClipSpec = z.infer<typeof ClipSpec>

/**
 * A walkthrough video made from screenshots already captured (no live app while it is built): per scene a shot, per
 * step a control on it (`target`, measured by `walkthrough measure`), a caption, and how the cursor treats it. Shown
 * with `{{clip:<id>}}` like any clip.
 */
export const WalkthroughSpec = z
  .object({
    /** The page that explains the task in full (the outro and the video gallery point to it). */
    page: z.string().min(1),
    /** Title on the intro card and the figure caption (default: the page title). */
    title: Localized.optional(),
    scenes: z
      .array(
        z
          .object({
            shot: z.string().min(1),
            steps: z
              .array(
                z
                  .object({
                    target: Selector,
                    caption: Localized,
                    /** Zoom in on the target while this step plays: true = 1.6x, or a factor. */
                    zoom: z.union([z.literal(true), z.number().min(1).max(4)]).optional(),
                    /** click = cursor moves there and clicks; point = it only points. */
                    action: z.enum(['click', 'point']).default('click'),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
export type WalkthroughSpec = z.infer<typeof WalkthroughSpec>

const ShotsFile = z.object({
  logins: z.record(z.string(), LoginSpec).default({}),
  shots: z.record(z.string(), ShotSpec).default({}),
  steps: z.record(z.string(), StepsSpec).default({}),
  clips: z.record(z.string(), ClipSpec).default({}),
  walkthroughs: z.record(z.string(), WalkthroughSpec).default({}),
})
export type Shots = z.infer<typeof ShotsFile>

export function loadShots(manualDir: string): Shots {
  const file = join(manualDir, SHOTS_FILE)
  if (!existsSync(file)) return { logins: {}, shots: {}, steps: {}, clips: {}, walkthroughs: {} }
  const parsed = ShotsFile.safeParse(YAML.parse(readFileSync(file, 'utf8')) ?? {})
  if (!parsed.success) throw new Error(`Invalid ${SHOTS_FILE}:\n${formatIssues(parsed.error.issues)}`)
  const shots = parsed.data
  for (const [name, login] of Object.entries(shots.logins))
    if (isSaved(login) && !/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`Invalid ${SHOTS_FILE}: login "${name}": a login with storageState needs a name of letters, digits, - and _ (it names the file ${authPath('<name>')})`)
  for (const [kind, specs] of [['shot', shots.shots], ['steps', shots.steps], ['clip', shots.clips]] as const)
    for (const [id, spec] of Object.entries(specs)) {
      if (spec.login && !shots.logins[spec.login]) throw new Error(`Invalid ${SHOTS_FILE}: ${kind} "${id}": login "${spec.login}" is not in logins (${Object.keys(shots.logins).join(', ') || 'none defined'})`)
      if (!spec.terminal && specActions(spec).some((a) => 'show' in a)) throw new Error(`Invalid ${SHOTS_FILE}: ${kind} "${id}": "show" works only in a terminal spec`)
      for (const a of specActions(spec)) if ('upload' in a) a.contentHash = filesHash(manualDir, uploadFiles(a))
      if (spec.terminal) spec.terminal.contentHash = filesHash(manualDir, [spec.terminal.file])
      if ('video' in spec && spec.video) spec.video.contentHash = filesHash(manualDir, [spec.video.file, spec.video.captions])
    }
  for (const login of Object.values(shots.logins))
    if (!isSaved(login)) for (const a of login.actions) if ('upload' in a) a.contentHash = filesHash(manualDir, uploadFiles(a))
  for (const [id, w] of Object.entries(shots.walkthroughs)) {
    const bad = (why: string) => new Error(`Invalid ${SHOTS_FILE}: walkthrough "${id}": ${why}`)
    if (shots.clips[id]) throw bad('a clip has the same id ({{clip:id}} shows either)')
    for (const sc of w.scenes) {
      const shot = shots.shots[sc.shot]
      if (!shot) throw bad(`shot "${sc.shot}" is not in shots`)
      if (!shot.url || shot.element || shot.crop || shot.maxHeight) throw bad(`shot "${sc.shot}" must be a whole app screen (url, no element, crop or maxHeight)`)
    }
  }
  return shots
}

/** Hash of files' contents (a missing one counts as "missing"), for spec hashes of specs that name files. */
function filesHash(manualDir: string, files: (string | undefined)[]): string {
  const h = createHash('sha256')
  for (const f of files) {
    if (!f) continue
    const file = join(manualDir, f)
    h.update(f).update(existsSync(file) ? readFileSync(file) : 'missing')
  }
  return h.digest('hex').slice(0, 16)
}

type UploadAction = Extract<Action, { upload: string }>
export const uploadFiles = (a: UploadAction) => [a.files].flat()

/** Every action a spec runs (shot actions, setup, step and segment actions). */
export function specActions(spec: ShotSpec | StepsSpec | ClipSpec): Action[] {
  if ('segments' in spec) return [...spec.setup, ...spec.segments.flatMap((s) => s.actions)]
  if ('steps' in spec) return [...spec.setup, ...spec.steps.flatMap((s) => s.actions)]
  return spec.actions
}

/** Stable hash of a spec (and of the login it names, so a changed sign-in recaptures its shots). */
export function specHash(spec: ShotSpec | StepsSpec | ClipSpec, logins: Record<string, LoginSpec> = {}): string {
  // fields added later are left out while empty, so older specs keep their hash (no recapture after an upgrade)
  // how a clip is encoded (poster, cards) is not what is captured
  // nor what a page says around a step image (details), nor `highlight: false`, which draws what no highlight draws
  const { hide, ...rest } =
    'segments' in spec
      ? (({ poster: _p, cards: _c, ...r }) => r)(spec)
      : 'steps' in spec
        ? { ...spec, steps: spec.steps.map(({ details: _d, highlight, ...st }) => (highlight === false ? st : { ...st, highlight })) }
        : spec
  const own = hide.length ? { hide, ...rest } : rest
  const input = spec.login ? { spec: own, login: logins[spec.login] ?? null } : own
  const stable = (v: unknown): unknown =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]))
      : Array.isArray(v)
        ? v.map(stable)
        : v
  return createHash('sha256').update(JSON.stringify(stable(input))).digest('hex').slice(0, 16)
}

/** media/<lang>/<id>.png, and media/<lang>/<id>-<n>.png for step n (1-based). Relative to the manual folder. */
export const shotPath = (lang: string, id: string) => `media/${lang}/${id}.png`
export const stepPath = (lang: string, id: string, n: number) => `media/${lang}/${id}-${n}.png`
/** Captured frames of a clip and their timing (input of `encode`). */
export const clipDir = (lang: string, id: string) => `media/${lang}/clips/${id}`
export const clipTimeline = (lang: string, id: string) => `${clipDir(lang, id)}/timeline.json`
/** Encoded clip files next to the images. */
export const clipFiles = (lang: string, id: string) => ({
  mp4: `media/${lang}/${id}.mp4`,
  poster: `media/${lang}/${id}.poster.png`,
  webp: `media/${lang}/${id}.webp`,
  vtt: `media/${lang}/${id}.vtt`,
})
/** Manifest key for one captured spec in one language (`encode/<id>`, `walkthrough/<id>` = what the video files were made from). */
export const manifestKey = (lang: string, kind: 'shot' | 'steps' | 'clip' | 'encode' | 'walkthrough', id: string) => `${lang}/${kind}/${id}`

/** Media levels that need step images / clips. */
export const hasSteps = (media: string) => media === 'steps' || media === 'steps+video'
export const hasClips = (media: string) => media === 'steps+video'

export type Manifest = Record<string, string>
export function readManifest(manualDir: string): Manifest {
  const file = join(manualDir, MANIFEST_FILE)
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Manifest) : {}
}
