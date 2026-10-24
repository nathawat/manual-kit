// Page images for the PDF and Word scenes -> WORK/site/img. The PDF pages come from the manual's own build; the Word
// pages from a PDF that Microsoft Word saved from docs/manual/dist/user-guide.th.docx (DEMO_WORD_PDF), so the scene
// shows Word's own layout. Needs pdftoppm (poppler).
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { REPO, WORK } from './paths.mjs'
const img = join(WORK, 'site/img')
mkdirSync(img, { recursive: true })
const page = (pdf, p, out) => execFileSync('pdftoppm', ['-f', String(p), '-l', String(p), '-r', '110', '-png', '-singlefile', pdf, join(img, out)])
// site/pdf.html: cover, contents, a chapter, a screenshot, steps
for (const p of [1, 4, 9, 11, 15]) page(join(REPO, 'docs/manual/dist/user-guide.th.pdf'), p, `pdf-${p}`)
// site/word.html: cover, contents (page numbers filled by Word), the install steps
const word = process.env.DEMO_WORD_PDF
if (!word) throw new Error('set DEMO_WORD_PDF to the PDF Word saved from docs/manual/dist/user-guide.th.docx')
;[1, 4, 11].forEach((p, i) => page(word, p, `word-${i + 1}`))
console.log('ok', img)
