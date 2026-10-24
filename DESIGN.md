---
name: manual-kit web manual (default theme)
description: Web help for a client's system in a serious, formal voice; the product's colour carries the page head, the body is a calm, dense reading sheet with real screenshots.
colors:
  brand: "#183b5e"
  brand-deep: "#10293f"
  on-brand: "#ffffff"
  brand-soft: "#e8eef5"
  brand-line: "#b8c7d8"
  accent: "#d9480f"
  accent-ink: "#b33b0b"
  ink: "#18202b"
  ink-2: "#333d4b"
  muted: "#556072"
  faint: "#8a94a3"
  bg: "#ffffff"
  page: "#f3f5f8"
  sunken: "#eef1f5"
  line: "#dde2e9"
  line-2: "#c9d0da"
  ok: "#146c43"
  warn: "#8a4b00"
  warn-soft: "#fff3e0"
  dark-bg: "#14181e"
  dark-page: "#0f1216"
  dark-sunken: "#1b2028"
  dark-ink: "#e7ebf0"
  dark-ink-2: "#c9d1db"
  dark-muted: "#a0abba"
  dark-line: "#262d37"
  dark-line-2: "#343d49"
typography:
  cover:
    fontFamily: "'IBM Plex Sans Thai', system-ui, sans-serif"
    fontSize: "52px"
    fontWeight: 700
    lineHeight: 1.22
  page-title:
    fontFamily: "'IBM Plex Sans Thai', system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: 1.3
  section:
    fontFamily: "'IBM Plex Sans Thai', system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.4
  home-section:
    fontFamily: "'IBM Plex Sans Thai', system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.35
  step-title:
    fontFamily: "'IBM Plex Sans Thai', system-ui, sans-serif"
    fontSize: "18.5px"
    fontWeight: 700
    lineHeight: 1.5
  lede:
    fontFamily: "'IBM Plex Sans Thai', system-ui, sans-serif"
    fontSize: "17.5px"
    fontWeight: 400
    lineHeight: 1.7
  body:
    fontFamily: "'IBM Plex Sans Thai', system-ui, sans-serif"
    fontSize: "16.5px"
    fontWeight: 400
    lineHeight: 1.78
  label:
    fontFamily: "'IBM Plex Sans Thai', system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1.4
  caption:
    fontFamily: "'IBM Plex Sans Thai', system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
    fontSize: "14.5px"
    lineHeight: 1.65
rounded:
  sm: "4px"
  md: "6px"
  frame: "8px"
spacing:
  gutter-phone: "16px"
  sheet-x: "40px"
  home-x: "32px"
  section: "40px"
  home-section: "52px"
  step-y: "18px"
components:
  topbar:
    backgroundColor: "{colors.brand-deep}"
    textColor: "{colors.on-brand}"
    height: "56px"
  page-head:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    padding: "26px 40px 24px"
    rule: "4px {colors.accent} at the bottom"
  kind-label:
    textColor: "{colors.on-brand}"
    border: "1px on-brand 40%"
    rounded: "{rounded.sm}"
    padding: "1px 9px"
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
  facts:
    border: "1px {colors.line}"
    rounded: "{rounded.md}"
    cell: "10px 14px"
  step-number:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "5px"
    size: "34px"
  note-tip:
    headerBackground: "{colors.brand-soft}"
    headerText: "{colors.brand}"
    border: "1px {colors.line-2}"
    rounded: "{rounded.md}"
  note-warning:
    headerBackground: "{colors.warn-soft}"
    headerText: "{colors.warn}"
    rounded: "{rounded.md}"
  table-head:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
  outline-current:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.md}"
  toc-current:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
  role-segment-pressed:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
  guide-card:
    headerBackground: "{colors.brand-soft}"
    border: "1px {colors.line}"
    rounded: "{rounded.md}"
---

# Design System: manual-kit web manual (default theme)

The default theme of manual-kit's web output: `assets/web/site.css`, `assets/web/site.js`, `src/build/web.ts`,
`src/web/brand.ts`, `src/web/art.ts`.

## Overview
The site is web help for one client's system, read by the people who use that system at work. It should feel
serious and formal, like an official manual, while behaving like a website: search first, pages linked by title,
no section or figure numbers, PDF only as a download.

Two layers carry the design:
- **The product's colour field.** The top bar (brand-deep), the front-page hero and each page head (brand) are solid
  fields of the client's colour, closed by a 4 px accent rule. This is where expression lives.
- **The reading sheet.** Everything below is a calm white sheet: dense ruled facts, bold coloured section headings,
  square step numbers, full-frame screenshots, labelled note boxes. No decoration competes with the steps.

## Colors
The palette is two client colours plus fixed neutrals. A maker sets `brand` and `accent`; every other brand token is
computed in the theme so contrast holds for any pair (light, dark, yellow, near-black).

### Brand (overridable)
- **brand** `#183b5e`: page head, hero, step numbers, table head, current outline item, primary button.
- **brand-deep**: top bar (in light: brand mixed 32 % toward black when white text fits on brand, else brand itself). brand mixed 32 % toward black when white text fits on brand, else brand itself.
- **on-brand / on-deep**: white or `#18202b`, whichever reaches 4.5:1 on that field. Top-bar text is computed
  against brand-deep, never against brand (a yellow brand in dark mode needs dark text on the bar).
- **brand-ink**: brand moved toward black (light) or white (dark) until it reaches 4.6:1 on bg, brand-soft and sunken.
  Used for headings, links and the current-section text.
- **brand-soft / brand-line**: brand mixed 9 % / 32 % into bg (20 % / 42 % in dark). Card heads, note headers, hover
  borders.
- **accent** `#d9480f`: the 4 px rule under every colour field. Lightened 50 % toward white if it falls under 1.6:1
  against the brand field.
- **accent-ink**: accent made readable on bg, sunken and brand-soft. Page-kind label, current "ในหน้านี้" item,
  marker dots in illustrations.

### Neutral (fixed)
ink `#18202b`, ink-2 `#333d4b`, muted `#556072`, faint `#8a94a3`, bg `#ffffff`, page `#f3f5f8`, sunken `#eef1f5`,
line `#dde2e9`, line-2 `#c9d0da`. Status: ok `#146c43` (who-it-is-for), warn `#8a4b00` on warn-soft `#fff3e0`.

### Dark
bg `#14181e`, page `#0f1216`, sunken `#1b2028`, ink `#e7ebf0`, ink-2 `#c9d1db`, muted `#a0abba`, line `#262d37`,
line-2 `#343d49`. The brand field is brand mixed 25 % toward black; brand-deep 55 %.

### Named Rules
- **Computed, never hand-tuned.** Brand tokens are worked out at build time by `src/web/brand.ts` into `assets/brand.css`; a fixture with no brand, a
  dark navy, a bright orange and a yellow must pass axe AA in light and dark (tests/web-brand.test.ts).
- **Two colours only.** No third hue for decoration. Status colours are for status.

## Typography
IBM Plex Sans Thai (Regular 400, SemiBold 600, Bold 700, OFL) for Thai and Latin. Alternative: Inter + Noto Sans
Thai. No letter-spacing on Thai text. Body line-height 1.78 so stacked vowels and tone marks never touch.

### Hierarchy
| Role | Size / weight | Where |
|---|---|---|
| cover | 52 / 700 (34 at 390) | front-page system name |
| page-title | 36 / 700 (28 at 390) | page head h1 |
| home-section | 28 / 700 (23 at 390) | front-page section headings, brand-ink, 2 px rule under |
| section | 24 / 700 (21 at 390) | in-page h2, brand-ink, 2 px rule under |
| step-title | 18.5 / 700 | step h3 |
| lede | 17.5 / 400 | under page title and cover |
| body | 16.5 / 400, 1.78 | prose |
| label | 12.5 / 600, muted | facts labels |
| caption | 13.5 / 400, muted | screenshot and table captions |

### Named Rules
- **No numbering on the web.** No "ข้อ 2.2", "ภาพที่ 2-1", "ตารางที่ 2-1". The PDF numbers its own pages. On the web,
  refer to another page by its title as a link: "ดูหน้า ยกเลิกใบลา".
- **Words of the web.** คู่มือ (a guide), หมวด (a menu group), หน้า (a page). Not เล่ม, บท, ข้อ, ฉบับ.
- UI names in body text sit in a `.ui` plate (sunken, line-2 border, 4 px radius, 3 px 8 px padding).

## Layout
- **Front page:** top bar, hero (text column + illustration, 1.05 : 1), accent rule, then sections in a 1200 px
  wrap: guides (2 columns), journey (4 stages), FAQ band, videos (3 columns), using this manual (3 cells), footer.
- **Page:** top bar; 300 px sidebar | sheet (max 820 px) | 236 px "ในหน้านี้". Under 1260 px the right column goes;
  under 900 px the sidebar becomes a drawer and the sheet runs edge to edge.
- **Phone (390):** 16 px gutter; screenshots edge to edge inside steps; no horizontal page scroll; wide tables scroll
  inside their own focusable region.
- One way to each thing: the front page has no top-bar search because the hero search is the same control.

## Elevation & Depth
Flat by default; separation by 1 px lines and the page / bg contrast. One shadow, `0 1px 2px rgb(16 24 40 / .07),
0 10px 28px -18px rgb(16 24 40 / .3)`, only on the page sheet at desktop width. Guide cards have a border and no
shadow. The hero illustration frame carries no shadow.

## Shapes
6 px radius everywhere (`rounded.md`); 4 px for small labels and UI plates; 5 px for step numbers. Square step
numbers, not circles. No pills except the review control (prototype only).

## Components
### Top bar
brand-deep field, 56 px: logo tile, system name, guide switcher, search (pages only), EN, theme, "กลับหน้าระบบ".

### Page head (signature)
brand field, breadcrumbs, page-kind label (วิธีทำ, อ้างอิง, แนวคิด, แก้ปัญหา), title, lede, a quiet line
"อัปเดตล่าสุด · ใช้กับระบบเวอร์ชัน", print button; 4 px accent rule at the bottom.

### Facts strip
4 ruled cells under the head on how-to pages: สำหรับ (ok colour), เมนูในระบบ, ใช้เวลา + link "n ขั้นตอน",
สิทธิ์ที่ต้องมี. 2 × 2 at 390.

### ก่อนเริ่ม
`details` on sunken, folded when it has more than 2 items, open with 2 or fewer.

### Steps
Square brand number, bold title, 2 to 3 sentences (what you see, why, what to check), notes, then the full-frame
screenshot as a zoom button with a caption. A missing capture shows a dashed frame "ภาพประกอบของขั้นนี้ยังไม่พร้อม"
with the shot id; a page without screenshots shows text steps with no empty frames.

### Notes
Labelled boxes: หมายเหตุ (brand-soft header, brand-ink text), ข้อควรระวัง (warn-soft header, warn text). Header
padding 8 px 14 px, body 10 px 14 px 12 px. No side stripes.

### Tables
brand header row, zebra rows on sunken 60 %, caption below in muted, own scroll region on phones.

### Problems and fixes
`details` list in one ruled box; the question bold, the fix under it.

### Sidebar
Guide block (name, downloads PDF / Word), link to the other guide, role segmented control with page counts, groups
in the app's menu order with counts, current page as a brand fill.

### In this page
Plain list; the current section gets a sunken fill and accent-ink text. No side bar.

### Guide card (front page)
brand-soft head with title, one paragraph, and the guide's illustration; facts (สำหรับ, เนื้อหา n หน้า, วิดีโอ);
menu groups with page counts; footer with "เปิดคู่มือ".

### Journey
4 ruled stages in one box, each a role label (brand fill), pictogram, linked title, one sentence, "ในคู่มือ…".

### Illustrations
Theme-owned inline SVG symbols, domain-neutral (screen with numbered steps, person with screen, settings, journey
pictograms). Rendering `line` by default: outlines in currentColor, fills of the surrounding colour, accent for the
step markers. Colours only through `--art-bg`, `--art-accent`, `--art-on-accent` and currentColor, so every brand
recolours them. Styles reach into `<use>` through custom properties, not ancestor selectors. Decorative:
`aria-hidden`. Hidden in the hero at 390 when space is short.

## PDF cover
`templates.cover: formal` (default): white A4, a 9 mm band in brand with a 1.6 mm accent rule, the organisation and
logos centred, a 36 pt title in brand-ink (brand made readable on paper), the book name and subtitle at the left, the
illustration at the right (`document.coverImage`, else the theme's hero drawing), the document fields in three ruled
columns along the bottom, and a footer line (developer · book). Set in the PDF body face so copied text keeps Thai words
whole. The document control, figure and table numbers belong to the PDF and DOCX, not the web.

## Motion
Expand and collapse 180 ms; nothing else animates. `prefers-reduced-motion` removes transitions.

## Do's and Don'ts
### Do:
- Put the client's colour on the fields (top bar, hero, page head) and keep the body calm.
- Explain each step in plain formal Thai addressed to "คุณ", saying why as well as what.
- Link other pages by their title.
- Test every brand fixture in light and dark at 1440 and 390 with axe.

### Don't:
- Number sections, figures or tables on the web, or show ฉบับ / document-control bands.
- Copy any client's or reference product's colours, fonts, illustrations or card styles.
- Use side-stripe accents, pills, gradients or a third decorative colour.
- Put real client screens or personal data in examples.
