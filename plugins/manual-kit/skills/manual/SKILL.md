---
name: manual
description: Make or update a formal user manual (คู่มือการใช้งาน, คู่มือผู้ใช้, คู่มือผู้ดูแลระบบ, เอกสารส่งมอบ) for the current project as PDF, Word/DOCX or a docs website, end to end - scan the repo for requirements, design, workflows and features, write a manual spec, run the app locally with invented test data, write the pages, capture screenshots, build and check the outputs. Modes - spec (scan and spec only), update (follow code changes), check (report drift). Use when someone asks for a manual or user guide of this project.
argument-hint: "[spec|update|check] what you want, e.g. ทำคู่มือผู้ใช้ ภาษาไทย ออก PDF กับ Word"
allowed-tools: Bash(manual-kit:*)
---

# /manual-kit:manual

Request: **$ARGUMENTS**

You make the whole manual yourself; the person only reads it at the end and signs. Work autonomously from start to
finish. Follow the method and rules in `${CLAUDE_PLUGIN_ROOT}/skills/building-product-manuals/SKILL.md` (read it
first; it is the single source of the rules) and write the spec from
`${CLAUDE_PLUGIN_ROOT}/skills/building-product-manuals/spec-template.md`. Config keys, page tokens and shots.yaml:
`${CLAUDE_PLUGIN_ROOT}/skills/building-product-manuals/reference.md`.

`manual-kit` is on the Bash PATH (this plugin's `bin/`; if not found, use `${CLAUDE_PLUGIN_ROOT}/bin/manual-kit`). The
first command on a machine installs its runtime packages and Chromium (a few minutes; give it a 10-minute timeout).

## Mode

From the first word of the request: `spec` = discovery and spec only; `update` = follow code changes; `check` = report
only, change nothing; anything else = a new manual (or continue the one in `manual/`). If `manual/manual.config.yaml`
already exists and the request does not say "new", treat it as `update`.

## Inputs first: one question round

`manual-kit init` gathers every project input and ends with a checklist: **Still missing** (books' audiences,
descriptions and icons, app URL and environment, login, client, developer, system name, logos, cover illustration,
brand colour) and **Confirm** (books, title, outputs, redaction). Get all of it from the user in ONE message, never
one item per turn:

1. After `discover`, run `manual-kit init --no-samples --languages th --books <readers from discovery> --adapter
   <discovery's adapter> --title "<คู่มือ...>"` plus a flag for each input you already know (`--app-url`,
   `--client`, ... see `manual-kit init --help`).
2. Ask one message with every checklist item, plus paid or personal API keys the app needs and system software
   `manual-kit doctor` reports missing (pandoc for DOCX, ffmpeg for clips; install only on a yes, never LibreOffice
   or Word without one). For the login ask the type and the **names** of the environment variables that hold the
   user and password; never ask for or write the values. For SSO, 2FA or a national-ID sign-in, prefer
   `manual-kit login main` (`storageState: true` in `logins.main`): ask the user to run it themselves (in Claude Code
   `! manual-kit login main`) and sign in in the window it opens.
3. Write the reply into an answers file outside `manual/` using the checklist keys (`login: { type: form, userEnv:
   ..., passwordEnv: ... }`), run `manual-kit init --answers <file>`, and delete the file. init fills only blank keys
   and never changes a value a person set; to change one, edit `manual/manual.config.yaml`.
4. Do not ask a second round. Whatever is still unanswered becomes `(รอระบุ)` or a default and goes on the report's
   to-confirm list, as do document number, approvers and contact when you cannot find them. In a non-interactive run (no one to answer), skip the question: take the defaults and list every
   assumption.

Defaults: Thai only unless English is asked for; outputs from the request (PDF when none is named; "Word" = docx;
"เว็บ" = web); books from the readers found in the spec (`user-guide`, plus `admin-guide` when admins have their own
screens); media `steps+video` when the app runs locally and ffmpeg is present, `steps` without ffmpeg, `none` when the
app cannot be run; a page count the user names is a limit, not a target.

## Do not redesign

The cover, the video title cards, the help-center web site and its FAQ are finished designs driven by config. Change
config, never write custom CSS, `templates.pdfCss`, HTML or scripts for them:

- cover: `document.logos` (seal, then system logo), `document.coverImage`, `document.developer`, `books.<id>.icon`
- video cards: `web.brand.colors`, `books.<id>.icon`, `capture.clips`
- web front page and top bar: `web.brand` (name, logo, colours), `web.home` (title, lede, hints, journey),
  `books.<id>.audience` and `description`
- FAQ: built from each how-to page's ปัญหาที่อาจพบและวิธีแก้ไข section (problems titled by the system's own
  messages); write those sections well

If a design looks wrong, fix the config value or report it as a manual-kit issue.

## Keep context small

- Use each command's default summary output; do not add `--json` or print `discovery.json`, `coverage.yaml`, built
  HTML or extracted PDF text into the conversation. Read only the section you need (`grep -n`, then a line range).
- Look at a few representative images and pages, not every file at once.
- Run `/compact` between phases (after the spec, after capture, after the pages).

## New manual (and `spec`)

1. **Read the project**: README, CLAUDE.md / AGENTS.md, package.json (scripts), docs index. Note how to run it.
2. **Discover**: `manual-kit discover`, then read `manual/discovery.md` and the requirement / design documents it lists.
3. **Inputs**: init and the one question round above.
4. **Spec**: write `manual/manual-spec.md` (template above; Thai first; every claim cites a path; unknowns are
   questions). Then tell the user a short summary: features, workflows, the page plan, the open questions.
   In `spec` mode stop here and report. Otherwise continue without waiting, unless the user asked to review the spec first.
5. **Coverage**: `manual-kit inventory`; plan which page covers each item of `manual/coverage.yaml`.
6. **Run the app locally with invented data** (see the method, section 5). Find the dev command from the README and
   scripts; install the project's own dependencies if needed; create `.env.local` (or what the project uses) from
   `.env.example` with local dummy values; a database in a throwaway container if needed
   (`docker run -d --rm --name manual-kit-<project>-db ...`). Seed with the project's seed script if its data is clearly
   fake, otherwise create test data through the UI or API with invented values. Start servers in the background and
   **write down every process and container you start**. Never point anything at production or real data. If the app
   cannot be run, continue with `media: none` and say so.
7. **Media**: specs in `manual/shots.yaml` for every page in the plan (signed in with `login: main`);
   `manual-kit capture`; `manual-kit encode` for clips. Read the images and fix specs until each one shows the right
   screen with test data only. For a how-to worth a video, add a `walkthroughs` entry over its captured shots (targets
   from `manual-kit walkthrough measure --list <shot>`), then `walkthrough measure` and `walkthrough build`; look at
   frames of the MP4 (ffmpeg) before showing it with `{{clip:id}}`.
8. **Pages, split by book**: start one subagent per book, all in the same message so they run in parallel. Give each
   the path to the writing rules (method sections 3 and 4), the spec section for its readers, its book id and languages, its
   page plan, its coverage items and its shot, steps and clip ids. Each runs `manual-kit new-page` for its pages,
   writes them (the how-to template: one task per page, one short action per step with `{{steps:id}}`, explanation
   only in the intro and ข้อควรทราบ, problems titled by verbatim system messages; no system names, routes, variables or codes;
   `{{ui:"..."}}` for every label, `(รอระบุ)` for unknowns, `sources:` and `routes:` / `covers:` in front matter),
   edits only its own book's pages (never the config, `shots.yaml` or `coverage.yaml`), and returns a short list:
   pages written, `(รอระบุ)` items, product issues. You only review, run check and fix. A cheaper model such as Sonnet
   is fine for the page subagents and the capture/check loop; use the strongest model for the final language review.
9. **Check**: `manual-kit check --allow-unsigned` until there are no errors (spec, coverage, labels, twins, wording),
   and rewrite every plain-language warning (system words in the text) instead of ignoring it.
10. **Build**: `manual-kit build pdf` / `docx --finalize auto` / `web` as asked. Never `--finalize word` unless asked.
11. **Look at the outputs**: Read the PDF (cover, document control, TOC, two content pages); `manual-kit check --docx`
    for each DOCX (and the LibreOffice review PDF when there is one); `manual-kit snap manual/dist/web/index.html
    --width 1280,390` and Read both PNGs. Fix config and pages (never the design) and rebuild until they look right.
12. **Stop what you started**: every server process and container from step 6 (only those; never anything else).
13. **Report** (in the user's language, short):
    - files produced (paths under `manual/dist/`), and `manual/manual-spec.md`
    - **ต้องยืนยัน / to confirm**: every `(รอระบุ)` and assumption, with where it appears
    - **ปัญหาของระบบที่พบ / product issues** found on the way
    - what was skipped and why (missing tool, no API key, app would not run)
    - what a person must do: read every page, then `manual-kit sign --all` (or page ids); you never sign

## `update`

1. `manual-kit discover`, then `git diff -- manual/discovery.json` (and `git log` since the manual last changed) to see
   what changed in the product.
2. Update `manual/manual-spec.md` (new or changed features, workflows, rules, messages; removed screens to out of scope).
3. `manual-kit inventory` and `manual-kit check --allow-unsigned`: edit the pages it points at (changed sources,
   missing labels, unmapped screens, spec gaps); add pages for new features.
4. Run the app as in step 6 above, `manual-kit capture --changed` (+ `encode --changed`, `walkthrough measure` and `walkthrough build --changed`), rebuild, look at the outputs,
   stop what you started, report as above (list the changed pages; they need signing again).

## `check`

Change nothing. Run `manual-kit discover --print` (compare with `manual/discovery.json`), `manual-kit check`, and report
in plain words: what drifted (screens, labels, roles, flags not in the spec, unsigned pages, stale images) and what
`/manual-kit:manual update` would do.
