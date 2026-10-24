# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, in this order of importance for visual work:

1. **Readers of a generated manual.** End users of some other product (office staff, teachers, administrators, field staff, customers of a software house). They arrive from the product's help link, a search, or a QR code on a printed PDF, usually mid-task and often on a phone. Their job: find the one task they are stuck on, follow numbered steps with screenshots or a short clip, and get back to work.
2. **Teams who make manuals with manual-kit.** Developers, BAs and project leads at software teams, working in Claude Code. Their job: hand the client a formal manual (PDF, DOCX, web) that stays in sync with the code, without hand-made screenshots.

## Product Purpose

manual-kit is an open-source Claude Code plugin and CLI that builds formal user manuals from a product's code and running app: it discovers features, captures real screenshots and step clips, and builds PDF, DOCX and a static web manual, then checks in CI that the manual still matches the code. Success for the web output: a reader finds their task and finishes it without calling support, on desktop or phone.

## Positioning

The manual is generated from the product itself (captured screens, step highlights, clips, UI labels checked against source), so every page shows the real interface at the step the reader is on. Docs tools render Markdown; manual-kit renders a product's own task flow.

## Operating Context

- The web manual is a static site written to disk; it must open from `file://` and from any static host, with relative URLs and no requests to other domains.
- One site can hold several books (user guide, admin guide, developer guide) and role filters (audiences).
- Thai is a first-class language (search segments Thai with `Intl.Segmenter`); sites can be bilingual.
- Accessibility is tested with axe-core in light and dark mode (`tests/web-theme.test.ts`).

## Capabilities and Constraints

- The theme is the default for every product that uses manual-kit: each project sets its own name, logo, colours and font (`web.brand`) and may add CSS. The default must look intentional with no brand set and must survive any brand colour.
- Page kinds: how-to (numbered steps with screenshots/clips), reference, concept, troubleshooting, FAQ; plus a front page, per-book home, search, and a video gallery.
- Must not depend on a framework at runtime: plain HTML, `assets/web/site.css`, `assets/web/site.js`.
- Must not carry any client's or company's identity (see Brand Commitments).

## Brand Commitments

- Neutral by default: no company or client identity in the default theme, examples or docs. The product being documented supplies the brand.

## Evidence on Hand

- The dogfood manual of manual-kit in `docs/manual` (2 books, 22 pages, terminal screens, one clip) is the build target for screenshots.
- Example product screenshots must be fictional; no real client screens may ship.

## Product Principles

1. The reader is mid-task: the path to "my task, step 1" is the shortest thing on every page.
2. Show the real screen at the step; the screenshot is the content, chrome stays out of its way.
3. One way to reach each thing: no element repeats information another already shows.
4. Phone first-class: a reader holding the phone next to the system must be able to follow steps one-handed.
5. The documented product's brand leads; manual-kit's own look is a well-made frame.

## Accessibility & Inclusion

WCAG 2.2 AA in light and dark (axe-core in CI). Body text at least 16 px on mobile; long Thai text must wrap cleanly.
