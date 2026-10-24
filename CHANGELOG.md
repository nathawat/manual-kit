# Changelog

## Unreleased

- New default PDF cover (`templates.cover: formal`): a thin band in the product's colour with the accent rule, the
  organisation and logos centred, the title and the book at the left, the illustration at the right
  (`document.coverImage`, else the theme's line drawing), the document fields along the bottom and a footer line with
  the developer and the book. Title and labels use the brand colour made readable on paper. The default brand pair is
  now the web theme's (#183b5e + #d9480f).
- Video title cards use the same default pair, and their title, subtitle and footer stay readable on any brand
  colour (dark text on a light brand, the accent lightened or darkened as needed).
- New default web theme (DESIGN.md): the product's colour on the top bar, the front-page hero and every page head,
  closed by an accent rule; pages read as one white sheet with a facts strip (who it is for and the page's `info:`),
  square step numbers, labelled notes, a brand-coloured table head and edge-to-edge screenshots on phones. IBM Plex
  Sans Thai replaces Sarabun on the web. Brand colours are worked out at build time (`assets/brand.css`) so any
  `web.brand.colors` pair stays readable in light and dark; a light / dark switch sits in the top bar. The web shows
  no figure or table numbers and no document-control table; those stay in the PDF and DOCX. The front page shows the
  theme's own line drawing unless `document.coverImage` is set, and guide cards list their menu groups with page counts.
- Ready for a public release. The marketplace is now named `manual-kit` (install with
  `claude plugin install manual-kit@manual-kit`; the plugin's data folder becomes `manual-kit-manual-kit`), and
  `outline.baseUrl` has no default wiki: `publish outline` asks for it. Company and client names, internal hosts and
  client screenshots are gone from the docs and examples; README images now come from manual-kit's own manual. The demo
  video and its recording scripts (`tools/demo`) are removed because they were built from a client's manual.
- Capture: a form that uploads a file now sends the file. The allowlist fetched each request itself, and Chromium leaves
  disk-backed files out of the body it hands over, so the server got the form without them.
- `snap` checks every redirect hop. A local page, image or stylesheet that redirected to another host was loaded
  and photographed, because the browser follows redirect hops without asking the request filter. Each hop is now
  checked before it is asked for (as `capture` does since #19), and a refused one prints
  `warning: refused a redirect from <url> to <host>`. Redirects between local pages still work.
- `snap` loads every `loading="lazy"` image before the full-page shot. Images below the fold (the video gallery's
  thumbnails on a web manual) came out blank, because a full-page shot does not scroll.
- Two capture actions. `{ upload: sel, files: path | [paths] }` chooses files (relative to the manual folder) in an
  `<input type=file>`, or in the file chooser a button or drop area opens; the files' contents are part of the spec
  hash, and a missing file stops `capture` before any browser opens. `{ drag: sel, to: sel2, offset?: { x, y } }`
  presses on `sel`, moves to `sel2` (its centre, or `offset` pixels from its top-left) in steps and releases, so
  pointer-based editors and HTML5 drag and drop both see it. Both work in logins, shots, step setup and actions and
  clip segments, take `optional: true`, and name their selector (or the drop target) in a failure.
- `settle: false` on a step takes its image right after the step's actions, without waiting for the page to settle,
  so a message that closes itself after a few seconds can be photographed.
- The screenshot capture saves when a job fails (`.manual-kit/failures/`) gets the same `capture.redact` cover as
  captured images; when the cover cannot be drawn, no screenshot is saved.
- A failed capture's "similar elements" name the test hook the element really has (`[data-cy=…]`, `[data-test=…]`);
  before, every hook was printed as `[data-testid=…]`, a selector that then matched nothing.
- A how-to steps heading may start with "วิธีแก้ไข…" (a task such as แก้ไขข้อมูลส่วนตัว); only "วิธีแก้ปัญหา" / "วิธีแก้ไขปัญหา" read as
  a problems heading.
- Role books and one task site. `books.<id>.from: { book, audience }` makes a book with no pages of its own: the
  source book's pages for those roles (plus the pages with no `audience`), in the source's menu order, as a PDF and
  DOCX with their own title, cover and icon. It has no web site; its files are linked from the source site. A site
  whose pages name two or more roles gets an "ฉันเป็น…" / "I am a…" picker on its home page and on the front page
  (a card per role with its description, page count and role PDFs, plus "ดูทุกงาน" / "See all tasks"). The picked
  role is kept per book in localStorage (or set with `?role=<id>`) and filters the sidebar, the home lists and
  previous / next; the sidebar's role chips change or clear it and its downloads add the role's book. Search results
  show each page's roles. `web.audiences` values may be `{ label, description }`; a plain label still works. The
  sidebar's audience chips now appear from two roles up, and "ทั้งหมด / All" reads "ดูทุกงาน / See all tasks".
  `check` reports pages in a role book's folder and roles no page names; `new-page` refuses a role book; `publish
  outline` skips role books.
- A problem item (`- ปัญหา: …` with `วิธีแก้ไข: …` on the next line) prints as two lines in PDF and DOCX, and on the
  web, instead of one run-on line.
- Reader-first how-to template. A how-to page is one task with `## <งาน>คืออะไร` (What is <task>), `## วิธี<งาน>`
  (How to <task>), `## ข้อควรทราบ` (Good to know, optional), `## ปัญหาที่อาจพบและวิธีแก้ไข` (Problems and fixes) and
  `## คำถามที่เกี่ยวข้อง` (Related questions, optional). `new-page --kind how-to` writes it with the task in the
  headings and a writing hint per part; the `structure` warning names a page's old headings (ก่อนเริ่ม, ขั้นตอน,
  ผลลัพธ์ที่ได้, ปัญหาที่พบบ่อย, หน้าที่เกี่ยวข้อง) with the new heading for each. Old pages still build.
- The FAQ reads problems from both "ปัญหาที่อาจพบและวิธีแก้ไข / Problems and fixes" and the old "ปัญหาที่พบบ่อย /
  Common problems", and the new item shape `- ปัญหา: “<message>”` with `  วิธีแก้ไข: …` on the next line (labels plain
  or bold; `Problem:` / `Fix:` in English). A symptom that is a quoted message files under "Error or message".
- New `check` warnings, each with a `wording` key: a step longer than `wording.stepLength` (120 characters in Thai,
  160 in English, tokens counted as their label) in a how-to's steps or a shots.yaml step text; a plain numbered list
  of steps while media is `steps` or `steps+video` (`wording.stepImages`); a quoted problem title that is no UI string
  or code message, when discovery finds messages (`wording.problemMessages`); prose that points at the video, which
  the PDF and DOCX do not have (`wording.videoInProse`).
- The building-product-manuals skill teaches the reader-first model: three kinds of content, one task per page, one
  short action per step with fixed verbs and a screenshot each, explanation only in the intro or ข้อควรทราบ, problems
  titled by verbatim messages, "ทำได้ N วิธี" sub-sections, pages in the app's menu order, video on the web only. The
  "2-4 full sentences per step" rule is gone.
- `{{steps:id}}` renders as the page's own numbered steps on every output: the step text, its sub-bullets, then that
  step's screenshot under it, full width (zoomable on the web). The web drops the "ทำตามทีละขั้น N ขั้นตอน" panel and
  the side-by-side layout. Steps take `details` (short sub-bullets, plain or per language; `{{ui:}}` works) and
  `highlight: false` for a step that only shows the system's response; `check` warns about a step with no highlight.
  Neither changes the spec hash, so nothing is recaptured. In Markdown outputs the content of a step lines up with
  its marker, so a tenth step keeps its image inside the item.
- Video is web-only by default: `document.clips: none` (default) leaves nothing for `{{clip:id}}` in PDF and DOCX,
  removes the line that held it and numbers the figures without a gap. `document.clips: poster` keeps the poster figure
  and the QR code. The web and Outline are unchanged.
- `books.<id>.groups`: a book's page groups in the app's menu order, with localized titles (and icons). The web
  sidebar, previous / next and the PDF/DOCX chapter order follow it; groups not listed come after.
- Web: a how-to's "วิธี…" / "How to …" section with two or more `###` ways starts with "ทำได้ N วิธี" cards linking
  to each way.

### Security

- Redirects no longer get past `capture.allowlist`. The browser followed a redirect from an allowed page to any host,
  so a page could load and be photographed on a host outside the list. Capture now follows every redirect itself,
  hop by hop, for pages and for CSS, fonts, images and other requests: each address is checked before it is asked
  for, and a hop to another host is refused with `blocked by capture allowlist: <host> (redirect from <host>/<path>)`.
  Cookies set by allowed hops still apply. An event stream (`EventSource`) never ends, so the browser still follows
  its redirects; one that reaches another host is listed as blocked and fails the image. The page address is checked again after every `goto` and before every
  image, and service workers are turned off. This covers capture, `walkthrough measure`, `discover --runtime` and the
  check of a saved `manual-kit login` session (which no longer sends the request to the sign-in host to find that the
  session expired). `manual-kit login` itself still opens any host.

### Changes

- A selector that matches a `display: contents` wrapper (a React span carrying the test id) now works without
  `sel > *`. `highlight`, `element`, `capture.redact.images` and `walkthrough measure` use the box around what the
  wrapper renders; `click`, `fill`, `select`, `check`, `uncheck` and `press` with `on` go to the first visible element
  inside it that can take the action (`--verbose` prints a `note` when several could). Hidden and zero-size elements,
  and wrappers with nothing visible inside, still fail with the "no visible box" message. Spec hashes are unchanged.
- `capture --only <ids>` takes only the shots, step sets and clips whose id matches an id or `*` glob
  (comma-separated or repeated; with `--changed`, both must hold). A pattern that matches no id stops before the
  browser opens and names the closest ids. Logins run only for the selected jobs.
- `capture --dry-run` opens no browser and writes nothing. It prints one line per job with why it would run (`new`,
  `spec changed`, `file missing`, `forced`), its login and the hosts it would visit, then a summary of the logins (a
  saved login without a session says so) and hosts. A host outside `capture.allowlist`, from a URL or a `goto`
  action, is flagged and the exit code is 2.
- `optional: true` on a shots.yaml action with a target skips it when no visible element matches within 3 s, so a
  button that only some server states show (a context picker's "Select") no longer fails half the logins. A skip
  saves no failure screenshot, adds no clip frame and is listed with `--verbose` only. Specs without `optional` keep
  their hash.
- New adapter `react-spa` for Vite/React single-page apps, read with the TypeScript parser: `<Route path>` elements
  (React Router, wouter) across lines and inside layout wrappers, nested routes joined to their parent (wouter `nest`
  too, `index` routes), route objects given to `createBrowserRouter` / `useRoutes` or typed `RouteObject[]`, and
  TanStack Router file routes in `src/routes` (`$id` -> `:id`, `_layout` and `(group)` dropped). Each route names its
  `file:line`. UI strings come from JSX text and literal `placeholder`, `title`, `aria-label`, `label` and `alt` in
  `src/**/*.tsx` (or i18n files), as with `nextjs`, so `{{ui:"..."}}` checks work. `routes: { files, dir }` narrows
  where routes are read. `discover` and `init` (without `--adapter`) pick it when package.json has `vite` plus
  `react-router-dom`, `react-router`, `wouter` or `@tanstack/react-router` and no `next`; `init` now also picks
  `nextjs` and `nuxt` the same way instead of `none`.
- `manual-kit login <name>`: a person signs in by hand in a browser window (SSO with 2FA, a national-ID app) and the
  session is saved as a Playwright storageState in `manual/.auth/<name>.json`, a folder that ignores itself in git.
  A login in shots.yaml takes `storageState: true` instead of `actions`, with `until` (a selector or URL prefix that
  means signed in; else the person presses Enter) and `check` (capture's test that the session still works; default
  `until`). The sign-in window may reach any host; capture uses only the saved file and still keeps to the allowlist.
  When the session is missing or has expired, capture stops and names `manual-kit login <name>`. The file is a secret:
  never printed or copied into an output. Action logins and their spec hashes are unchanged.
- `discover.include` / `discover.exclude`: globs relative to `projectRoot` that name the files `discover`, `inventory`
  and the adapter read (routes, roles, flags, environment names, UI strings, documents and the rest). A glob also
  covers a folder's contents (`prototype` = `prototype/**`). Excluded files never appear in `discovery.json` or
  `coverage.yaml`; `inventory` drops items an earlier run took from them. `discovery.json` lists
  `project.packageRoots`, and `discover` and `init` print a `discover.exclude` list to copy when there are several and
  no scope is set. `check` accepts route globs in `manual-spec.md`: `` `/settings/roles*` `` names every discovered
  route under it, and a glob that matches none is a warning.
- Nuxt routes from the route config in the code, not only file names. `[id]` is now `:id`, `[[opt]]` `:opt?` and
  `[...slug]` `:slug(.*)*` (coverage ids of dynamic Nuxt routes change: update `routes:` in pages that name them).
  Also read: `definePageMeta` `path` and `alias`, `pages:extend` in nuxt.config (literal `push`, `splice` by
  `findIndex`), `router.options.ts` `routes`, @nuxtjs/i18n per-locale paths (alternates of one route), nested pages,
  and the Nuxt 2 layout (`_id.vue`, `router.extendRoutes`). Routes from code carry `file:line`. What cannot be read
  statically is listed in discovery under "Not read from the code"; new key `adapter.extraRoutes` adds such routes.
- `discover --runtime [path] [--login <name>]` (opt-in) reads the full route table from the running app's Vue Router
  (Nuxt 3/4, Nuxt 2, any Vue Router app) on allowlisted hosts and adds the routes the code did not show, with source
  `runtime`.
- `init` without `--ci` no longer prints a whole CI workflow (it read as if one had been written); it prints one line
  saying `manual-kit init --ci` adds the job. README: run `/reload-plugins` after `claude plugin install`, and the
  first run downloads Chromium plus its headless shell (about 280 MB, 1–5 minutes).
- A front matter `group` missing from `web.groups` is titled from its id on the web (`getting-started` shows as
  "Getting started") instead of the raw id, and `check` warns once per such group with the `web.groups` key to add.
- `capture --changed` also captures a clip again when a frame its timeline lists was deleted (before, only a missing
  timeline counted; shots and step images already were). `shotlist` shows such a clip as missing.
- `capture.hide` and a spec's `hide` are checked when the config and shots.yaml load: a selector with `{`, `}`, `;` or
  a comment, or one that is not valid CSS, is refused with the key that holds it, so it can no longer add CSS rules of
  its own. Each selector becomes its own CSS rule, so one the browser rejects no longer drops the others.

- `init` gathers every project input up front and ends with a checklist of what is still missing (book audiences,
  descriptions and icons, app URL and environment, login, client, developer, system name, logos, cover illustration,
  brand colour) and what to confirm (books, title, outputs, redaction). Answers come from flags or `--answers <file>`
  (config keys plus `login`); a key takes an answer only while blank or still at init's value, so a value a person set
  is never changed. `--login form|cookie` writes `logins.main` in shots.yaml from environment variable names only.
  New key `capture.environment`. The `manual` skill asks for every input in one round, keeps the cover, video cards,
  web and FAQ designs (config only), writes each book's pages in a parallel subagent and keeps context small.

- Shorter output for agents that read it. `capture`, `encode`, `walkthrough measure`, `walkthrough build` and `build`
  print one summary line with counts and time, plus every failure and warning in full; `-v, --verbose` prints the
  line per item as before. `check` puts findings with the same rule and message on one line listing every
  `file:line`, errors first, and leaves signature warnings to the `not signed` line (errors stay one line per page).
  `--json` output is unchanged.
- `capture` waits for each page to settle before every image (`capture.settle`): no request open for 500 ms, web fonts
  loaded, no visible loading indicator (`[aria-busy="true"]`, indeterminate progress bars, `.spinner`, `.loading`,
  `.ant-spin-spinning`, `.MuiCircularProgress-root`, `.animate-spin`). After `timeoutMs` (10 s) the image is taken
  anyway with a warning naming what was pending. Pages open on `load` instead of Playwright's `networkidle`, which
  never came for pages that poll.
- A failed shot, step set or clip no longer stops the run; it is listed with a screenshot of the page at that moment
  in `manual/.manual-kit/failures/` (ignored by git), the hosts the allowlist blocked while it was open, and for a
  selector what it matched instead: similar elements with a selector to use, the matches to pick from, or a hint for
  an element without a box. A failed login says the same and still stops the run.

- Formal PDF cover by default (`templates.cover: formal`; `neutral` keeps the plain one): a full A4 page with a
  brand-colour band (seal, client, system name, system logo), title, subtitle, book name pill, illustration, document
  fields grid and a footer band with the client and developer. New keys: `document.logos`, `document.developer`
  (the company name alone), `document.coverImage`, `books.<id>.icon`. Colours from `web.brand.colors`. DOCX gets a
  simplified cover (logos, title, fields, developer). `init` writes `developer: (รอระบุ)` and `logos: []`.
- Fix: images named with `url()` in `templates.pdfCss` now show in the PDF (inlined as data URIs at build time).
  The cover and `<body>` carry `data-book="<book id>"` for per-book styling.

- Clip title cards by default: every clip's poster is a card in the brand colour with its caption, book title, book
  `icon` and logos; captured clips open and close with a 2.5 s card (captions shift to match). A ready-made video gets
  the music bed when it has no sound and a `<id>.webp` (still of the poster). Opt out with `capture.clips` or per clip
  `poster: frame` / `cards: false`. A changed card asks for a new `encode` (encoder version 3: all clips re-encode).
- `check` warns about system words in page text (on by default, `wording.plainLanguage`): route paths, environment
  names, `snake_case`/`camelCase` names, namespaced keys, ALL-CAPS codes and "พัฒนาโดย"/"พัฒนาระบบโดย". Tokens, code,
  link targets and URLs are skipped; `wording.allow` accepts words readers know. The skills now ask for detailed
  narrative steps (2-4 sentences each) in plain language.
- `capture.redact`: blur (or grey-box) private data in every shot, step image and clip frame: text matching presets
  (`email`, `thai-name`, `latin-name`) or your own patterns, and elements matching `images` selectors. Drawn as boxes
  above the page just before each image, so the app is not changed between frames.

- Walkthrough videos from captured screenshots (`walkthroughs` in shots.yaml): `walkthrough measure` records target
  boxes from the live app into `media/walkthroughs.json` (`--list <shot>` prints the visible controls),
  `walkthrough build` composes intro card, cursor, click pulse, ring, zoom, numbered captions, cross-fades, outro and
  music, and renders with the pinned HyperFrames into the clip files, shown with `{{clip:id}}`. `check` validates the
  specs and finds videos older than their screenshots; the plugin's `doctor` reports HyperFrames.
- `init` writes `projectRoot` relative to the real project (nearest folder with `.git`, else the current folder):
  `init -m docs/manual` gives `../..`, CI jobs go into the project and check `-m docs/manual`; `discover` before `init`
  scans that project too. `init` no longer ignores `manual/dist/` (the docs say to commit outputs); `--ignore-dist`
  adds the `.gitignore`.
- Node.js 22.17 or newer everywhere (package.json engines, the plugin's check, README, reference; running `src/*.ts`
  directly needs 22.18). The bundle's tests pass on 22.17; before it `fs.globSync` printed an ExperimentalWarning.
  Fix: `**/.env.example`-style patterns find dot files on Node 22 releases before 22.23 too.
- Fix: `discover` no longer takes `#` lines inside fenced code blocks (``` or ~~~) for document headings.
- `books.<id>.outline.title`: the title of a book's Outline document (default "<document.title>: <book title>"), so
  a title the owner chose on the wiki is kept when publishing again. The manual of manual-kit uses it.
- Fix: `[[page-id]]` to a page in another book of the same language resolves everywhere: the web links to that book's
  page, Outline to its document (also when only one book is published, from `outline.json`), PDF and DOCX say
  "ดู <book>: <page>" / "see <book>: <page>". `check` accepts such ids.
- Fix: a page's own numbered steps no longer run on into a `{{steps:}}` block between them (or the block into them):
  a steps list on its own line is kept apart (HTML comment for PDF/web/DOCX, `1)` delimiter for Outline) so the next
  item keeps its number; a `{{shot:}}`, `{{steps:}}` or `{{clip:}}` written on an indented line stays inside the list
  item above it.
- Clips from a ready-made video (`video: { file, captions, posterAt }` instead of `url` and segments): capture reads its
  size and length, encode copies it with a poster frame and captions; the web transcript comes from the captions file.
- `manual-kit publish outline`: the built manual as Outline wiki documents (one per book, one per page) with images,
  clips and PDF/DOCX as attachments and links rewritten; `manual/outline.json` keeps the mapping so publishing again
  updates instead of duplicating; `--dry-run` prints the plan; the API key only from `OUTLINE_API_KEY`. Render target
  `outline` (plain images, notices, clip = poster + MP4 link).
- Terminal sessions as screens: a shot, steps or clip can name a transcript file (`terminal: { file, title, badge,
  prompt }`) instead of `url`; capture renders it as a terminal window (ANSI colours kept, text escaped once) and
  photographs it with the same highlight, steps, captions and clip encoding, so command-line tools can be documented.
  New action `{ show: n, output? }` reveals the session command by command. The transcript is part of the spec hash.
- Fix: the web clip player no longer shows captions twice. Captions are burned into the picture, so the WebVTT track
  stays available but is off until the reader presses the captions button.
- Claude Code plugin: this repository is a marketplace with the plugin `manual-kit`
  (`claude plugin marketplace add <this repository>`, then `claude plugin install manual-kit@<marketplace>`). The plugin carries a bundled CLI (`plugins/manual-kit/dist/manual-kit.mjs`,
  no build step), `bin/manual-kit` on Claude's PATH, and installs playwright, pagedjs, typescript and Chromium into
  the plugin's data folder (SessionStart hook, or on first use). Skills: `/manual-kit:manual` (end to end, modes
  `spec`, `update`, `check`) and `building-product-manuals` (the method). The old `skill/` folder and `npm link`
  install are replaced.
- `manual-kit discover`: evidence for the manual spec (documents, routes, roles, permissions, workflow states, form
  fields, messages, API routes, flags, integrations, environment names, run scripts, seed data) in
  `manual/discovery.json` + `discovery.md`, each item with its source path; works before `init`; `--print`.
  `check` (rule `spec`) warns for routes, roles, permissions and flags missing from `manual/manual-spec.md`.
- `manual-kit snap <file|local url> --width 1280,390`: full-page PNGs to look at a built page; warns about sideways scroll.
- Capture warns (`warning <lang> <kind> <id>: mask "..." matched nothing`) when a mask selector matches nothing in
  any frame of a shot, steps or clip, so private text it was meant to cover does not slip into the images unnoticed.
- Clips: the caption band moves to the top for a segment whose highlight it would cover (e.g. a button in a bar pinned
  to the bottom). Capture records each highlight's box in `timeline.json`; older timelines are read from the red frame in
  the picture. Encoder version 2: `check` asks for a new encode.
- Fix: step texts and captions are escaped once. A quoted label (`{{ui:"..."}}`) no longer shows `&quot;` on the web;
  `"`, `&`, `<`, `>` show as written in web, PDF, DOCX (`<b>` was dropped) and WebVTT captions.
- Adapters `nextjs` (App Router + Pages Router) and `nuxt` (pages/*.vue, i18n from locales/ or i18n/); UI text from
  JSX / Vue templates through parsers when there are no i18n files; `sections:` turns in-page regions (wizard steps,
  drawers, modals) into coverage items; `flags` on every regex spec.
- Capture: `select`, `check`, `uncheck`, `hover`, `press` on an element; per-spec `hide`; dev overlays (Next.js, Vite,
  webpack, Nuxt/Vue devtools...) hidden by default (`capture.hide` overrides).
- `build docx --finalize auto` = LibreOffice if installed, else none; Microsoft Word only with `--finalize word`; the
  chosen path is printed.
- `new-page --kind how-to` writes all five how-to parts; `check` warns (rule `structure`) when one is missing.
- `init --ci gitlab` (GitLab job equivalent to the GitHub workflow); `--ci` alone detects `.gitlab-ci.yml`. CI runs
  `check --allow-unsigned`.
- `outputs.web`; `manual-kit build` with no format builds every enabled output. Web search updates as you type.
- Capture: `logins` in shots.yaml (sign in once per language and run, reused by shots/steps/clips that name it) and
  per-spec `storage` (localStorage, sessionStorage, cookies); `crop`, `maxHeight` and `element` (now also for steps).
- PDF: a figure that does not fit the rest of a page shrinks to fit when at least half of it would remain, instead of
  leaving a near-empty page. DOCX: image sizes from the image (text width, PDF figure height, proportions kept).
- Coverage: pages map items from front matter (`routes:` and new `covers:` with `*` patterns); inventory lists them as
  `auto`, check recomputes them live and reports `covers` entries that match nothing. Statuses documented.
- `init --books a,b` and `--no-samples`; a configured book with no pages warns in `check` and on stderr in `build`.
- Signing: config `signing: required | warn` and `check --allow-unsigned`; unsigned pages always listed (`unsigned` in
  `--json`). README: only a person signs.
- DOCX: `--finalize libreoffice` (headless soffice through UNO; auto uses it when Word is missing); every DOCX build
  runs the `check --docx` rules and prints what it checked and what it could not verify; files re-saved by a word
  processor get schema order and content types repaired.
- DOCX: fonts embedded (obfuscated .odttf), theme and font table use the configured fonts; section properties in schema order.
- DOCX: Thai rules for Microsoft Word (cs fonts, szCs, bCs/iCs, lang bidi, themeFontLang), separate Thai/Latin fonts
  and sizes, optional thaiDistribute with zero-width word breaks.
- DOCX: contents and figure/table lists pre-filled; fields no longer marked dirty; `--finalize word` fills page numbers
  with Microsoft Word on macOS.
- `check --docx` verifies a DOCX (Thai settings, package integrity, schema order, relationship ids).

## 0.1.0 (2026-10-05)

First version (v0 of `docs/spec.md`).

- Commands: `init`, `inventory`, `check` (`--json`), `sign`, `new-page`, `shotlist`, `capture` (`--changed`), `build pdf`, `build docx`.
- Config in TS, JSON or YAML, validated with zod.
- Adapters: `generic`, `json-i18n`, a project-specific adapter (removed), `none`; `{{data:}}` from JSON/YAML files.
- Capture: Playwright screenshots and step images with highlight frames and masks, allowlisted hosts only, seed hook,
  `{env:NAME}` for secrets, spec-hash manifest for stale detection.
- PDF via Paged.js + Chromium with bundled Sarabun; DOCX via pandoc with a neutral generated reference.
- Dogfooded on an earlier internal manual (3 bilingual pages, live screenshots from a local copy).

Not yet: `encode` and clips, `build web`, `preview`, Nuxt/Next adapters, PR comment bot, extra themes.
