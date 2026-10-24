# manual-kit v0 — Implementation plan

Spec: `docs/spec.md`. Principles: https://github.com/backnotprop/pstack (`skills/principle-*/SKILL.md`, MIT). TDD for every unit; each task ends in a verifiable state and its own commit.

Stack: Node 24, TypeScript (ESM), pnpm, vitest, `commander` (CLI), `yaml`, `gray-matter`, `typescript` (parser for adapters), `playwright` (capture + PDF), `markdown-it` (HTML render), pandoc (system binary, DOCX). Package name `manual-kit`, bin `manual-kit`.

| # | Task | Done when (verify) |
|---|---|---|
| T1 | Scaffold: package.json, tsconfig, vitest, eslint-free, `src/cli.ts` with commander and `--version` | `pnpm test` green; `node dist/cli.js --version` prints |
| T2 | Config loader: `manual/manual.config.(ts|json|yaml)` → typed `ManualConfig` (zod) incl. document meta, languages, outputs, media level, adapter, capture allowlist, wording rules | unit tests for valid/invalid configs |
| T3 | Page model: load `pages/<lang>/<book>/*.md` with front matter (id, title, audience, book, kind, routes, sources); token scanner for `{{ui:}}`, `{{shot:}}`, `{{steps:}}`, `{{clip:}}`, `{{data:}}`, `[[page-id]]` links | tests on fixture pages |
| T4 | Adapter interface + `generic` (globs/regex from config) + `json-i18n` + a project-specific adapter (TS parser over an internal app's string registry, tabs and permissions; removed later) | adapter tests on fixtures; the project-specific adapter reads > 1,000 strings from its app |
| T5 | `inventory`: build coverage items (route / role / section / flag) → merge into `coverage.yaml` (new = unmapped, missing = removed) idempotently | running twice yields no diff |
| T6 | `check`: rules (front matter, links, ui keys exist per language, language twins same token multiset, coverage unmapped/removed, sources drift vs `manual.lock.json`, shot specs complete + missing media for media level, wording rules) → report + exit code + `--json` | rule-by-rule tests incl. failing fixtures |
| T7 | `sign <ids...|--all>` writes source hashes; `new-page <id> --kind` from templates | tests |
| T8 | Render: tokens → markdown/HTML per language (ui strings, data, shot images with numbered captions "ภาพที่ n-m", steps tables, cross-references) | snapshot tests |
| T9 | Front matter builder: cover, document control, revision history (config + git tags), approval page, TOC/figure/table lists, intro (purpose, scope, audience, glossary) — sections toggled by config | snapshot tests |
| T10 | `build pdf`: HTML + neutral print CSS (Sarabun/LINE Seed via local font files or Google Fonts cache, A4, header/footer "หน้า X จาก Y", no image split) → Playwright `page.pdf`; project `templates/pdf.css` overrides | PDF produced from fixture; page count > 0; text extract contains Thai title |
| T11 | `build docx`: render markdown → pandoc with `--reference-doc` (bundled neutral reference.docx or project template), numbered headings, captions | DOCX produced; unzip contains document.xml with Thai title |
| T12 | `shotlist` + `capture` (screenshots + step screenshots with highlight overlay, masks, allowlisted URLs only, project seed hook, viewport per spec) | capture against a local static fixture site in tests |
| T13 | `init`: scaffold manual/ + config + sample page + CI snippet | e2e test in temp dir |
| T14 | Dogfood on an earlier internal app: init in a temp copy (not the repo), inventory, 3 pages (bilingual), sign, capture against local dev server if available (else document), build pdf + docx | files exist; check passes; report tokens/time; screenshots of output pages reviewed |
| T15 | README (Thai + English quick start), CHANGELOG | — |

Out of v0: encode/clips, web build, Nuxt/Next adapters, PR bot, extra themes.
