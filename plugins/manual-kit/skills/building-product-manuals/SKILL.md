---
name: building-product-manuals
description: Method and rules for formal product manuals with manual-kit (คู่มือการใช้งาน, คู่มือผู้ดูแลระบบ, เอกสารส่งมอบ) as PDF, Word/DOCX or a docs website - discovery, the manual spec, page structure, Thai-first writing rules, capture with test data, checks and output verification. Use when writing, reviewing or fixing manual pages, when manuals drift from the app, or when /manual-kit:manual sends you here.
allowed-tools: Bash(manual-kit:*)
---

# Building product manuals (method)

A manual is a product that must stay true to the running system. Readers' jobs decide the structure; the code and the
running app decide the facts; `manual-kit` does every mechanical step (discovery, inventory, checks, captures,
PDF/DOCX/web) and never calls an AI. You spend judgment on the spec, structure and prose. `/manual-kit:manual` runs this
method end to end; this file is the single source of the rules.

- CLI: `manual-kit --help` (on PATH while the plugin is enabled; `manual-kit doctor` shows where things are).
- Full reference (config keys, page tokens, shots.yaml, adapters, outputs): `${CLAUDE_PLUGIN_ROOT}/skills/building-product-manuals/reference.md`
- Spec template: `${CLAUDE_PLUGIN_ROOT}/skills/building-product-manuals/spec-template.md`

## 1. Discover, then write the spec

1. `manual-kit discover` writes `manual/discovery.json` + `manual/discovery.md`: requirement / design / decision
   documents (titles and headings), routes, in-page sections, roles, permissions, workflow states (enums, unions, Prisma
   enums, SQL CHECK lists), form fields, validation and error messages, API routes, feature flags, integrations,
   environment *names*, scripts, compose files and seed data. Every item has its source path; output is sorted and has
   no timestamp, so `git diff manual/discovery.json` shows what changed in the product.
   Scope discover to the app being documented: when it reports several package roots, set `discover.include` or `discover.exclude` in `manual.config.yaml` and run it again.
   no timestamp, so `git diff manual/discovery.json` shows what changed in the product. "Not read from the code"
   lists route config the scan had to skip (`file:line`); for Nuxt or Vue apps, once the app runs and the config
   exists, `manual-kit discover --runtime [path] [--login <name>]` adds the routes only the live router knows
   (source `runtime`).
2. Read `discovery.md`, then the documents it lists (requirement and design first, decisions for the why), the README
   and agent notes, and the code behind each screen you will document. Discovery is a lead list, not the truth:
   confirm each item in the code or the running app.
3. Write `manual/manual-spec.md` from the template: purpose and audience, system overview, roles, feature inventory,
   end-to-end workflows with states, business rules, messages, integrations and limits, data handled, then the manual
   plan (books, pages, media, coverage), questions, product issues, out of scope. **Every claim cites its evidence
   path; unknowns are questions, never invented.** `manual-kit check` warns when the code has a route, role,
   permission or flag the spec never mentions.

## 2. Set up the manual

- `manual-kit init --no-samples --languages th[,en] --books <from the spec> --adapter <discovery's adapter or none> --title "<title>"`
  (never overwrites) prints a checklist of the project inputs still missing. Ask for all of them in one round, then
  `manual-kit init --answers <file>` fills `manual/manual.config.yaml` and the `main` login in `shots.yaml`. Other
  `document` fields (docNumber, version, approvers, purpose, scope, audience, contact) are edited by hand; unknown
  values are `(รอระบุ)`, never invented; `developer` is the company name alone, never "พัฒนาโดย ...". Credentials are
  environment variable names (`{env:NAME}`), never values. `capture.seed` if a command creates the test data.
- Cover, video title cards, the web front page and the FAQ come from config (`document.logos`, `coverImage`,
  `books.<id>.icon/audience/description`, `web.brand`, `web.home`) and the pages' problems sections. Change
  those, never add CSS or scripts to redesign them.
- `manual-kit inventory` writes `coverage.yaml` from the code. Map every item from the page that documents it (front matter `routes: [/orders]`,
  `covers: [role:staff, "permission:orders.*"]`) or set
  `status: manual-later` / `ignored` with a `note`. Coverage comes from the system, never from memory.

## 3. Plan books and pages by reader questions

A reader opens the manual in the middle of a task, with the app open next to it: they read one line, act, and come
back. Keep three kinds of content apart, and never put explanation inside the steps:

- **how-to** (task): one task per page, titled by the task ("รับหนังสือเข้าระบบ"). Steps are one action each.
- **concept** (understanding): what something is, why it works that way, which permission it needs.
- **reference**: screens, fields, statuses, messages.

Books: "how to use the system" apart from "how to do my work with it"; a getting-started path first; admin and
operations in their own book when their readers differ. Inside a book, order pages (file names `NN-slug.md`) and their groups (`books.<id>.groups`) the way the
app's own menu runs and the reader works through it, not by the writer's grouping. When several roles share the same
tasks, write each task once in one book, name its roles in front matter `audience`, and add a role book per role with
`books.<id>.from: { book, audience }` for the PDF/DOCX; the site gets an "I am a…" picker (reference: "One site, role
books").

A how-to page has these `##` parts, in order (English twins in brackets; `check` warns about a missing, misplaced or
old heading):

1. `<งาน>คืออะไร` (What is <task>): when to use it, what the system does, and the permission it needs, named exactly
   as the role screen shows it. All the explanation lives here or in ข้อควรทราบ.
2. `วิธี<งาน>` (How to <task>): `{{steps:id}}`, so every step has its own screenshot with a highlight on the control.
   A task that can be done several ways starts with "ทำได้ 2 วิธี" and has `### วิธีที่ 1 …`, `### วิธีที่ 2 …`
   sub-sections, each with its own steps.
3. `ข้อควรทราบ` (Good to know), optional: short bullets (conditions, limits, what happens afterwards).
4. `ปัญหาที่อาจพบและวิธีแก้ไข` (Problems and fixes): each problem is titled by the system's message, verbatim and in
   quotes, taken from discovery's messages (or the screen). The FAQ page collects these items:
   ```markdown
   - ปัญหา: “กรุณาเพิ่มหนังสือหลัก”
     วิธีแก้ไข: แนบไฟล์หนังสือหลัก แล้วคลิกปุ่ม “บันทึก” อีกครั้ง
   ```
5. `คำถามที่เกี่ยวข้อง` (Related questions), optional: `[[page-id]]` links to related pages and questions.

The video (`{{clip:id}}`) goes after the intro; it shows on the web only, and the PDF and DOCX leave it out.

`manual-kit new-page <id> --kind how-to --book user-guide --title "..."` starts a page in every language with these
parts and a writing hint in each. Front matter `sources:` lists the code files the page's facts come from (their
hashes are signed with the page).

## 4. Writing rules

- Thai first for a Thai client; English twins have the same structure and tokens (`check` compares them).
- A step is one short action line with a fixed verb: เข้าเมนู “X”, คลิกปุ่ม “Y”, เลือก …, ระบุ … (Go to, Click,
  Select, Enter). What the system does is a step too: "ระบบแสดงหน้าต่าง “ยืนยันการรับหนังสือ” คลิกปุ่ม “ยืนยันการรับ”".
  The fields of a form are short sub-bullets marked (จำเป็นต้องระบุ) or (ถ้ามี). `check` warns about a step over
  `wording.stepLength` (120 characters in Thai, 160 in English): move the why and the what-next into the intro or
  ข้อควรทราบ.
- The intro and ข้อควรทราบ are prose for non-experts: full sentences, what the reader sees and why it matters.
- Plain language only: no route paths (`/documents/:id`), environment or variable names, `snake_case`/`camelCase`
  names, keys like `portal:admin`, or status codes as stored (`WAIT`); write what the screen shows instead (the page
  name, the button label, the status as displayed). A term the reader cannot avoid is explained once, in Thai, where it
  first appears. Do not write "พัฒนาโดย"/"พัฒนาระบบโดย": show the company name alone. `check` warns about these
  (`wording.plainLanguage`); fix the text, and put a word readers truly know (an acronym on screen) in `wording.allow`.
- On-screen labels only through tokens: `{{ui:key}}` or `{{ui:"ข้อความบนปุ่ม"}}` (exact visible text; `check` fails
  when it disappears from the code). Values from code: `{{data:ns.key}}`. Images: `{{shot:id}}`, `{{steps:id}}`,
  `{{clip:id}}`. Links: `[[page-id]]`.
- Never point at the video in prose ("ดูวิดีโอด้านล่าง", "watch the video"): the PDF has no video, so the line would
  point at nothing. `check` warns about it.
- No invented features, numbers, contacts, prices or claims; no superlatives (ดีที่สุด, ครบที่สุด, อันดับ 1, best,
  most complete...). Facts come from code, documents or the running app; everything else is `(รอระบุ)` and goes on
  the to-confirm list.
- Project wording rules go in `wording.forbidden` so `check` enforces them; an owner's correction becomes a rule.
- Do not document a bug as a feature. Product issues you notice (test-login shortcuts, wrong headings, real-looking
  personal data in seeds, broken flows) go to the spec's issue list and the report.

## 5. Capture from the running app, with invented data only

- Local or a test environment the user named; **never production, never real customer data**. Allowed: the project's
  own seed scripts when their data is clearly fake, data you create through the UI/API with invented values
  (names like "สมชาย ทดสอบ", e-mail at `example.com`, phone `0800000000`), a throwaway database container you start and
  remove. Secrets the app needs locally: local dummy values from `.env.example`; real or paid API keys only with the
  user's permission, never written into the manual or committed.
- `manual-kit shotlist` shows what to capture; specs live in `manual/shots.yaml` (logins, actions, highlight, mask,
  hide, viewport - see reference.md). Passwords come from the environment (`{env:NAME}`), never the file.
- Sign-in through SSO, 2FA or a national-ID app (or any time you would otherwise handle a password): give the login
  `storageState: true` and an `until` selector instead of actions, and **ask the user to run `manual-kit login <name>`**
  themselves (in Claude Code: `! manual-kit login main`). They sign in in the browser window that opens; capture then
  reuses the saved session. When capture says the session is missing or expired, ask them to run the same command
  again. Never type, ask for or read the credentials, and never open, print or copy `manual/.auth/` (it is a secret).
- Personal data that shows anyway (names, e-mail, signatures): set `capture.redact` in the config (presets `email`,
  `thai-name`, `latin-name`, your own `text` patterns, `images` selectors) so every shot, step and clip frame is
  blurred there; check the images, since a name preset can miss or over-cover.
- `manual-kit capture [--changed]`; for clips also `manual-kit encode` (needs ffmpeg). **Look at every image** (Read
  the PNG): styled, right screen, right data, nothing private, no dev overlay.
- Use `capture --only <id>` while fixing one shot, and `capture --dry-run` before a long run.
- Capture already waits for each page to settle (network quiet, fonts, no visible spinner), so `{ waitMs: n }` is
  rarely needed. A `did not settle` warning names what was pending: add the app's loader class to
  `capture.settle.spinners`, or set `networkIdle: false` for an app that polls, instead of adding `waitMs` to every shot.
- A button that only some app states show (a context or account picker the server remembers): mark its action
  `optional: true` so it is skipped when absent, rather than relying on the previous run having left the right state.
- When a shot or login fails, **Read the failure screenshot first** (the message gives its path under
  `manual/.manual-kit/failures/`) and use the similar elements the message lists before you try another selector. A
  `blocked by capture allowlist` line means the page needed that host (an SSO or API host): add it to
  `capture.allowlist` if it is a local or test host.
- Walkthrough videos (cursor, zoom, captions, title cards, music) are built from captured screenshots, never the live
  app: `walkthroughs` in shots.yaml, `manual-kit walkthrough measure` (target boxes; `--list <shot>` to pick targets),
  `manual-kit walkthrough build` (HyperFrames via npx, needs ffmpeg), shown with `{{clip:<id>}}`. Use shots
  without a `highlight` (the video draws its own ring).
- Media levels: `none`, `screenshots`, `steps` (step-by-step images), `steps+video` (also short clips).

## 6. Check, sign, build, verify

- `manual-kit check --allow-unsigned` until there are no errors; fix warnings or explain them. **Only a person signs**
  (`manual-kit sign <ids> | --all`) after reading a page; an agent never signs, even to make CI green.
- `manual-kit build pdf|docx|web` (no format = every output switched on). DOCX needs pandoc; `--finalize auto` uses
  LibreOffice when installed to fill the TOC page numbers. **Never automate Microsoft Word** (`--finalize word`) unless
  the user asks for it.
- `capture`, `encode`, `walkthrough build` and `build` print one summary line plus every failure and warning with its
  item and cause; that is all there is to act on. Add `--verbose` only when you need the list of items done. `check`
  puts repeated findings on one line with every `file:line`.

| Output | Verify by |
|---|---|
| PDF | Read the PDF (pages 1-6 and a few content pages): fonts (no tofu boxes), Thai line breaks, cover, document control, TOC page numbers, header/footer, figures |
| DOCX | `manual-kit check --docx <file>`; with LibreOffice also read `dist/.build/<book>.<lang>.libreoffice.pdf`. Without a word processor say the layout is unverified and recommend the PDF for delivery until someone opens it in Word |
| Web | `manual-kit snap manual/dist/web/index.html --width 1280,390` and look at both PNGs (no sideways scroll at 390); search a Thai word |

Previews (Quick Look, thumbnails) do not prove a DOCX is right.

## 7. Updating after app changes

`manual-kit discover` again and `git diff manual/discovery.json` -> update `manual-spec.md` (new features, changed
workflows, removed screens). `manual-kit check` lists pages whose `sources` changed, missing `{{ui}}` labels, new
unmapped screens and spec gaps. Edit only those pages, `capture --changed`, rebuild, and ask a person to `sign`.
Update the manual in the same merge request as the feature when possible.

## Common mistakes

- Explanation inside the steps -> a lecture the reader cannot follow with the app open. One action per step; the why
  goes in the intro or ข้อควรทราบ.
- Several tasks on one page, or a plain numbered list where `{{steps:id}}` would give each step its screenshot.
- Problems titled by the writer's words ("บันทึกไม่ได้") -> the reader cannot find them. Use the message the system
  shows, verbatim, from discovery's messages.
- Pages ordered by the writer's grouping instead of the app's menu.
- "ดูวิดีโอ" in the text -> a dead line in the PDF.
- Button names typed by hand -> drift. Use `{{ui:"..."}}`.
- Coverage or features from memory -> missed screens. Use `discover` + `inventory`.
- Spec claims without a path, or guessed business rules -> wrong manual. Cite or ask.
- Capture specs never run, guessed selectors -> run `capture` against the live app and look at the images.
- Screenshots from production or with real people's data.
- Unstyled screenshots because CSS/fonts from a CDN were blocked -> list the hosts in `capture.assetHosts`.
- DOCX checked only by preview -> wrong Thai font, empty TOC.
- Signing pages yourself.
