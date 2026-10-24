# manual-kit

เครื่องมือสร้างและดูแล **คู่มือการใช้งานระบบแบบทางการ** (PDF / Word) ที่ตรงกับระบบจริงเสมอ
ไม่มีการเรียก AI และไม่ต้องใช้ API key: ทุกคำสั่งให้ผลเหมือนเดิมเมื่อรันซ้ำ การเขียนเนื้อหาเป็นงานของคนหรือ skill
รายละเอียดการออกแบบ: `docs/spec.md` · แผน v0: `docs/plan-v0.md`

A tool for formal, customer-facing user manuals (PDF / DOCX) that stay in step with the code.
No AI calls, no API keys; every command is deterministic. Writing the content is a job for people (or a skill).

> ใน Claude Code ให้ใช้ plugin (ดู README) ซึ่งมีคำสั่ง `manual-kit` และติดตั้งทุกอย่างให้เอง หน้านี้คือคู่มืออ้างอิงของคำสั่ง
> In Claude Code use the plugin (see the README); this page is the command reference.

## เริ่มใช้งาน (ภาษาไทย)

ต้องมี Node.js 22.17 ขึ้นไป (พัฒนา repo ที่รันไฟล์ `.ts` ตรง: 22.18 ขึ้นไป), pandoc (สำหรับ DOCX) และ Chromium ของ Playwright (`pnpm exec playwright install chromium`)

```bash
manual-kit init --languages th,en --adapter json-i18n   # สร้าง manual/ (ไม่เขียนทับไฟล์เดิม) เพิ่ม --ci [github|gitlab] เพื่อสร้างงาน CI
#   --books user-guide,admin-guide  สร้างหลายเล่ม · --no-samples ไม่ใส่หน้าตัวอย่าง (สร้างแค่โฟลเดอร์)
#   --ignore-dist ใส่ dist/ ใน manual/.gitignore (ค่าเริ่มต้น: commit PDF/DOCX/เว็บที่ build แล้วไปกับคู่มือ)
#   ท้ายผลลัพธ์มีรายการข้อมูลโครงการที่ยังขาด ตอบทีเดียวในไฟล์แล้วรัน manual-kit init --answers <file> (ดู Project inputs)
manual-kit discover                     # สแกนเอกสาร/หน้าจอ/บทบาท/สถานะงาน/ฟอร์ม/ข้อความ/API -> manual/discovery.json + discovery.md (ใช้เขียน manual-spec.md)
#   --runtime [path] [--login <name>]  อ่านตารางเส้นทางจาก Vue Router ของแอปที่รันอยู่ด้วย (Nuxt, Vue) ดู Adapters
manual-kit inventory                    # อ่านโค้ด -> coverage.yaml (ของใหม่ = unmapped)
manual-kit new-page teacher.create-class --kind how-to --book user-guide --title "สร้างห้องเรียน"
# เขียนหน้า: อ้างชื่อปุ่มด้วย {{ui:key}} หรือ {{ui:"ข้อความบนปุ่ม"}} ภาพด้วย {{shot:id}} ขั้นตอนด้วย {{steps:id}} ค่าจากโค้ดด้วย {{data:ns.key}} ลิงก์ด้วย [[page-id]]
manual-kit shotlist                     # รายการภาพที่ต้องถ่าย
manual-kit login main                   # login ด้วยมือในหน้าต่าง browser (SSO, 2FA, ThaiD) แล้วบันทึก session ให้ capture ใช้ (logins.main ที่มี storageState: true)
manual-kit capture [--changed] [--only <ids>] [--dry-run]   # ถ่ายภาพจากระบบที่รันอยู่ (เฉพาะ host ใน capture.allowlist)
#   --changed ถ่ายเฉพาะที่ spec เปลี่ยน หรือไฟล์หายจากดิสก์ (ภาพ, ภาพขั้นตอน, timeline หรือเฟรมของคลิป)
#   --only <ids> ถ่ายเฉพาะภาพ/ชุดขั้นตอน/คลิปที่ id ตรง ใช้ * ได้ (--only 'user-*') คั่นด้วย , หรือใส่ซ้ำ; รวมกับ --changed = ต้องตรงทั้งสอง
#   --dry-run บอกว่าจะถ่ายอะไรและเพราะอะไร, login และ host ที่ต้องใช้ โดยไม่เปิด browser และไม่เขียนไฟล์
manual-kit check [--json] [--allow-unsigned]   # ตรวจทุกกฎ exit 1 เมื่อมีข้อผิด (ใช้ใน CI)
manual-kit sign <ids...> | --all        # คนรับรองหน้าหลังอ่านทวนแล้ว (คนเท่านั้น ไม่ใช่ CI หรือเอเจนต์)
manual-kit build docx --finalize libreoffice   # ใส่เลขหน้าในสารบัญด้วย LibreOffice (ไม่มี Word ก็ได้)
manual-kit build pdf|docx|web [--lang th] [--book user-guide]   # -> manual/dist/<book>.<lang>.pdf|docx, dist/web/
manual-kit build                        # ทุกผลลัพธ์ที่เปิดใน config outputs (pdf, docx, web)
manual-kit preview                      # เปิดเว็บคู่มือในเครื่อง (127.0.0.1)
manual-kit snap manual/dist/web/index.html --width 1280,390   # ภาพเต็มหน้าเพื่อตรวจผล
manual-kit walkthrough measure && manual-kit walkthrough build   # วิดีโอสาธิตจากภาพที่ถ่ายไว้แล้ว (shots.yaml walkthroughs, HyperFrames)
```

วงจรเมื่อระบบเปลี่ยน: PR แก้โค้ด -> `check` ใน CI ชี้หน้าที่ sources เปลี่ยน, `{{ui}}` ที่หายไป หรือหน้าจอ/บทบาทใหม่ที่ยังไม่มีหน้า -> แก้เฉพาะหน้านั้น -> `capture --changed` -> `sign` -> ผ่าน
ของที่ยังไม่ทำให้ตั้ง `status: manual-later` ใน coverage.yaml: ผ่านได้ แต่ `check` รายงานค้างทุกครั้ง

**การรับรอง (sign) ทำโดยคนเท่านั้น** `sign` บันทึกว่ามีคนอ่านหน้านั้นแล้วและเห็นว่าตรงกับระบบ CI, สคริปต์ และเอเจนต์ AI
ห้ามรัน `sign` เอง หน้าที่ยังไม่รับรองหรือแก้หลังรับรองจะถูกแสดงในรายการ `not signed` ทุกครั้งที่รัน `check`
ค่าเริ่มต้น (`signing: required`) ทำให้ `check` ไม่ผ่าน ถ้าต้องการให้ CI ของ branch ผ่านระหว่างรอคนอ่าน ใช้
`check --allow-unsigned` หรือตั้ง `signing: warn` ใน config (กลายเป็นคำเตือน แต่ยังแสดงรายการ)

## Quick start (English)

```bash
manual-kit init --languages th,en --adapter json-i18n
manual-kit inventory && manual-kit new-page about.system --kind concept --book user-guide
manual-kit capture && manual-kit check --allow-unsigned
# a person reads every page, then: manual-kit sign --all
manual-kit build          # every output on in config outputs: { pdf, docx, web }
manual-kit preview        # serve the web build on 127.0.0.1 and open it
```

## Page tokens

| token | becomes |
|---|---|
| `{{ui:portal.login.submit}}` | the UI string with that key in the page's language (bold) |
| `{{ui:"Save draft"}}` | a label quoted by its visible text (spaces, slashes allowed): found by key or by exact text; adapters that read labels from source (`nextjs`, `nuxt`, `react-spa` without i18n, `generic`) make the text its own key. Language twins may quote different labels. `check` fails when the label is no longer in the code |
| `{{data:limits.class.max}}` | a value from a project JSON/YAML file (adapter `data:`) |
| `{{shot:id}}` / `{{steps:id}}` / `{{clip:id}}` | an image, step images or a clip (or a walkthrough video) from shots.yaml |
| `[[page-id]]` | a link to another page (its title) |

Use `-m, --manual <dir>` when the manual folder is not `./manual`. `projectRoot` in the config (default `..`)
points at the code the adapter reads and the page `sources` are hashed against; it can be another (read-only) folder.
`init` and `discover` (before `init`) take the project as the nearest folder above the manual with `.git`, else the
current folder when the manual is inside it: `init -m docs/manual` writes `projectRoot: ../..`, and a CI job it
writes runs `manual-kit -m docs/manual check`.

Commands that work through many items print one summary line, plus every failure and warning in full (the item and
the cause): `capture` prints `captured 48 (40 shots, 3 step sets, 5 clips), 0 failed (3m12s)`, `encode` prints
`encoded 5 clips, 0 skipped (1m04s)`, `walkthrough build` prints `rendered 2, 0 skipped (2m40s)`, and `build` prints a
line per format such as `pdf: wrote 2 files in manual/dist (4.1s)` or `web: wrote 3 index pages in manual/dist/web`.
`-v, --verbose` (before or after the command) also prints one line per item: each image, clip or file.

`capture --only <ids>` takes only the shots, step sets and clips whose id matches: an id or a `*` glob
(`--only 'user-*'`), comma-separated or the flag repeated. With `--changed` a job must pass both. A pattern that
matches no id stops the run (exit 2) and names the closest ids. A login runs only when a selected job uses it, so
`--only` on a shot without a login never opens the sign-in page. `capture --dry-run` opens no browser, runs no
`capture.seed` and writes nothing. It prints one line per job with the reason it would run (`new`: never captured,
`spec changed`, `file missing`: an image, frame or timeline is gone, `forced`: up to date but taken because
`--changed` is not given), its login and the hosts its URLs, `goto` actions and login reach, then a summary:

```
  th shot users: spec changed; login main; hosts staging.example.com
  th shot help: new; hosts docs.example.com (not in capture.allowlist), staging.example.com
dry run: 2 to capture (2 shots); logins: main (no saved session: run manual-kit login main); hosts: docs.example.com, staging.example.com; nothing opened or written
```

The exit code is 0, or 2 for a config error, including a host outside `capture.allowlist` (named on stderr).

`init --books user-guide,admin-guide` creates several books (known titles for user, admin and operations guides; other
names become words to edit), `--no-samples` writes no sample page, `--ignore-dist` adds `manual/.gitignore` with
`dist/` (by default nothing is ignored: the built documents are committed with the manual). A configured book with no pages in a language is a
`check` warning and a `WARNING` on stderr from `build`; it is never skipped silently.

### Project inputs (`init` answers and checklist)

`init` also takes every project input up front and ends with a checklist. **Still missing** lists the keys that are
blank or still hold what init wrote; **Confirm** shows books, title, outputs and redaction as they are:

```
Still missing (ask for all of these in one round, put the answers in a file, run "manual-kit init --answers <file>"):
  - books.user-guide.audience: who reads "user-guide" (shown as "For ..." on its web card)
  - capture.baseUrl: app URL to capture (a test environment, never production)
  - login: how capture signs in: form (env var names for user and password), cookie (cookie name and its env var), or none; never the values
  - document.logos: organisation seal and system logo (image files: seal first, system second)
Confirm:
  - books: user-guide
  - document.title: "คู่มือการใช้งานระบบ"
  - outputs: pdf, docx (choose from pdf, docx, web, video)
  - capture.redact.presets: none (blur personal data: email, thai-name, latin-name)
```

Answer with flags, an answers file, or both (flags win). The file is YAML or JSON with config keys at the top level
plus `login`:

```yaml
books: { user-guide: { audience: { th: เจ้าหน้าที่, en: Staff }, description: ..., icon: assets/user.png } }
capture: { baseUrl: "https://staging.example.com", environment: staging, redact: { presets: [email, thai-name] } }
document: { title: ..., client: ..., developer: ..., logos: [assets/seal.png, assets/system.svg], coverImage: assets/cover.webp }
web: { brand: { name: ชื่อระบบ, colors: { brand: "#0d2470", accent: "#f2a900" } } }
outputs: { pdf: true, docx: true, web: true }
media: steps+video
login: { type: form, url: /login, userEnv: MANUAL_USER, passwordEnv: MANUAL_PASSWORD }   # or { type: cookie, cookie: session, valueEnv: APP_SESSION }, or { type: none }
```

| flag | sets |
|---|---|
| `--answers <file>` | everything in the file |
| `--app-url <url>` | `capture.baseUrl`; its host joins `capture.allowlist` |
| `--environment <name>` | `capture.environment` (e.g. staging, uat) |
| `--allowlist <hosts>` | more `capture.allowlist` hosts (added, never removed) |
| `--login none\|form\|cookie`, `--login-url`, `--user-env`, `--password-env`, `--cookie`, `--cookie-env` | `logins.main` in shots.yaml |
| `--client`, `--developer`, `--system-name` | `document.client`, `document.developer` (shown alone), `web.brand.name` |
| `--logos seal,system`, `--cover-image <file>` | `document.logos`, `document.coverImage` |
| `--audience <book>=<text>`, `--book-icon <book>=<file>` (repeat per book) | `books.<id>.audience`, `books.<id>.icon` |
| `--brand-color`, `--accent-color` | `web.brand.colors.brand`, `.accent` |
| `--outputs pdf,docx,web,video` | `outputs`; `video` sets `media: steps+video` |
| `--redact email,thai-name,latin-name\|none` | `capture.redact.presets` |

A key takes an answer only while it is blank, `(รอระบุ)` or the value init wrote, so a value a person set is never
changed and running init again changes nothing; edit the config to change a set value. Credentials are environment
variable names only: the login spec reads them as `{env:NAME}`, and a login answer with any other key (such as
`password`) is refused. Answers that make an invalid config are refused before anything is written. A `.ts` or
`.json` config is not edited: init says so and the answers are set by hand. File paths (logos, icons, cover) are
relative to the manual folder; the checklist reports a path whose file does not exist.

## CI

`init --ci github|gitlab` writes a job that runs `manual-kit check --allow-unsigned` on every pull / merge request;
`--ci` alone picks GitLab when the project has `.gitlab-ci.yml`, else GitHub. Without `--ci`, init writes and prints
no CI job, only a line saying `init --ci` adds one.

- GitHub: `.github/workflows/manual-check.yml` (read-only permissions).
- GitLab: `.gitlab/ci/manual-check.gitlab-ci.yml` (job `manual-check`, image `node:24`, merge request pipelines). A new
  `.gitlab-ci.yml` includes it; an existing one is never edited, init prints the `include:` lines to add. Optional
  `artifacts:` (built PDF in `manual/dist/`) are in the file, commented out.

Both install manual-kit only from a pinned source in the CI variable `MANUAL_KIT_SPEC`, never from the npm registry by
name: a release tarball URL plus `MANUAL_KIT_SHA256` (checked with `sha256sum -c`), or
`git+https://.../manual-kit.git#<40-character commit SHA>`. Anything else stops the job.

## Signing (people only)

`manual-kit sign` records that **a person read the page and found it matches the system**. Tools, CI and AI agents never
run it. `check` always lists the pages that are not signed or changed since (`not signed (n): ...`, `unsigned` in
`--json`). With `signing: required` (default) they fail `check`, one error line per page; `check --allow-unsigned` (one
run, e.g. CI on a branch) or `signing: warn` (config) turns them into warnings, and the text report then shows only the
`not signed` line (`--json` still has one finding per page).

## Folder layout

```
manual/
  manual.config.(ts|json|yaml)   document info, languages, books, outputs, media level, adapter, capture, wording rules
  pages/<lang>/<book>/NN-slug.md  pages (front matter: id, title, audience, book, kind, routes, covers, sources)
  shots.yaml                      screenshots and step-by-step images
  coverage.yaml                   what needs a page -> which page (written by inventory, mapped by people)
  manual.lock.json                signatures (hashes of page files and their sources)
  media/                          captured images + manifest.json (spec hash per image)
  .auth/<login>.json              sessions saved by `manual-kit login` (secrets; the folder ignores itself in git)
  templates/                      optional: reference.docx (templates.docx), print CSS (templates.pdfCss)
  dist/                           build output
```

### manual.config.yaml (main keys)

```yaml
projectRoot: ..                    # the code the adapter reads (relative to manual/)
languages: [th, en]                # first = primary
books: { user-guide: { title: { th: คู่มือผู้ใช้, en: User guide }, icon: templates/user.png } }   # icon: optional, in the cover's book name
  # groups: [{ id: inbox, title: { th: หนังสือเข้า, en: Inbox } }, ...]   menu order of the book (see Web: menu order)
  # clerk-guide: { title: คู่มือเจ้าหน้าที่, from: { book: user-guide, audience: [clerk] } }   a role book (see Web: one site, role books)
document:                          # front matter of every book (cover, document control, approval page, introduction)
  title: คู่มือการใช้งานระบบ
  client: (รอระบุ)
  project: ชื่อโครงการ
  docNumber: (รอระบุ)
  version: "1.0"
  date: "2026-10-06"
  classification: (รอระบุ)
  preparedBy: (รอระบุ)
  approvers: [{ name: (รอระบุ), role: ผู้อนุมัติ }]
  revisions: [{ version: "1.0", date: "2026-10-06", author: (รอระบุ), changes: ฉบับแรก }]
  purpose: ...                     # also scope, audience, contact
  glossary: [{ term: บัญชีผู้ใช้, definition: ... }]
  logos: [templates/seal.png, templates/system-logo.png]   # formal cover: organisation seal first, system logo second
  developer: (รอระบุ)               # company that built the system, shown alone (no "developed by" prefix)
  coverImage: templates/cover.webp  # optional illustration on the formal cover
  clips: none                      # PDF/DOCX: none (default; video is web-only, a {{clip:}} line leaves nothing) | poster (poster figure + QR code)
outputs: { pdf: true, docx: false, web: false, dir: dist }
media: screenshots                 # none | screenshots | steps | steps+video
signing: required                  # or warn
adapter: { type: nextjs }          # none | generic | json-i18n | nextjs | nuxt | react-spa (see Adapters)
adapter: { type: nextjs }          # none | generic | json-i18n | nextjs | nuxt (see Adapters)
discover: { include: [apps/web], exclude: [prototype, "services/*"] }   # the files discover, inventory and the adapter read (see Discover scope)
capture: { baseUrl: "http://localhost:5173", environment: staging, allowlist: [localhost, 127.0.0.1], assetHosts: [], viewport: { width: 1280, height: 800 }, seed: "npm run db:seed" }
  # redact: { style: blur, presets: [email, thai-name], text: ["\\d{3}-\\d{7}"], images: [".signature img"] }
  # settle: { networkIdle: true, spinners: [".my-loader"], timeoutMs: 10000 }   (see "Before each image")
wording: { superlatives: true, plainLanguage: true, allow: [PDF, LINE], forbidden: [{ pattern: "\\bclick\\b", message: "say press", lang: en }] }
  # stepLength: { th: 120, en: 160 }, stepImages: true, problemMessages: true, videoInProse: true   (see "Steps and problems")
docx: { finalize: auto }           # auto | libreoffice | word | none
templates: { cover: formal, pdfCss: templates/print.css, docx: templates/reference.docx }   # cover: formal | neutral
```

All keys and their checks: `src/config.ts` (`ConfigSchema`).

### Discover scope

A workspace often holds several repositories: the app the manual documents, other services, a prototype.
`discover.include` and `discover.exclude` are globs relative to `projectRoot` that name the files `discover`,
`inventory` and the adapter read: routes, roles, permissions, flags, environment names, UI strings, documents, forms,
messages, sections and seed data. A file is read when it matches an `include` glob (or `include` is empty) and no
`exclude` glob. A glob also covers everything inside a folder it names, so `prototype`, `prototype/**` and
`**/prototype` all leave out `prototype/.env.example`. The project's own `package.json` is always read (name,
scripts, integrations).

```yaml
discover:
  include: [apps/web]               # only the app being documented
  exclude: [prototype, "services/*"]   # or leave out the rest
```

An excluded file never appears in `discovery.json`, `discovery.md` or `coverage.yaml`: `inventory` drops the items an
earlier run took from it (they are out of scope, not `removed`). `discover` lists the folders that hold their own
`package.json`, `go.mod`, `pyproject.toml` and similar as `project.packageRoots`. When there are several and no scope
is set, `discover` and `init` print a `discover.exclude` list to copy; keep the documented app out of it.

`discover.*` names files; `coverage.include` / `coverage.exclude` (below) name item ids such as `role:*`.

## Coverage

`inventory` lists what in the product needs a page (routes, roles, permissions, sections, flags) in `coverage.yaml`.
Map an item from the page that documents it: `routes: [/teacher]` covers `route:/teacher`, and
`covers: [role:teacher, "perm:classes.*"]` covers any other id (`*` is a wildcard). `inventory` shows these as `auto`;
`check` recomputes them from the pages, so a page edit maps the item without re-running inventory. `pages:` in
coverage.yaml is for mapping by hand. A `covers` entry that matches no item is an error on the page.

| status | meaning | check |
|---|---|---|
| `mapped` | a page covers it (front matter or `pages`) | passes |
| `unmapped` | nothing covers it yet | error |
| `manual-later` | set by a person: will be written later | warning, every run |
| `ignored` | set by a person with a `note`: needs no page | passes |
| `removed` | set by inventory: no longer in the code | error until the pages are updated and the item deleted |

## What `check` verifies

front matter, duplicate ids, book folder, languages, **language twins** (every page in every language with the same
tokens), `{{ui:}}` keys exist per language, `{{data:}}`, links, unknown tokens, shot specs exist and images are present
and not stale (per media level `none | screenshots | steps`), page sources exist, coverage (unmapped/removed fail,
manual-later warns, `covers` entries match), books without pages (warning), **signatures** (page edited or sources
changed since signing; see Signing), wording (built-in superlatives in Thai/English plus project rules such as "the
mascot is Codi"), how-to structure, step length, steps without images, problem titles and video lines (warnings,
below).

**Manual spec** (warning, once `manual/manual-spec.md` exists): every route, role, permission and flag that `discover`
finds is named in the spec. A route glob in backticks names a group of routes: `` `/settings/roles*` `` covers
`/settings/roles`, `/settings/roles/create` and `/settings/roles/:id/edit` (`*` matches any characters, `/` included,
as in `covers`). A glob that matches no discovered route is a warning at its line.

The text report prints errors first. Findings with the same rule and message are one line that lists every place,
e.g. `warning  wording      pages/th/a.md:3,9 pages/th/b.md:4  "API" looks like an all-caps code: ...`. `--json` keeps
one finding per place.

**Plain language** (warning, on by default; `wording.plainLanguage: false` turns it off): page text, outside tokens,
front matter, code blocks, code spans, link targets and URLs, must not show system words. It flags route paths
(`/documents/:id`), environment names (`NEXT_PUBLIC_URL`), `snake_case` and `camelCase` names, namespaced keys
(`portal:admin`), ALL-CAPS codes of three or more letters (`WAIT`, `RECEIVED`), and "พัฒนาโดย" / "พัฒนาระบบโดย" (show
the company name alone). Write what the reader sees on screen instead: the button label, the status as displayed, the
page name. Words the reader does know go in `wording.allow` (exact match), on top of a few common ones (PDF, DOCX,
CSV, PNG, JPG, OTP, SMS, USB, LINE, HTML, iPhone, iOS, macOS).

**How-to structure** (warning): a `kind: how-to` page in Thai or English has these `##` headings, in this order
(one list in `src/how-to.ts` feeds the rule, `new-page --kind how-to` and the FAQ):

| part | Thai | English | |
|---|---|---|---|
| intro | `<งาน>คืออะไร` (ends with คืออะไร) | `What is <task>` (starts with What is / What are) | required |
| steps | `วิธี<งาน>` (starts with วิธี, not วิธีแก้) | `How to <task>` (starts with How to) | required |
| notes | `ข้อควรทราบ` | `Good to know` | optional |
| problems | `ปัญหาที่อาจพบและวิธีแก้ไข` | `Problems and fixes` | required |
| related | `คำถามที่เกี่ยวข้อง` | `Related questions` | optional |

A page that still uses the old headings (ก่อนเริ่ม / Before you start, ขั้นตอน / Steps, ผลลัพธ์ที่ได้ / Result,
ปัญหาที่พบบ่อย / Common problems, หน้าที่เกี่ยวข้อง / Related pages) builds as before; the warning names the new
heading for each. `new-page --kind how-to --title "<task>"` writes the five parts with the task in the first two
headings and a writing hint (an HTML comment) in each.

**Problems** are list items (or paragraphs) of two lines, labels plain or bold; the title is the system's message,
verbatim, in quotes:

```markdown
- ปัญหา: “กรุณาเพิ่มหนังสือหลัก”
  วิธีแก้ไข: แนบไฟล์หนังสือหลัก แล้วคลิกปุ่ม “บันทึก” อีกครั้ง
- Problem: "Please add the main document"
  Fix: attach the main document, then click “Save” again.
```

In the PDF and DOCX the fix starts its own line under the problem (a hard line break is added at build time; the web
shows the same two lines).

The FAQ page collects these from every `ปัญหาที่อาจพบและวิธีแก้ไข` / `Problems and fixes` section and from the old
`ปัญหาที่พบบ่อย` / `Common problems`, together with the older shapes: an item that starts with the symptom in bold,
and a three-column table (what you see | cause | fix).

**Steps and problems** (warnings; each has a `wording` key):

- `wording.stepLength` (default `{ th: 120, en: 160 }`, other languages 160, `0` = off): a numbered step under the
  `วิธี…` / `How to …` heading, and each `text` of a `steps` set in shots.yaml, longer than this many characters. A
  token counts as the text it shows (`{{ui:"บันทึก"}}` as บันทึก, `{{ui:key}}` as its label, `{{data:x}}` as its
  value); a Thai vowel or tone mark counts with its letter. Sub-bullets are not steps.
- `wording.stepImages` (default on): media is `steps` or `steps+video` and the `วิธี…` section (or one of its
  `### วิธีที่ N` sub-sections) is a plain numbered list without `{{steps:id}}`.
- `wording.problemMessages` (default on): a quoted problem title that is neither a UI string of that language nor a
  message `discover` finds in the code (placeholders such as `{name}` match any text). Only when the adapter is not
  `none` and discovery finds messages; a title written as a `{{ui:"..."}}` token is checked by the ui rule instead.
- `wording.videoInProse` (default on): text that sends the reader to the video ("ดูวิดีโอ", "ชมคลิป", "วิดีโอด้านล่าง",
  "watch the video", "video below"). Video is web-only, so the line would point at nothing in the PDF and DOCX.

## Adapters

| type | routes | UI strings | also |
|---|---|---|---|
| `nextjs` | App Router `app/**/page.(tsx\|jsx\|ts\|js\|mdx)` (also `src/app`): route groups `(x)` stripped, `[id]` / `[...slug]` kept as written, parallel `@slot`, intercepting `(.)x` and private `_x` folders ignored. Pages Router `pages/**` (also `src/pages`) without `_app`, `_document`, other `_` files and `api/`; `index` is its folder. No trailing slashes | i18n files if present, else fixed text in JSX | `roles`, `flags`, `sections` |
| `react-spa` | Vite/React single-page apps, from the code in `src/**` (JS/TS/JSX/TSX, not `*.test.*`, `*.spec.*`, `*.stories.*`, `__tests__/`): `<Route path>` elements (React Router, wouter) across lines and inside layout wrappers, nested `<Route>` children joined to the parent's path (absolute children kept, wouter `nest` joins them too, `index` is the parent), route objects with `path` / `index` / `children` passed to `createBrowserRouter`, `createHashRouter`, `createMemoryRouter`, `useRoutes` or typed `RouteObject[]`; TanStack Router file routes in `src/routes` (`index` and `route` are their folder, `$id` becomes `:id`, `$` becomes `*`, `_layout` segments and `(group)` folders leave the URL, `posts_` un-nests, `-x` and `__root` are not routes). Paths that are not string literals are skipped. Each route's `source` is `file:line` | i18n files if present, else fixed text in JSX (`src/**/*.{tsx,jsx}`) | `roles`, `flags`, `sections`; `routes: { files, dir }` |
| `nuxt` | `pages/**/*.vue` (also `app/pages`, `src/pages`) plus the route config in the code, see **Nuxt routes** below | i18n JSON/YAML from `locales/`, `i18n/locales/`, `i18n/`, `lang/` or `messages/` (`<lang>.json`, `th-TH.yaml`...), else fixed text in `<template>` | `roles`, `flags`, `sections` |
| `json-i18n` | regex (`routes`) | i18n JSON per language (vue-i18n / i18next style, nested keys flattened with dots) | `roles`, `flags`, `sections` |
| `generic` | regex | regex per language | `roles`, `flags`, `sections` |
| `none` | nothing (UI tokens unavailable) | | `sections` |

Every adapter also supports `data: { ns: path/to/file.json }` for `{{data:ns.path}}`. Adapters parse code (TypeScript
compiler for JS/TS/JSX/TSX, Vue's template parser for `.vue`); they never run it.

**UI text without i18n files** (`nextjs`, `nuxt`, `react-spa`): text between tags and literal `placeholder`, `title`, `alt`,
`aria-label`, `aria-description` and `label` attributes, whitespace collapsed. Text next to an expression
(`{count} items`) is not a fixed label and is skipped. Each label is its own key and serves every language, so a page
quotes it: `{{ui:"ขั้นที่ 1: กรอกข้อมูล"}}`. `strings.files` changes the globs (default: `app/`, `src/`,
`components/`, `pages/` `*.tsx|jsx`; Nuxt `**/*.vue`; react-spa `src/**/*.{tsx,jsx}`), `strings.literals: all` also takes every other string literal
in those files (label maps in `lib/*.ts`). `i18n: { th: locales/th.json }` names the files, `i18n: false` ignores them.

```yaml
adapter:
  type: nextjs
  strings: { files: ["app/**/*.tsx", "components/**/*.tsx", "lib/**/*.ts"], literals: all }
  roles: { files: ["lib/session.ts"], pattern: '^\s+(user|admin): "', flags: m }
  sections:                       # in-page regions that need their own coverage item section:<id>
    - { id: letter.step1, route: /, component: IntakeForm, label: "ขั้นที่ 1" }   # exists while the component does
    - { id: letter.chat, route: /, selector: "#chat-drawer" }                    # named only, not checked
```

**react-spa routes**: `routes.files` replaces the globs searched for `<Route>` elements and route objects (default
`src/**/*.{tsx,jsx,ts,js}`), `routes.dir` names the TanStack Router file-route folder (default `src/routes`; `false`
for none). A route rendered inside another file's component (`<Route path="/a/*" element={<Sub />}>` with relative
`<Route>`s in `Sub`) cannot be joined to its parent and is read from `/`. `discover` and `init` pick `react-spa` when
package.json has `vite` plus `react-router-dom`, `react-router`, `wouter` or `@tanstack/react-router`, and no `next`.

```yaml
adapter:
  type: react-spa
  routes: { files: ["src/main.tsx", "src/routes/**/*.tsx"], dir: false }
coverage: { exclude: ["route:/*"] }   # a catch-all (not-found) route is rarely a page of its own
**Nuxt routes** are read from the code, never run. Each route keeps the file (and line, for routes from code) it
came from; the label says how it was found.

- Page files: `[id]` -> `:id`, `[[opt]]` -> `:opt?` (optional), `[...slug]` -> `:slug(.*)*` (catch-all), `(group)/`
  folders dropped, `index.vue` is its folder. A page inside `parent/` next to `parent.vue` is labelled
  `nested in /parent`. Nuxt 2 (`nuxt` 2.x in package.json): `_id.vue` -> `:id`, `_.vue` -> `*`.
- `definePageMeta({ path: '/x' })` replaces the file path; each `alias` is a route of its own (`alias of /x`).
- nuxt.config: `hooks: { 'pages:extend'(pages) { ... } }` adds each literal `pages.push({ path, file })` and removes a
  page with `pages.splice(pages.findIndex((p) => p.path === '/x'), 1)` (or `p.name`). Nuxt 2 `router.extendRoutes`
  the same way.
- `app/router.options.ts` (or `router.options.ts`): the literal entries of `routes: (_routes) => [..._routes, {...}]`,
  with their aliases and children. Without `..._routes` the returned list replaces the file routes.
- @nuxtjs/i18n `pages: { about: { en: '/about-us', th: '/เกี่ยวกับ' } }` (top-level `i18n` or the module options) and
  `defineI18nRoute({ paths: {...} })` are alternates of the same route (`i18n en: /about-us`), not more routes.

Anything else (a path built from a variable, a helper that edits the page list, a route that is not an object
literal) is skipped and listed by `discover` under "Not read from the code" with its `file:line`. Add such routes
with `extraRoutes`:

```yaml
adapter:
  type: nuxt
  extraRoutes: [/generated/report]   # routes the scan cannot see; source "adapter.extraRoutes"
```

**Routes from the running app** (`discover --runtime`, off by default): opens the app in Playwright like `capture`
does (only `capture.allowlist` hosts, `capture.baseUrl` + the path, default `/`), optionally signed in with a login
from shots.yaml (`--login teacher`), and reads the full route table from Vue Router: `__vue_app__` on `#__nuxt`,
`#app` or `[data-v-app]` (Nuxt 3/4, any Vue 3 app), else `window.$nuxt.$router` or `__vue__` (Nuxt 2, Vue 2). It
waits up to `capture.settle.timeoutMs` for the app to mount, then fails with a clear message if no router is there.
Routes the code did not show are added to discovery with source `runtime` and the detail `found only at runtime`;
Nuxt's `:id()` matches `:id`, and @nuxtjs/i18n copies of a route (`about___th`) count as one route with alternates.
It needs a manual config, and it feeds `discovery.json` only; add a runtime-only route to `extraRoutes` to have it in
coverage.

```sh
manual-kit discover --runtime /dashboard --login admin
```

**Regex flags**: every regex spec (`routes`, `roles`, `flags`, `strings.<lang>`) takes `flags` with extra RegExp flags
(`g` is always on), e.g. `flags: m` so `^` and `$` match at each line, `s` so `.` matches newlines, `i` to ignore case.

## shots.yaml

```yaml
logins:                           # signed in once per language and capture run, reused by every shot that names it
  teacher:
    url: /login
    actions: [{ fill: "#email", value: "{env:MK_EMAIL}" }, { fill: "#password", value: "{env:MK_PASSWORD}" }, { click: "button[type=submit]" }, { wait: "#dashboard" }]
shots:
  dashboard:
    url: /teacher
    login: teacher                # starts with the login's cookies and localStorage
    storage:                      # set before the page loads; values take {lang} and {env:NAME}
      localStorage: { "app:theme": "light" }
      sessionStorage: { tab: "classes" }
      cookies: [{ name: consent, value: "yes" }]   # for the base URL's origin (path default /)
    maxHeight: 900                # keep the top 900 px (also: element: "#main", or crop: { x, y, width, height })
    caption: { th: "หน้าครู", en: "The teacher page" }
  sign-in:
    url: /teacher                 # joined to capture.baseUrl; {lang} is replaced
    caption: { th: "หน้า{{ui:portal.login.title}}", en: "The {{ui:portal.login.title}} page" }
    actions: [{ fill: "#email", value: "{env:MK_EMAIL}" }]   # passwords come from the environment, never the file
    highlight: "button[type=submit]"   # red frame drawn around it
    mask: ["#email"]                   # grey box over private data (also see capture.redact)
steps:
  create-class:
    url: /teacher
    setup: [{ click: "[data-act=new-class]" }]
    steps:
      - { text: { th: "ตั้งชื่อห้อง", en: "Name the class" }, highlight: "#cc-name" }
      - text: { th: "ระบุข้อมูลห้อง", en: "Enter the class details" }
        details:                         # short sub-bullets under the step text ({{ui:}} and {{data:}} work)
          - { th: "{{ui:\"ชื่อห้อง\"}} (จำเป็นต้องระบุ)", en: "{{ui:\"Class name\"}} (required)" }
          - { th: "คำอธิบาย (ถ้ามี)", en: "Description (optional)" }
        highlight: "#cc-form"
      - { text: { th: "ระบบแสดงห้องใหม่ในรายการ", en: "The new class shows in the list" }, highlight: false }
```

`{{steps:id}}` renders as the page's own numbered steps on every output: the step text, its `details` as
sub-bullets, then that step's screenshot under it (full width; on the web a click enlarges it, with previous / next).
In PDF and DOCX each step is a numbered item holding its figure, numbered and captioned like any screenshot
(`ภาพที่ n-m <step text>`). A steps list never runs on from a Markdown list next to it.

Each step is one action; `highlight` frames the control the reader acts on in red (`#d1242f`, with the step number
at its corner). `check` warns about a step without `highlight`; write `highlight: false` for a step that only shows
the system's response. `details` and `highlight: false` are not part of the spec hash: adding them recaptures
nothing. The step text is (a changed text marks the images stale, as before).

Before each step image capture waits for the page to settle (`capture.settle`). A message that closes itself after a
few seconds ("saved" dialogs, toasts) can be gone by then: `settle: false` on that step takes the image right after
its actions.

Actions run first, then the highlight is drawn and the image taken:

| action | does |
|---|---|
| `{ click: sel }` | click |
| `{ fill: sel, value: "text" }` | type into a field (`{env:NAME}`, `{lang}` allowed) |
| `{ select: sel, value: "b" }` / `{ select: sel, label: "Banana" }` | choose an `<option>` by value or visible label |
| `{ check: sel }` / `{ uncheck: sel }` | tick / untick a checkbox or radio |
| `{ hover: sel }` | move the mouse over it (menus, tooltips) |
| `{ press: "Enter" }` / `{ press: "Enter", on: sel }` | a key on the focused element or on `sel` |
| `{ upload: sel, files: docs/main.pdf }` / `files: [a.png, b.p12]` | choose files, relative to the manual folder: set on an `<input type=file>` directly (hidden ones too), or picked in the file chooser that clicking `sel` (a button or drop area) opens. Editing a file recaptures the specs that upload it. A missing file stops `capture` (and `--dry-run`) before any browser opens |
| `{ drag: sel, to: sel2 }` / `{ drag: sel, to: sel2, offset: { x: 30, y: 20 } }` | press on `sel`, move to `sel2` in steps and release (pointer-based editors and HTML5 drag and drop both see it). `offset`: the drop point in pixels from `sel2`'s top-left; default its centre. The drop point must be in the window once `sel` is scrolled into view |
| `{ wait: sel }` / `{ waitMs: 500 }` | wait for an element / a fixed time (rarely needed: see "Before each image") |
| `{ goto: /path }` | open another page (allowlisted hosts only) |
| `{ show: 2 }` / `{ show: 2, output: false }` | terminal specs: show the session up to command 2 (without its output) |

A selector may match a `display: contents` wrapper, the element many React apps put the test id on
(`<span data-testid="save" class="contents"><button>...`). Such a wrapper has no box of its own, so capture uses what
it renders: `highlight`, `element`, `capture.redact.images` and walkthrough targets frame the box around everything
visible inside it, and an action goes to the first visible element inside it that can take the action (a button,
link, label or other focusable element for `click`; an input, textarea, select or editable element for `fill`; a
`<select>` for `select`; a checkbox or radio for `check`). Write the wrapper's selector as it is; `sel > *` is not
needed. When several elements inside could take the action, the first in page order is used and `--verbose` prints
a `note` naming it. A wrapper that is hidden or shows nothing still fails as below.

`optional: true` on an action with a target (all but `waitMs`, `goto`, `show` and `press` without `on`) skips it
when no visible element matches within 3 s, instead of failing. For `upload`, point `optional` at a visible control (a hidden file input never
counts as appearing); for `drag`, only the source is waited for. Use it for a control that only some states of the app
show, such as a "Select" button on a context picker the server shows only when no context is chosen yet:

```yaml
logins:
  admin:
    url: /login
    actions:
      - { fill: "#email", value: "{env:MK_EMAIL}" }
      - { click: "button[type=submit]" }
      - { click: "#switch-context", optional: true }   # only when a context is already chosen
      - { click: "text=Admin box" }
```

A skipped action is not a failure: no failure screenshot, no error, and a clip gets no frame for it. `--verbose` lists
each one (`skipped th login admin: optional click "#switch-context" (not on the page)`). Each skip costs the 3 s wait,
so mark only the actions that really depend on state. Adding `optional` changes that spec's hash, so its images are
captured again; specs without it keep theirs.

Per shot (also steps and clips):

- `viewport: { width: 390, height: 844 }` sizes the browser for that spec (default `capture.viewport`, 1280x800),
  e.g. phone screenshots.
- `hide: [".chat-widget", "#cookie-banner"]` makes elements invisible (`visibility: hidden`) in the images; the
  layout does not move.
- Known development overlays are always hidden, from page load on (so they never catch a click): the Next.js dev
  indicator (`nextjs-portal`), Vite's `vite-error-overlay`, webpack's overlay, Nuxt / Vue devtools, Astro's toolbar,
  Svelte's inspector. `capture.hide` in the config replaces that list (`hide: []` shows them).
- `hide` and `capture.hide` take CSS selectors only (they become CSS). A value with `{`, `}`, `;` or a comment, or
  one that is not a valid selector (unbalanced brackets or quotes, an empty list entry, a dangling combinator), stops
  loading with the key that holds it, e.g. `shots.home.hide.1: "{" is not allowed in a CSS selector`.
### Clips: title cards and music

`encode` dresses every clip the same way by default:

- The poster (web player, PDF, DOCX) is a title card: the brand colour (`web.brand.colors.brand`, subtitle in
  `accent`; default the web theme's), the logos across the top (`document.logos`, else `web.brand.logo`), the book's
  `icon` in a white circle, the clip's caption large, the title of the book whose page shows the clip under it, and
  `document.title` at the bottom.
- A captured clip starts with that card and ends with a "เรียบร้อย" / "Done" card over the page title (2.5 s each). The
  captions file gets a cue for each card and its segment captions move 2.5 s later.
- An original instrumental music bed plays under every clip, also a ready-made video that has no sound. Never a voice.

Turn them off for every clip in the config, or per clip in shots.yaml:

```yaml
books: { user-guide: { title: { th: คู่มือผู้ใช้ }, icon: media-src/book.png } }
capture: { clips: { poster: card, cards: true } }   # poster: card | frame (a frame of the clip)
```

```yaml
clips:
  new-class:
    url: /classes
    caption: { th: สร้างห้องเรียน }
    poster: frame      # this clip's poster is the end of its first segment
    cards: false       # no intro and outro card
    segments: [...]
```

A changed card (caption, titles, colours, logos, icon) asks for a new `encode`, not a new capture.

### Redaction (private data in every image)

`capture.redact` in the config covers private data in every shot, step image and clip frame, found again in each
frame just before it is taken, in the same page state:

```yaml
capture:
  redact:
    style: blur                      # blur (default) | box (grey box, like mask)
    presets: [email, thai-name]      # email | thai-name | latin-name
    text: ["0\\d{2}-\\d{3}-\\d{4}"]  # your own patterns (JavaScript regex source)
    images: [".signature img", "[data-avatar]"]   # selectors: the whole element is covered
```

Text patterns are matched in each text node and in each input's value; a match covers just the matched text (an
input is covered whole). A name split across elements (`<b>Somchai</b> Jaidee`) is not found: add a selector to
`images` for it. Nothing is redacted unless configured. The presets:

| preset | matches |
|---|---|
| `email` | an email address anywhere in the text |
| `thai-name` | a text node that is a Thai first and last name, with an optional title (นาย, นาง, นางสาว, ดร., ผศ., รศ., ศ.); common UI words are excluded |
| `latin-name` | a text node that is two or three capitalised words ("Somchai Jaidee"); it also catches labels like "Sign In", so check the images |

The cover is a box drawn above the page (`backdrop-filter: blur(10px)`, or grey), removed after each image; the
app's own elements are not changed, so actions between steps and frames work as before. Unlike `mask`, a redact
pattern or selector that matches nothing on a screen is not a warning: it applies to every screen.

### Ready-made videos

A clip can also be a video made elsewhere (a demo, a screen recording): `video` instead of `url`, no segments.
`capture` reads its size and length (ffprobe). `encode` copies it (adding the music bed when it has no sound track),
makes the title card poster (`poster: frame` takes the frame at `posterAt` seconds instead), a still WebP of the
poster, and copies the captions; the web player, the transcript (from the captions file) and the poster in PDF/DOCX
work as for any clip. A new video file makes the clip stale.

```yaml
clips:
  demo:
    video: { file: media-src/demo.mp4, captions: media-src/demo.th.vtt, posterAt: 3 }
    caption: { th: วิดีโอแนะนำ }
```

### Walkthrough videos (from captured screenshots)

A walkthrough is a short video made from screenshots that are already captured: an intro title card, each screenshot
full-frame with a cursor that moves to the control and clicks, a highlight ring, an optional zoom, numbered caption
pills, a cross-fade between screens, an outro card that names the page with the full steps, and the generated music
bed (no voice). Editing a walkthrough never opens the app again; only the screenshots come from it.

```yaml
walkthroughs:
  sign-in-video:
    page: teacher.sign-in            # the page with the full steps (outro text, video gallery link)
    title: { th: เข้าสู่ระบบ }        # optional; default the page title
    scenes:
      - shot: login                  # a shot of a whole app screen (url; no element, crop or maxHeight)
        steps:
          - { target: "#email", caption: { th: กรอกอีเมล }, action: point }   # point: no click
          - { target: "#submit", caption: { th: "กด {{ui:login.submit}}" }, zoom: true }   # zoom: true = 1.6x, or 1-4
```

```bash
manual-kit walkthrough measure --list login   # visible controls of a shot: box, selector to use as target, text
manual-kit walkthrough measure [--only id]    # open each screen as capture does; target boxes -> media/walkthroughs.json
manual-kit walkthrough build [--only id] [--changed] [--no-render]
```

- `measure` replays the shot's login, URL and actions and records each target's box (sorted keys, same bytes when
  nothing moved; a `display: contents` target gets the box around what it renders) with a hash of the screenshot it was measured against. A target not on the screen exits 1.
- `build` writes a HyperFrames composition per walkthrough and language to `dist/.build/walkthroughs/<lang>-<id>/`
  (1920 wide, the screenshots' aspect: 1440x900 and 1280x800 become 1920x1200), renders it with the pinned
  `npx --yes hyperframes@0.8.140 render` (needs ffmpeg; the first run downloads it), and writes the clip
  files `media/<lang>/<id>.mp4`, `.vtt` (title, numbered steps, outro), `.poster.png` and `.webp` (the intro card at
  2.0 s). `--no-render` only writes the compositions (open `index.html` in a browser or `npx hyperframes preview` it).
- Cards use `web.brand.colors` (`brand` background, `accent` subtitle, ring and numbers; the theme colours otherwise),
  the book's icon and `document.logos` (else `web.brand.logo`) when the config has them.
- Show it with `{{clip:<id>}}`: the web player, transcript, PDF/DOCX poster and QR code work as for any clip, and the
  video gallery links to the page. Walkthroughs need media level `steps+video`; a walkthrough id cannot also be a clip.
- `check`: the page exists and shows `{{clip:<id>}}` (warning), every target is measured and was found, the shots are
  captured and current, and the video was built from the current screenshots, boxes and spec (else "run manual-kit
  walkthrough build"). A recaptured screenshot also warns to measure again. `manual-kit doctor` (plugin) says whether
  HyperFrames is downloaded.
- The composition is deterministic (same inputs, same HTML and assets); the rendered MP4 bytes may differ between
  machines, so freshness is judged from the inputs.

### Terminal sessions (command-line tools)

A tool without a web UI is documented from its terminal. Instead of `url`, a shot, steps or clip names a transcript
file (`terminal:`); capture renders it as a terminal window and photographs it with the same highlight, mask, step
numbers, captions and clip encoding as an app page. Use real commands and their real output (record with
`script -q out.txt cmd...`, or paste); mark a scripted session with a `badge` such as `ตัวอย่าง`.

```text
# manual/terminal/install.txt — a line starting with the prompt ("$ ") is a command, the lines after it its output
$ claude plugin marketplace add git@git.example.com:team/tool.git
✔ Successfully added marketplace: team
$ claude plugin install tool@team
✔ Successfully installed plugin: tool@team
```

```yaml
shots:
  install:
    terminal: { file: terminal/install.txt, title: "zsh — my-project", badge: { th: ตัวอย่าง, en: Example }, prompt: "$ " }
    caption: { th: ติดตั้ง plugin, en: Install the plugin }
    highlight: '[data-line="4"]'        # transcript line 4; also [data-cmd="2"] (command 2), text=Successfully
steps:
  install-steps:
    terminal: { file: terminal/install.txt }
    steps:
      - { text: พิมพ์คำสั่งแรก, actions: [{ show: 1, output: false }], highlight: '[data-cmd="1"]' }
      - { text: ผลลัพธ์, actions: [{ show: 1 }] }
```

- ANSI colours (SGR: 16 / 256 / true colour, bold, dim, italic, underline) are kept; cursor movement and other escape
  sequences are dropped. Text is escaped once.
- `{ show: n }` shows the session up to command n (0 = the lines before the first command), `output: false` hides
  command n's output (it was just typed). Only in terminal specs. Without `show` the whole session is visible.
- A shot or step image is the window (960 px wide, as tall as the session; `viewport` changes the width). A clip's
  window fills its viewport (default 960x600) and keeps the newest lines in view.
- Editing the transcript makes its images stale (`check`, `capture --changed`); a missing file is a `check` error.

### Before each image

Capture waits until the page has settled before every shot, step image and clip frame, so a loading spinner never
ends up in a picture:

- no request open for 500 ms (`networkIdle`; event streams, websockets and media streams do not count),
- web fonts loaded (`document.fonts`),
- no visible loading indicator: an element matching one of `capture.settle.spinners`. The default list is
  `[aria-busy="true"]`, an indeterminate `[role="progressbar"]` (no `aria-valuenow`), `progress` without a value,
  `.spinner`, `.loading`, `.ant-spin-spinning`, `.MuiCircularProgress-root` and `.animate-spin`. Setting the list
  replaces it, so add your app's own loader to the defaults you keep.

```yaml
capture:
  settle: { networkIdle: true, spinners: ['[aria-busy="true"]', ".my-loader"], timeoutMs: 10000 }
```

After `timeoutMs` (default 10 s) the image is taken anyway and capture prints a warning that names the shot and what
was still pending, e.g. `warning th shot dashboard: page did not settle within 10s, image taken anyway: 2 requests to
api.example.com still open; spinner .animate-spin still visible`. A page that polls forever reaches the timeout on every
image: set `networkIdle: false` for it. `timeoutMs: 0` turns settling off. A `{ waitMs: n }` action still waits on top
of this, for an animation that no spinner or request marks.

### Signing in by hand (SSO, 2FA)

A login whose sign-in a script cannot do (single sign-on with a second factor, a national-ID app, a captcha) is done
once by a person. Give the login `storageState: true` instead of `actions`:

```yaml
logins:
  main:
    url: /dashboard                 # start page, joined to capture.baseUrl; the app sends the person to its sign-in
    storageState: true
    until: { selector: "#user-menu" }   # signed in when this appears (or: { url: /dashboard } = the address starts with it)
    check: { url: /dashboard }          # optional; capture's test that the saved session still works (default: until)
```

```bash
manual-kit login main
```

opens a browser window on the start page. The person signs in there; the window may visit any host (SSO pages are not
on `capture.allowlist`, and they do not need to be). manual-kit saves the session when `until` shows on the page, or
when the person presses Enter in the terminal (without `until`, Enter is the only way). The session, a Playwright
storageState of cookies and local storage, goes to `manual/.auth/main.json`, and `capture` then starts every shot that
names the login from it, with no actions and no password.

**The file is a secret**, as good as the person's password until the session ends: `manual/.auth/` ignores itself in
git, the file is readable by its owner only, and manual-kit never prints it or copies it into an output. Do not share,
commit or attach it. Sign in with a test account, never a real person's.

Capture opens the start page with the saved session once per run. It stops, naming the command to run, when:

```
manual-kit: login "main": no saved session (manual/.auth/main.json does not exist); sign in by hand with: manual-kit login main
manual-kit: login "main": the saved session has expired (the start page went to sso.example.com, outside capture.allowlist); sign in again with: manual-kit login main
manual-kit: login "main": the saved session has expired (#user-menu did not appear on http://localhost:5173/dashboard); sign in again with: manual-kit login main
```

Without `check` or `until` capture cannot tell an expired session; the shots then fail on their own selectors. In an AI
agent's session, the person runs the command themselves (in Claude Code: `! manual-kit login main`); set `until`
there, since such a shell may not pass Enter through.

### When a shot fails

A shot, step set or clip that fails is listed (`failed th shot dashboard: ...`) and the run goes on with the rest; a
failed login stops the run. The message says why, and three things help to fix it without guessing:

- **The page at that moment**: a screenshot in `manual/.manual-kit/failures/<lang>-<kind>-<id>.png` (a login:
  `login-<name>-<lang>.png`), with the page address (without its query string) and the message in a `.txt` next to it.
  The folder is emptied at the start of each run and ignores itself in git.
- **What the selector matched instead.** Nothing: up to five elements whose text or test id (`data-testid`, `id`,
  `aria-label`, `name`, `placeholder`) contains the words of the selector, each with a selector to use. Several: their
  number and first texts, and how to pick one (`>> nth=0`, `>> visible=true` when some are hidden, or
  `:text-is("...")`). One without a box (hidden, zero-size, or a `display: contents` wrapper with nothing visible
  inside): a hint to point at a visible element instead.
- **Hosts the allowlist blocked** while that page was open: `blocked by capture allowlist: sso-api.example.com (add it
  to capture.allowlist ...)`. A sign-in that calls an SSO host fails this way until the host is on the list.

```
failed th shot settings: highlight "#save-btn": no element matches; similar elements on the page:
    button "บันทึก" -> [data-testid="save-button"]
    button "บันทึกร่าง" -> button:text-is("บันทึกร่าง")
  page at failure: manual/.manual-kit/failures/th-shot-settings.png (http://localhost:3000/settings)
```

Capture refuses any host outside `capture.allowlist` (default `localhost`, `127.0.0.1`) and blocks every request to other
hosts. Redirects are checked hop by hop: manual-kit follows each redirect itself and asks for the next address only
when its host is allowed (cookies set on the way are kept, so a sign-in that redirects between allowed hosts works). A
redirect to another host is refused before anything is sent there, and the image fails with
`blocked by capture allowlist: sso.example.com (redirect from app.example.com/login)`. A page that ends up on another
host by any other route (a script setting `location`) is never photographed. Service workers are turned off during
capture, since they could answer requests without these checks. `capture.seed` runs a project command first (create test accounts); `capture.localStorage` is set before each page
loads. Never point capture at a system with real data.

`login`, `storage`, `element`, `crop` and `maxHeight` work on shots and steps (clips take `login` and `storage`).
`element` photographs one element; `crop` a fixed page region; `maxHeight` cuts any of them (or the viewport) to its top
part. A login is part of the spec hash, so changing it recaptures its shots with `capture --changed`; its URL must be in
the allowlist like any other. Signing in again with `manual-kit login` changes no hash.

## Output

`manual-kit build` with no format builds every output switched on in the config (`outputs: { pdf: true, docx: false,
web: false }` by default), PDF and DOCX before the web site so the site links the files of the same run.

- **Web** (`build web`, or `outputs.web: true`): a static site in `dist/web/<book>/<lang>/` (relative URLs: works from
  any sub-path or straight from disk; nothing loaded from other hosts). Navigation per book, language switch, light /
  dark, downloads of the PDF/DOCX, step galleries and clip players, and search. `--base <url>` (or `web.baseUrl`) sets
  canonical links and the QR code under clips in PDF/DOCX (with `document.clips: poster`). `manual-kit preview` serves `dist/` on 127.0.0.1 (byte
  ranges for video) and opens the site; `--no-open`, `--port`.
- **Theme** (default, modelled on a handbook site): a top bar in the brand colour with logo + name, a pill for the
  current book with a switcher to the other books, a large search box (⌘K / Ctrl+K or `/`) with live results under it,
  the language switch and an optional "back to the app" link. The left sidebar says which book you are reading, links
  the other books, shows the reader's role when the pages name two or more (see below), and lists the pages
  in collapsible groups with icons and counts (front matter `group`, else by page kind). A page shows breadcrumbs, the
  title, `summary`, chips for kind and audience, a print button (print CSS), an `info:` key-value card, the body
  (numbered steps with their screenshots, callouts, clip players) and "On this page" with scroll-spy on the right. At phone
  width the sidebar is a drawer behind the menu button and the search box opens from an icon.

  ```yaml
  web:
    brand: { name: { th: ชื่อระบบ, en: Product }, logo: logo.png, colors: { brand: "#0d2470", accent: "#f79722", link: "#1f5fd6" },
             font: { family: "Noto Sans Thai", files: { regular: fonts/NotoSansThai-Regular.ttf, bold: fonts/NotoSansThai-Bold.ttf } } }
    backLink: { label: { th: กลับหน้าระบบ, en: Back to the app }, url: "https://app.example.com/" }
    audiences:                                         # front matter audience values: a label, or label + description
      teacher: { th: ครู, en: Teacher }
      clerk: { label: { th: เจ้าหน้าที่สารบรรณ, en: Clerk }, description: { th: รับและส่งต่อหนังสือ, en: Receives and forwards letters } }
    groups: { classes: { title: { th: ห้องเรียน, en: Classes }, icon: user } }   # front matter group: classes
  ```

  Page front matter for the web: `summary: ...`, `info: { ใช้เวลา: 5 นาที }`, `group: classes`. Callouts in any
  page: `> [!TIP]`, `> [!NOTE]`, `> [!WARNING]` (a box on the web and in the PDF, a bold-titled quote in DOCX).
  Icons for groups: book, bulb, list, table, folder, gear, user, shield, chart, file, help, home.
  A `group` not in `web.groups` is titled from its id (`getting-started` shows as "Getting started", folder icon), and
  `check` warns once per such group with the key to add.
- **Menu order.** Pages come in file order (`NN-slug.md`), and the sidebar groups them by front matter `group` in the
  order the groups first appear. To follow the app's own menu, list a book's groups in `books.<id>.groups`: the
  sidebar, previous / next and the PDF/DOCX chapters (and their table of contents) follow that order, each group's
  pages in file order; groups not listed come after. Its titles (and optional icons) take precedence over `web.groups`.

  ```yaml
  books:
    user-guide:
      title: { th: คู่มือผู้ใช้, en: User guide }
      groups:                                    # the app's menu, top to bottom
        - { id: inbox, title: { th: หนังสือเข้า, en: Incoming } }
        - { id: outbox, title: { th: หนังสือออก, en: Outgoing } }
        - { id: settings, title: { th: ตั้งค่า, en: Settings }, icon: gear }
  ```

- **One site, role books.** A manual can be one help site of one-task pages in the app's menu order, with a PDF and
  DOCX per role made from the same pages. Write every page in one book and name its roles in front matter
  `audience: [clerk]` (no `audience` = for everyone). Each role book has no pages folder: `books.<id>.from` names the
  source book and the roles it is for.

  ```yaml
  books:
    office: { title: คู่มือระบบงานสารบรรณ, groups: [...] }               # every page, the web site
    clerk-guide: { title: คู่มือเจ้าหน้าที่สารบรรณ, icon: clerk.png, from: { book: office, audience: [clerk] } }
    signer-guide: { title: คู่มือผู้ลงนาม, from: { book: office, audience: [signer, director] } }
  web:
    audiences:
      clerk: { label: เจ้าหน้าที่สารบรรณ, description: รับหนังสือเข้า ลงทะเบียน และส่งต่อ }
      signer: ผู้ลงนาม                                                    # a label alone still works
  ```

  - A role book's chapters are the source book's pages, in the source's menu order, that name one of its roles, plus
    the pages for everyone. It builds PDF and DOCX with its own title, cover and icon (`build pdf --book clerk-guide`).
    A `[[link]]` to a page it leaves out reads "ดู <source book>: <page>". It has no web site: `build web --book
    clerk-guide` fails with the reason, and a plain `build --book clerk-guide` skips the web.
  - When the pages of a site name two or more roles, its home page and the front page show an **"ฉันเป็น…" / "I am
    a…" picker**: a card per role (label, description, the number of pages it sees, its role books' PDF/DOCX) and a
    "ดูทุกงาน" / "See all tasks" card. Roles listed in `web.audiences` come first, in that order. Picking a card keeps
    the role for the book in the browser (localStorage; the site works without it) and filters the sidebar, the home
    lists and previous / next on every page to that role's pages and the pages for everyone. The sidebar shows the
    current role as the pressed chip; another chip changes it, "ดูทุกงาน" clears it; the downloads add the picked
    role's book. `?role=<id>` in a page address picks the role too (a link from the app for the signed-in user's
    role). Search covers every page and each result shows its roles. A page shows its roles as chips under the title.
  - `check`: a page in a role book's folder is an error (move it to the source book); a role in `from.audience` that
    no source page names is a warning; a role book that selects no pages is reported like an empty book. `new-page
    --book <role book>` is refused. `publish outline` publishes the source book only. `sign`, `capture --changed`,
    `encode` and walkthroughs work on pages, so a role book changes nothing for them.

- **"ทำได้ N วิธี" cards.** On a how-to page, a `## วิธี…` (`## How to …`) section with two or more `###`
  sub-headings gets a row of cards at its top on the web: "ทำได้ 2 วิธี" / "2 ways to do this", then a card per
  sub-heading ("วิธีที่ 1" / "Method 1" over its text, without a "วิธีที่ 1:" the writer put in front) linking to it.
  PDF and DOCX show the sub-headings alone.
- **Search** runs in the browser on an index built with the site. Thai is split into words with `Intl.Segmenter`, so a
  Thai word inside a longer run is found; a word you are still typing matches by prefix. Results appear **as you type**
  (after a pause of about 150 ms; Enter shows them at once) and the address keeps `?q=` so a search can be shared.
  Every word must appear in a section; title matches rank first. `/` jumps to the search box.
- **Front page** (`dist/web/index.html`, in the primary language): the top bar (logo, name, a search across every
  book, the FAQ link, the back link); a centred hero with `web.home.title` (default `document.title`; a line break in
  the text breaks the line), `document.client`, `document.project` · `document.developer` (the company name alone), a
  short lede, a large search box with "try" hints that fill it, and `document.coverImage` as the illustration; a card
  per book in the order of `books` (icon, "For <audience>", title, description, a chip per page group linking to its
  first page, "Open this manual", the first four how-to pages as "frequently opened", page and group counts); the FAQ
  banner; a numbered journey strip; the video gallery (book audience and a link to the page under each clip); a footer
  with the document, client · developer, number · version · date, the PDF of each book and `document.contact`. Every
  part without data is left out, so a minimal config still gives a clean page. Results of the front page search open
  `dist/web/search.html`, which searches every book of the primary language. `web.brand.logoPlate: true` puts a logo
  drawn for light backgrounds on a white plate in the top bar.

  ```yaml
  books:
    user-guide:
      title: { th: คู่มือผู้ใช้งานทั่วไป }
      audience: { th: บุคลากรทุกคน }                     # card eyebrow: "สำหรับบุคลากรทุกคน"
      description: { th: เข้าสู่ระบบ อ่านหนังสือ ส่งต่อ และตั้งค่าลายเซ็น }
  web:
    home:
      title: "ศูนย์ช่วยเหลือ\nระบบสารบรรณอิเล็กทรอนิกส์"  # default: document.title
      lede: คู่มือแยกตามหน้าที่ อธิบายทีละขั้นพร้อมภาพหน้าจอ   # default: a sentence counting the books (2+ books)
      hints: [ลงรับ, ส่งต่อ, ลายเซ็น]                    # "try" chips; the first three also go in the placeholder
      journeyTitle: เส้นทางของหนังสือหนึ่งฉบับ              # default: a generic heading
      journey:                                         # page ids; an unknown id stops the build
        - { page: saraban.receive, label: รับหนังสือเข้า, who: เจ้าหน้าที่สารบรรณ }   # label: page title, who: book audience
        - { page: signer.sign }
  ```

- **PDF cover** (`templates.cover`, default `formal`): a full A4 page. A band in the brand colour across the top holds
  the seal (`document.logos[0]`), the client name in white, the system name (`document.project`) and the system logo
  (`document.logos[1]`) on a white rounded plate. Below it: the title in the brand colour, the subtitle, the book name on
  an accent-coloured pill (with `books.<id>.icon`), the illustration (`document.coverImage`, takes the height the text
  leaves), the document fields as a three-column grid in a light box, and a footer band with an accent rule holding the
  client and `document.developer` (default: `preparedBy`). Colours: `web.brand.colors.brand` / `accent`, else the web
  theme's defaults. Every part is optional except the title. A configured image that does not exist fails the build
  with the key's name. `templates.cover: neutral` is the plain text cover.
  The cover section and `<body>` carry `data-book="<book id>"`, so `templates.pdfCss` can vary a cover per book
  (`section.cover[data-book="admin-guide"] .cover-book { ... }`). Project CSS loads after the built-in pdf.css; to
  override a built-in cover rule, match its specificity (`section.cover--formal .cover-band`). Local files named in
  `url()` become data URIs at build time (Paged.js would not load them by path); a path is looked up next to the CSS
  file first, then in the manual folder.
  DOCX gets a simplified cover: logos (PNG/JPEG/GIF only; WebP and SVG are left off), client, title, subtitle, book,
  illustration, document fields and developer, without the bands and colours.
- **PDF**: print HTML + Paged.js in Chromium: A4, cover, document information, revision history (config, optionally git
  tags), approval page, contents / figures / tables with page numbers, introduction and glossary, chapters numbered 1, 1.1,
  figures "ภาพที่ n-m", header (title / book) and footer ("หน้า X จาก Y"), images never split across pages.
  A figure that does not fit in the space left on a page shrinks to fit when at least half of its height would remain
  (no near-empty page before a tall screenshot); with less room it moves to the next page at full size. Figures are at
  most 150 mm tall (step images 110 mm).
- **DOCX**: pandoc with a neutral reference generated from pandoc's default at build time (A4, header/footer with page
  fields, numbered headings, bordered tables), then a post-processor that makes the file correct in Microsoft Word:
  - **Image sizes** from the image itself (96 dpi): never wider than the text (17.2 cm), never taller than the PDF's
    figure height (15 cm, step images 11 cm), proportions kept. Word does the page layout, so a figure that does not
    fit the rest of a page moves to the next one; only the PDF shrinks figures to the space left.
  - **Thai rules** (ported from the thai-docx skill): every run, style and docDefaults get `w:rFonts` ascii/hAnsi
    (Latin font) + eastAsia/**cs** (Thai font), `w:szCs = w:sz`, `w:bCs`/`w:iCs` with `w:b`/`w:i`, `w:lang w:bidi="th-TH"`;
    theme fonts (latin, cs, Thai script) and `themeFontLang w:bidi="th-TH"`; headers, footers, tables, captions, TOC.
  - **Fonts embedded** (`fonts.embedFonts`, default true): each face of the Thai and Latin font as obfuscated `.odttf`
    (ECMA-376), so readers without the font still see it. Default font: bundled Sarabun (OFL allows embedding).
    `fonts.docx: { thai: { family, files }, latin: { family, files }, size, latinSize, fallback }`; "TH ..." fonts
    default to 16pt, others to 11pt (the PDF size). With `embedFonts: false` the build warns and suggests Tahoma.
  - `docx.thaiJustify: true`: body text uses `thaiDistribute` and gets U+200B at Thai word boundaries
    (`Intl.Segmenter('th')`), so Word never stretches a line letter by letter. Default: left aligned.
  - **Contents and figure/table lists are visible on open**: the fields are pre-filled with every heading / caption
    (linked to the heading bookmarks) **without page numbers** — page numbers only exist after Word lays the file out, and
    guessed numbers would be wrong. `settings.xml` keeps `updateFields` as a fallback (Word asks to update on open).
  - `build docx --finalize auto|word|libreoffice|none` (config `docx.finalize`, default auto = LibreOffice if
    `soffice` is found, else none). Microsoft Word is used **only** with an explicit `--finalize word` (automating Word
    has hung on a dialog before). Every build prints the chosen path first, e.g.
    `finalize: libreoffice (config docx.finalize: auto; soffice /usr/bin/soffice)`. `word`: manual-kit opens the file in Microsoft Word (AppleScript, through Word's own
    container folder so no sandbox prompt), updates every list, saves; Word's PDF goes to
    `dist/.build/<book>.<lang>.word.pdf`. `libreoffice`: a private headless `soffice` (own profile folder, so an open
    LibreOffice is untouched) lays the file out through UNO with LibreOffice's Python, updates every index and field
    twice, saves DOCX and a review PDF `dist/.build/<book>.<lang>.libreoffice.pdf`. soffice is found on PATH, in
    `/Applications/LibreOffice.app` or via `MANUAL_KIT_SOFFICE` (Python: next to soffice, `MANUAL_KIT_SOFFICE_PYTHON`, or
    a `python3` with `uno`; Debian/Ubuntu: `apt install libreoffice-writer python3-uno`). After either, the Thai rules
    and font embedding are applied again (word processors drop fonts they do not have), schema order and content types
    are repaired, and `updateFields` is removed. `none` keeps the pre-filled lists + updateFields and warns.
  - Every DOCX build runs the `check --docx` rules on its output (a problem is a `warning:` line; with `--verbose` a
    pass prints `checked: ...`), then one `not verified: ...` line per thing it could not check: without a word processor, page numbers in the lists and
    Word's page breaks / figure placement / Thai line breaks; after LibreOffice, that Word lays it out the same way.
  - A project `templates.docx` is used as-is for styles; fonts are applied only when `fonts.docx` is set.
- **Outline wiki** (`manual-kit publish outline`): the pages as documents in an [Outline](https://www.getoutline.com)
  collection. One document per book (document information, PDF/DOCX downloads, contents) with one child document per
  page ("1. title", in page order); images, step images, clip posters, clip MP4s and the built PDF/DOCX are uploaded as
  attachments; `[[page-id]]` links point at the published documents; callouts become Outline notices. The mapping
  (document ids, attachments by file hash) is kept in `manual/outline.json` (commit it): publishing again updates only
  documents whose text changed, uploads only new files, and makes a document again if someone deleted it.
  The API key is read **only** from `OUTLINE_API_KEY` (Outline: Settings → API & Apps); it is never written or printed.
  Build the PDF/DOCX first if the book document should link them.

  ```bash
  manual-kit publish outline --collection <id or urlId> --dry-run      # the plan; sends nothing, needs no key
  OUTLINE_API_KEY=... manual-kit publish outline --collection <id or urlId> [--parent <docId>] [--book user-guide] [--lang th]
  ```

  Config: `outline: { baseUrl: "https://wiki.example.com", collection: <id or urlId>, parent: <docId> }`
  (`baseUrl` is required: there is no default wiki). A book document is titled "<document.title>: <book title>"
  unless the book sets its own: `books: { user-guide: { title: ..., outline: { title: "คู่มือการใช้งาน (user-guide)" } } }`,
  so a title chosen on the wiki survives the next publish. `outline.json` belongs to one wiki and collection; publishing to
  another refuses until the file is moved away.
- `manual-kit check --docx <file> [--font] [--latin-font]` verifies a DOCX: every Thai run has cs/szCs/bCs/iCs/bidi,
  themeFontLang, spacing copied from PDFs, invisible characters, package integrity (well-formed parts, relationship
  targets and r:ids, content types) and schema order of rPr/pPr/sectPr/settings/styles (Word "repairs" files otherwise).
- Fonts: Sarabun (SIL OFL 1.1, `assets/fonts/OFL.txt`) is bundled for the PDF and embedded in the DOCX.

## Development

```bash
pnpm install && pnpm exec playwright install chromium
pnpm verify      # typecheck + tests + build
```

Tests run the real CLI against fixture projects (`tests/fixtures/`), a local static site for capture, poppler's
`pdftotext` for PDF text and an unzip of the DOCX.
