// Scene "spec": docs/manual/manual-spec.md as a page -> WORK/site/spec.html
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO, WORK, require } from './paths.mjs'
const MarkdownIt = require('markdown-it')
mkdirSync(join(WORK, 'site'), { recursive: true })
let md = readFileSync(join(REPO, 'docs/manual/manual-spec.md'), 'utf8')
md = md.replace(/^---[\s\S]*?\n---\n/, '')
const html = new MarkdownIt({ html: false }).render(md)
writeFileSync(join(WORK, 'site/spec.html'), `<!doctype html><html lang="th"><head><meta charset="utf-8"><link rel="stylesheet" href="/common.css"><style>
body { overflow: auto; background: #eef1f6; }
.file { position: sticky; top: 0; z-index: 2; background: #1c2330; color: #c9d4e5; font: 15px Menlo, monospace; padding: 10px 28px; display: flex; gap: 12px; align-items: center; }
.file b { color: #fff; font-weight: 600; } .file span { margin-left: auto; font: 600 15px 'Plex'; color: #8fa6c9; }
.doc { max-width: 1120px; margin: 22px auto 400px; background: #fff; border-radius: 12px; padding: 30px 48px; box-shadow: 0 6px 24px rgba(15,27,45,.08); font-size: 18px; line-height: 1.65; }
h1 { font-size: 36px; margin: 0 0 8px; color: var(--brand); } h2 { font-size: 25px; margin: 30px 0 10px; color: var(--brand); border-bottom: 2px solid var(--line); padding-bottom: 4px; } h3 { font-size: 20px; margin: 20px 0 8px; }
table { border-collapse: collapse; width: 100%; font-size: 15.5px; line-height: 1.45; margin: 8px 0; }
th, td { border: 1px solid var(--line); padding: 6px 9px; text-align: left; vertical-align: top; } th { background: #f1f4f9; }
td:last-child, code { font-family: Menlo, monospace; font-size: 13px; color: #3b4b66; } code { background: #f1f4f9; padding: 1px 5px; border-radius: 4px; }
td:last-child { word-break: break-all; }
ol, ul { padding-left: 26px; } li { margin: 3px 0; }
.hl { outline: 3px solid var(--accent); outline-offset: 4px; border-radius: 4px; transition: outline-color .3s; }
</style></head><body><div class="file"><b>manual/manual-spec.md</b> <span>Claude เขียนจากการอ่านโค้ด (ตัวอย่าง: สเปกคู่มือของ manual-kit เอง)</span></div><div class="doc">${html}</div></body></html>`)
