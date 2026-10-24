import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openProject } from '../src/project.ts'
import { markdownToHtml, renderBook, type Target } from '../src/render.ts'
import { cleanFixture } from './helpers/fixture.ts'

// A how-to page whose own numbered steps hold a steps block, a table and an indented screenshot between items,
// like the manual-kit pages "ติดตั้ง plugin" and "ทำคู่มือใหม่ด้วย /manual".
const PAGE = `---
id: teacher.numbered
title: ขั้นตอนมีภาพคั่น
audience: [teacher]
book: user-guide
kind: how-to
---

## ขั้นตอน

1. หนึ่ง
2. สอง

{{steps:create-class}}

3. สาม

| ช่อง | ความหมาย |
|---|---|
| ชื่อ | ชื่อห้อง |

4. สี่

   {{shot:login}}

5. ห้า
6. หก
   {{steps:create-class}}
7. เจ็ด
`

/** Each ordered list in the HTML: its start number and how many items it has directly. */
function lists(html: string): { start: number; items: number }[] {
  const out: { start: number; items: number }[] = []
  const stack: { start: number; items: number }[] = []
  for (const m of html.matchAll(/<(\/?)(ol|li)(?:\s[^>]*?(?:start="(\d+)")?[^>]*)?>/g)) {
    const [, close, tag, start] = m
    if (tag === 'ol' && !close) stack.push({ start: Number(start ?? 1), items: 0 })
    else if (tag === 'ol') out.push(stack.pop()!)
    else if (tag === 'li' && !close) stack[stack.length - 1]!.items++
  }
  return out
}

async function render(target: Target) {
  const root = await cleanFixture()
  writeFileSync(join(root, 'manual/pages/th/user-guide/03-numbered.md'), PAGE)
  const project = await openProject(join(root, 'manual'))
  project.config.media = 'steps'
  return renderBook(project, { lang: 'th', book: 'user-guide', target }).chapters[2]!.markdown
}

describe('numbered steps around embedded blocks', () => {
  // markdown-it renders the PDF HTML and the web site, and Outline parses Markdown with markdown-it too.
  it.each(['html', 'outline', 'web'] as Target[])('keeps the page numbering and the steps block apart (%s)', async (target) => {
    const html = markdownToHtml(await render(target), 3).html
    // nested lists close first: the steps list inside item 6 comes before the outer list 5-7
    expect(lists(html)).toEqual([
      { start: 1, items: 2 },
      { start: 1, items: 2 },
      { start: 3, items: 1 },
      { start: 1, items: 2 },
      { start: 4, items: 4 },
    ])
    // the indented screenshot stays inside item 4
    expect(html).toMatch(/<li>\s*<p>สี่<\/p>\s*(<p>)?(<figure|<img|!\[)/)
  })

  it('gives pandoc (DOCX) the same lists, each with its own start number', async () => {
    const native = execFileSync('pandoc', ['-f', 'markdown', '-t', 'native'], { input: await render('pandoc') }).toString()
    const starts = [...native.matchAll(/OrderedList\s*\(\s*(\d+)/g)].map((m) => Number(m[1]))
    expect(starts).toEqual([1, 1, 3, 4, 1])
  })
})
