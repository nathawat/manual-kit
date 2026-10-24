# Discovery

Evidence collected by `manual-kit discover` (deterministic; code is read, never run). Each item names the file it came from. This is the input for `manual-spec.md`; it is not the spec.

- Project: manual-kit - Build and maintain formal customer manuals (PDF/DOCX) that stay in sync with the code. No AI inside.
- Adapter: generic
- Package roots: ., plugins/manual-kit/runtime (set `discover.include` / `discover.exclude` to the app the manual documents)
- Counts: 7 documents, 19 routes, 0 roles, 0 permissions, 16 state sets, 1 form fields, 90 messages, 0 API routes, 0 flags, 4 environment names, 75 UI strings

## Requirement and design documents

- **manual-kit** (readme) `README.md`
  - ทำอะไรได้บ้าง
  - ตัวอย่างผลลัพธ์
  - ขั้นตอนการทำ (ภาพรวม)
  - 1. ติดตั้ง (ครั้งเดียวต่อเครื่อง ~3 นาที)
  - 2. ใช้งาน
  - Claude จะทำอะไรบ้าง
  - 3. สิ่งที่ควรเตรียม
  - 4. ผลลัพธ์อยู่ที่ไหน
  - 5. ก่อนส่งลูกค้า (เช็กลิสต์)
  - 6. กติกา
  - 7. ปัญหาที่พบบ่อย
  - อัปเดต plugin
  - คู่มือของ manual-kit (ทำด้วย manual-kit เอง)
  - สำหรับคนพัฒนา manual-kit
- **หลักการวิศวกรรมของ manual-kit** (doc) `docs/engineering-principles.md`
  - แกนหลัก
  - สถาปัตยกรรม
  - การตรวจสอบ
  - การมอบหมายงานและการเรียนรู้
- **manual-kit v0 — Implementation plan** (doc) `docs/plan-v0.md`
- **Project memory: manual-kit** (doc) `docs/project-memory.md`
  - ที่มา
  - การตัดสินใจของเจ้าของ
  - แนวทางที่ลองแล้วไม่ใช้
  - บทเรียนทางเทคนิค
  - การทดสอบกับระบบจริง
  - สถานะ (2026-10-09)
  - งานค้าง
- **manual-kit** (doc) `docs/reference.md`
  - เริ่มใช้งาน (ภาษาไทย)
  - Quick start (English)
  - Page tokens
  - Project inputs (`init` answers and checklist)
  - CI
  - Signing (people only)
  - Folder layout
  - manual.config.yaml (main keys)
  - Discover scope
  - Coverage
  - What `check` verifies
  - Adapters
  - shots.yaml
  - Clips: title cards and music
  - Redaction (private data in every image)
  - Ready-made videos
  - Walkthrough videos (from captured screenshots)
  - Terminal sessions (command-line tools)
  - Before each image
  - Signing in by hand (SSO, 2FA)
  - When a shot fails
  - Output
  - Development
- **manual-kit — Design spec** (requirement) `docs/spec.md`
  - 1. เป้าหมาย
  - 2. การตัดสินใจของเจ้าของ
  - 3. โครงในโครงการที่ใช้
  - หน้าเนื้อหา
  - 4. คำสั่ง
  - 5. Adapter (อ่านโค้ดของแต่ละชนิดโครงการ)
  - 6. เอกสารส่งมอบ (build)
  - 7. การดูแลเมื่อระบบเปลี่ยน
  - 8. หลักออกแบบ
  - 9. ขอบเขต v0
- **Manual spec template (manual/manual-spec.md)** (requirement) `plugins/manual-kit/skills/building-product-manuals/spec-template.md`

## Screens (routes)

| Route | Label | Source |
|---|---|---|
| build |  | `src/cli.ts` |
| capture |  | `src/cli.ts` |
| check |  | `src/cli.ts` |
| discover |  | `src/cli.ts` |
| doctor |  | `plugins/manual-kit/bin/manual-kit` |
| encode |  | `src/cli.ts` |
| init |  | `src/cli.ts` |
| inventory |  | `src/cli.ts` |
| login |  | `src/cli.ts` |
| measure |  | `src/cli.ts` |
| new-page |  | `src/cli.ts` |
| outline |  | `src/cli.ts` |
| preview |  | `src/cli.ts` |
| publish |  | `src/cli.ts` |
| setup |  | `plugins/manual-kit/bin/manual-kit` |
| shotlist |  | `src/cli.ts` |
| sign |  | `src/cli.ts` |
| snap |  | `src/cli.ts` |
| walkthrough |  | `src/cli.ts` |

## In-page sections

(none found)

## Roles

(none found)

## Permissions

(none found)

## Workflow states and value sets

- **BITEXACT**: `-map_metadata` → `-1` → `-fflags` → `+bitexact` → `-flags:v` → `-flags:a` (`src/encode.ts:208`)
- **CONFIGS**: `nuxt.config.ts` → `nuxt.config.js` → `nuxt.config.mjs` (`src/adapters/nuxt-routes.ts:24`)
- **CONFIG_FILES**: `manual.config.ts` → `manual.config.json` → `manual.config.yaml` → `manual.config.yml` (`src/config.ts:471`)
- **FONTS**: `Sarabun-SemiBold.ttf` → `Sarabun-Bold.ttf` (`src/walkthrough/build.ts:33`)
- **HOOKS**: `data-testid` → `data-test` → `data-cy` → `id` → `aria-label` → `name` → `placeholder` → `title` (`src/capture-failure.ts:79`)
- **ItemKind**: `route` → `role` → `permission` → `section` → `flag` (`src/adapters/types.ts:3`)
- **NEXT_STRING_FILES**: `app/**/*.{tsx,jsx}` → `src/**/*.{tsx,jsx}` → `components/**/*.{tsx,jsx}` → `pages/**/*.{tsx,jsx}` (`src/adapters/frameworks.ts:77`)
- **OUTPUTS**: `pdf` → `docx` → `web` → `video` (`src/inputs.ts:85`)
- **PACKAGE_FILES**: `package.json` → `go.mod` → `pyproject.toml` → `composer.json` → `Gemfile` → `Cargo.toml` → `pom.xml` → `build.gradle` → `build.gradle.kts` (`src/discover.ts:91`)
- **PAGES_DIRS**: `pages` → `app/pages` → `src/pages` (`src/adapters/nuxt-routes.ts:23`)
- **PALETTE**: `#2e3440` → `#ff6b6b` → `#4fd18b` → `#f5c542` → `#6aa8ff` → `#d48cff` → `#4fd1d1` → `#d8dee9` → `#7b8597` → `#ff8f8f` → `#7ee2a8` → `#ffd76a` → `#8fbcff` → `#e2a8ff` → `#7ee2e2` → `#ffffff` (`src/terminal.ts:135`)
- **PLAIN_ALLOW**: `PDF` → `DOCX` → `CSV` → `PNG` → `JPG` → `JPEG` → `OTP` → `SMS` → `USB` → `LINE` → `HTML` → `iPhone` → `iPad` → `iOS` → `macOS` (`src/check.ts:75`)
- **ROUTER_OPTIONS**: `app/router.options.ts` → `router.options.ts` → `src/router.options.ts` → `app/router.options.js` → `router.options.js` (`src/adapters/nuxt-routes.ts:25`)
- **RUNTIME**: `playwright` → `pagedjs` → `typescript` (`scripts/bundle-plugin.mjs:17`)
- **SPA_ROUTERS**: `react-router-dom` → `react-router` → `wouter` → `@tanstack/react-router` (`src/discover.ts:226`)
- **TokenKind**: `ui` → `shot` → `steps` → `clip` → `data` → `link` → `unknown` (`src/pages.ts:35`)

## Form fields

| Field | Type / label | Source |
|---|---|---|
| ... | input | `src/discover.ts:315` |

## Messages users can meet (errors, validation, notices)

| Message |  | Source |
|---|---|---|
| ${OUTLINE_MAP} belongs to ${stored.baseUrl}, not ${baseUrl}: move it away to publish to another wiki |  | `src/publish/outline.ts:141` |
| ${OUTLINE_MAP} belongs to collection ${stored.collection.id}, not ${collectionArg}: move it away to publish to another collection |  | `src/publish/outline.ts:143` |
| ${file} has no video stream |  | `src/media/probe.ts:16` |
| ${j.kind} "${j.id}": ${new URL(url).hostname} is not in capture.allowlist |  | `src/capture.ts:935` |
| ${j.kind} "${j.id}": upload ${JSON.stringify(a.upload)}: file "${f}" does not exist (upload files are relative to the manual folder) |  | `src/capture.ts:880` |
| ${key}: ${rel} not found in ${project.manualDir} |  | `src/front-matter.ts:185` |
| ${new URL(base).hostname} is not in capture.allowlist (${config.capture.allowlist.join(', ')}) |  | `src/capture.ts:867` |
| ${new URL(capture.baseUrl).hostname} is not in capture.allowlist (${capture.allowlist.join(', ')}) |  | `src/walkthrough/measure.ts:30` |
| ${new URL(url).hostname} is not in capture.allowlist |  | `src/capture.ts:386` |
| ${new URL(url).hostname} is not in capture.allowlist (${config.capture.allowlist.join(', ')}) |  | `src/runtime-routes.ts:48` |
| --login ${f.login}: ${parsed.error.issues.map((i) => |  | `src/inputs.ts:135` |
| --login is used with --runtime |  | `src/cli.ts:163` |
| --only "${p}" matches no shot, step set or clip; ${hint} |  | `src/capture.ts:162` |
| --outputs: unknown ${bad.join(', ')} (choose from ${OUTPUTS.join(', ')}) |  | `src/inputs.ts:117` |
| --redact: unknown ${bad.join(', ')} (choose from ${Object.keys(REDACT_PRESETS).join(', ')}, or none) |  | `src/inputs.ts:124` |
| --runtime needs a manual config (capture.baseUrl and capture.allowlist): run manual-kit init first |  | `src/cli.ts:164` |
| Authentication required |  | `tests/helpers/outline-mock.ts:43` |
| Cannot read ${configFile}: ${(e as Error).message} |  | `src/config.ts:497` |
| HyperFrames render failed in ${dir} (exit ${r.status ?? r.signal}):\n${tail} |  | `src/walkthrough/build.ts:193` |
| Invalid ${COVERAGE_FILE}:\n${formatIssues(parsed.error.issues)} |  | `src/coverage.ts:37` |
| Invalid ${LOCK_FILE}; delete it and sign again |  | `src/lock.ts:22` |
| Invalid ${SHOTS_FILE}: ${kind} "${id}": "show" works only in a terminal spec |  | `src/shots.ts:263` |
| Invalid ${SHOTS_FILE}: ${kind} "${id}": login "${spec.login}" is not in logins (${Object.keys(shots.logins).join(', ') \|\| 'none defined'}) |  | `src/shots.ts:262` |
| Invalid ${SHOTS_FILE}: login "${name}": a login with storageState needs a name of letters, digits, - and _ (it names the file ${authPath('<name>')}) |  | `src/shots.ts:259` |
| Invalid ${SHOTS_FILE}:\n${formatIssues(parsed.error.issues)} |  | `src/shots.ts:256` |
| Invalid config ${configFile}:\n${formatIssues(parsed.error.issues)} |  | `src/config.ts:500` |
| No manual.config.(ts\|json\|yaml) in ${dir}. Run "manual-kit init" first. |  | `src/config.ts:492` |
| Outline upload of ${name}: ${res.status} ${res.statusText} |  | `src/publish/outline.ts:265` |
| Packages the manual-kit plugin installs at session start (not bundled). |  | `scripts/bundle-plugin.mjs:50` |
| Resource not found |  | `tests/helpers/outline-mock.ts:46` |
| a captured clip needs segments (at least one) |  | `src/shots.ts:202` |
| a component name |  | `src/config.ts:52` |
| a group id is listed twice |  | `src/config.ts:212` |
| a route path starting with / |  | `src/config.ts:84` |
| a section needs component or selector |  | `src/config.ts:55` |
| an environment variable name such as MANUAL_USER (never the value) |  | `src/inputs.ts:15` |
| answers ${file}: expected a map of config keys |  | `src/inputs.ts:50` |
| answers ${file}: login: ${parsed.error.issues.map((i) => |  | `src/inputs.ts:54` |
| book "${b}": use lower-case letters, digits and "-" (it is a folder name) |  | `src/init.ts:242` |
| book "${opts.book}" is made from "${from.book}" (books.${opts.book}.from) and has no pages of its own: use --book ${from.book} and set the page's audience |  | `src/sign.ts:45` |
| book "${opts.book}" is made from another book (books.${opts.book}.from): publish that book instead |  | `src/publish/outline.ts:74` |
| book "${opts.book}" must be a lower-case folder name |  | `src/sign.ts:43` |
| cannot read answers ${file}: ${(e as Error).message} |  | `src/inputs.ts:48` |
| capture.settle.spinners: "${state.invalid}" is not a CSS selector |  | `src/capture.ts:336` |
| clips need media level "steps+video" (now "${config.media}") |  | `src/encode.ts:212` |
| environment variable ${name} is not set (used as {env:${name}} in shots.yaml) |  | `src/capture.ts:68` |
| expected <book>=<${field}>, got "${p}" |  | `src/inputs.ts:99` |
| ffmpeg not found (install it, or set FFMPEG=/path/to/ffmpeg) |  | `src/encode.ts:213` |
| ffprobe could not read ${file} (install ffmpeg, or set FFPROBE): ${(e as Error).message.split('\n')[0]} |  | `src/media/probe.ts:12` |
| front matter is not valid YAML: ${(e as Error).message} |  | `src/pages.ts:143` |
| give either url or terminal (an app page, or a transcript file), not both |  | `src/shots.ts:120` |
| give one of url, terminal or video (an app page, a transcript file or a ready-made video) |  | `src/shots.ts:201` |
| give page ids or --all |  | `src/cli.ts:220` |
| give { selector: "..." } (an element on the page) or { url: /path } (the address starts with it) |  | `src/shots.ts:61` |
| invalid front matter:\n${formatIssues(parsed.error.issues)} |  | `src/pages.ts:148` |
| letters, digits, . _ - |  | `src/config.ts:49` |
| login "${name}" (${lang}) failed: ${await failureReport(page, project.manualDir, |  | `src/capture.ts:778` |
| login "${name}" is not in shots.yaml logins (${Object.keys(logins).join(', ') \|\| 'none defined'}) |  | `src/login.ts:37` |
| login "${name}" signs in with actions during capture; to sign in by hand instead, give it storageState: true (and until) in shots.yaml |  | `src/login.ts:38` |
| login "${name}": ${relative(process.cwd(), file)} is not a saved session; sign in again with: ${loginCommand(name)} |  | `src/capture.ts:795` |
| login "${opts.login}" is not in shots.yaml (logins: ${Object.keys(shots.logins).join(', ') \|\| 'none'}) |  | `src/runtime-routes.ts:45` |
| login "${spec.login}": ${new URL(loginUrl).hostname} is not in capture.allowlist |  | `src/capture.ts:939` |
| lower-case id like "teacher.create-class" |  | `src/pages.ts:11` |
| mask "${m}" matched nothing, so nothing was covered |  | `src/capture.ts:1054` |
| more than ${MAX_REDIRECTS} redirects from ${bare(req.url())} |  | `src/capture.ts:624` |
| name the Outline collection: --collection <id or urlId> (or outline.collection in the config) |  | `src/publish/outline.ts:137` |
| name the Outline wiki: outline.baseUrl in the config, such as https://wiki.example.com |  | `src/publish/outline.ts:134` |
| no route ${path} |  | `tests/helpers/outline-mock.ts:87` |
| no web build yet: run "manual-kit build web" first |  | `src/cli.ts:400` |
| not a WebP file |  | `src/media/webp.ts:10` |
| not a storageState |  | `src/capture.ts:793` |
| not a valid regular expression |  | `src/config.ts:28` |
| nothing to build: config outputs has pdf, docx and web all off |  | `src/cli.ts:250` |
| optional needs a target: press on an element (on: selector) |  | `src/shots.ts:22` |
| package "${name}" is not installed${home ? |  | `src/deps.ts:16` |
| page id "${id}" must be lower-case letters, digits, ".", "-" or "_" |  | `src/sign.ts:42` |
| regex flags: any of i m s u v y d (g is always on) |  | `src/config.ts:32` |
| seed hook failed (exit ${r.status}): ${(r.stderr \|\| r.stdout).trim().slice(0, 500)} |  | `src/capture.ts:947` |
| set the Outline API key in the environment variable ${TOKEN_ENV} (it is never read from a file) |  | `src/publish/outline.ts:139` |
| shot "${shot}" is not an app screen in shots.yaml |  | `src/walkthrough/measure.ts:81` |
| snap opens local files and 127.0.0.1/localhost only, not ${url.hostname} |  | `src/snap.ts:15` |
| terminal transcript "${t.file}" does not exist |  | `src/capture.ts:357` |
| the answers make an invalid config:\n${formatIssues(parsed.error.issues)} |  | `src/init.ts:254` |
| the element has no box on the page |  | `src/capture.ts:205` |
| unknown page "${id}" |  | `src/sign.ts:17` |
| use element and crop separately (element photographs one element, crop a fixed region) |  | `src/shots.ts:90` |
| video "${video.file}" does not exist |  | `src/capture.ts:965` |
| walkthrough "${only}" is not in shots.yaml (${Object.keys(shots.walkthroughs).join(', ') \|\| 'none defined'}) |  | `src/walkthrough/measure.ts:19` |
| walkthrough "${opts.only}" is not in shots.yaml (${Object.keys(shots.walkthroughs).join(', ') \|\| 'none defined'}) |  | `src/walkthrough/build.ts:126` |
| walkthroughs are shown as clips, which need media level "steps+video" (now "${config.media}") |  | `src/walkthrough/build.ts:123` |

## API routes

(none found)

## Feature flags

(none found)

## Integrations

(none found)

## Environment names (values are never read)

`FFMPEG`, `FFPROBE`, `MANUAL_KIT_HOME`, `OUTLINE_API_KEY`

## Running it locally

- `build`: `tsc -p tsconfig.build.json`
- `check`: `tsc -p tsconfig.json --noEmit`
- `test`: `vitest run`
- `verify`: `pnpm check && pnpm bundle && pnpm test && pnpm build`
- `prepare`: `tsc -p tsconfig.build.json`
- `bundle`: `node scripts/bundle-plugin.mjs`

## Seed / demo data

- `tests/helpers/fixture.ts`
- `tests/helpers/outline-mock.ts`

## UI strings (sample)

"setup", "doctor", "building-product-manuals", "manual", "--manual", "--verbose", "init", "--languages", "--title", "--adapter", "--books", "--no-samples", "--ignore-dist", "--ci", "--answers", "--app-url", "--environment", "--allowlist", "--login", "--login-url", "--user-env", "--password-env", "--cookie", "--cookie-env", "--client", "--developer", "--system-name", "--logos", "--cover-image", "--audience", "--book-icon", "--brand-color", "--accent-color", "--outputs", "--redact", "discover", "--print", "--runtime", "inventory", "check", "--json", "--allow-unsigned", "--docx", "--font", "--latin-font", "sign", "--all", "new-page", "--kind", "build", "--lang", "--book", "--base", "--finalize", "shotlist", "capture", "--changed", "--only", "--dry-run", "login", "encode", "walkthrough", "measure", "--list", "--no-render", "snap", "--width", "--out", "publish", "outline", "--collection", "--parent", "preview", "--port", "--no-open"
