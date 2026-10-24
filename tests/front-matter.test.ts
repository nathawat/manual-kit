import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildFrontMatter } from '../src/front-matter.ts'
import { openProject } from '../src/project.ts'
import { renderBook } from '../src/render.ts'
import { cleanFixture } from './helpers/fixture.ts'

async function fm(lang: string, mutate?: (p: Awaited<ReturnType<typeof openProject>>) => void) {
  const root = await cleanFixture()
  const project = await openProject(join(root, 'manual'))
  mutate?.(project)
  const book = renderBook(project, { lang, book: 'user-guide', target: 'html' })
  return { root, model: buildFrontMatter(project, book) }
}

describe('buildFrontMatter', () => {
  it('builds the formal Thai front matter from the config', async () => {
    const { model } = await fm('th')
    expect(model.cover).toMatchObject({ title: 'คู่มือการใช้งานระบบห้องเรียน', bookTitle: 'คู่มือผู้ใช้' })
    expect(model.control?.title).toBe('ข้อมูลเอกสาร')
    expect(model.control?.rows).toContainEqual(['เลขที่เอกสาร', 'DOC-001'])
    expect(model.control?.rows).toContainEqual(['ระดับชั้นความลับ', 'ใช้ภายใน'])
    expect(model.revisions?.rows).toEqual([['1.0', '2026-10-05', 'Team', 'ฉบับแรก']])
    expect(model.approval?.rows).toEqual([['สมชาย ใจดี', 'ผู้อนุมัติ', '', '']])
    expect(model.figures?.items.map((f) => f.label)).toEqual(['ภาพที่ 1-1'])
    expect(model.tables).toBeNull() // no captioned tables
    expect(model.intro?.parts.map((p) => p.title)).toEqual(['วัตถุประสงค์'])
    expect(model.intro?.glossary?.rows).toEqual([['ห้องเรียน', 'กลุ่มนักเรียนที่ครูดูแล']])
    expect(model.appendix).toBeNull() // no contact configured
    expect(model).toMatchSnapshot()
  })

  it('uses English labels and values for the English book', async () => {
    const { model } = await fm('en')
    expect(model.control?.title).toBe('Document information')
    expect(model.control?.rows).toContainEqual(['Classification', 'Internal'])
    expect(model.approval?.header).toEqual(['Name', 'Role', 'Signature', 'Date'])
  })

  it('leaves out sections switched off in the config', async () => {
    const { model } = await fm('th', (p) => {
      Object.assign(p.config.sections, { cover: false, approval: false, figures: false })
      p.config.document.contact = { th: 'ติดต่อทีมงาน', en: 'Contact the team' }
    })
    expect(model.cover).toBeNull()
    expect(model.approval).toBeNull()
    expect(model.figures).toBeNull()
    expect(model.appendix?.parts).toEqual([{ title: 'ติดต่อ', text: 'ติดต่อทีมงาน' }])
  })

  it('adds git tags of the project to the revision history when asked', async () => {
    const { root } = await fm('th')
    const git = (...a: string[]) => execFileSync('git', a, { cwd: root, env: { ...process.env, GIT_AUTHOR_DATE: '2026-09-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-09-01T00:00:00Z' } })
    git('init', '-q')
    git('-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '-q', '--allow-empty', '-m', 'first release')
    git('-c', 'user.email=t@example.com', '-c', 'user.name=T', 'tag', '-a', 'v0.9', '-m', 'Pilot release')
    const project = await openProject(join(root, 'manual'))
    project.config.document.revisionsFromGitTags = true
    const model = buildFrontMatter(project, renderBook(project, { lang: 'th', book: 'user-guide', target: 'html' }))
    expect(model.revisions?.rows).toEqual([
      ['0.9', '2026-09-01', '', 'Pilot release'],
      ['1.0', '2026-10-05', 'Team', 'ฉบับแรก'],
    ])
  })
})
