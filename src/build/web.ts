// build web: a static site per book and language from the same pages as the PDF/DOCX.
// dist/web/<book>/<lang>/{index,<page-id>,search}.html + search-index.js; shared assets/ (CSS, JS, fonts) and
// media/. Every URL is relative, so the folder works from any sub-path or straight from disk; --base only sets
// canonical URLs (and the web address PDF/DOCX link to). Nothing is fetched from other hosts at runtime.
// Layout: brand top bar (book switcher, live search, language, back link), sidebar (book, audience filter, page
// groups), reading column (breadcrumbs, title, summary, kind/audience chips, print, info card), "on this page" rail.
// Help center: faq.html per book and language gathers the common problems of every book in that language (search,
// book and symptom filters, #faq-N deep links); the home pages carry a FAQ link, common-task cards and a video gallery.
// Front page (index.html, primary language): hero with a search across the books (search.html, search-index.js), a card
// per book, FAQ banner, journey strip (config web.home), videos and a footer; parts without data are left out.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { audienceText, localize, type ManualConfig } from '../config.ts'
import { buildFrontMatter, type FrontMatter, type TableBlock } from '../front-matter.ts'
import { groupName, type Page } from '../pages.ts'
import { groupOf, isFor, type Project } from '../project.ts'
import { labelsFor, markdownToHtml, renderBook, type Heading, type RenderedBook } from '../render.ts'
import { imageSize } from '../media/size.ts'
import { clipsIn, firstShot, isProblemHeading, problemsIn, symptomType, SYMPTOM_TYPES, type ClipCard, type Problem, type SymptomType } from '../web/helpcenter.ts'
import { icon } from '../web/icons.ts'
import { methodCards } from '../web/methods.ts'
import { buildIndex, searchCoreScript, type SearchDoc } from '../web/search.ts'
import { brandCss, DEFAULT_BRAND } from '../web/brand.ts'
import { artSymbols, GUIDE_ART } from '../web/art.ts'
import { pageFile, webUrl } from '../web/urls.ts'
import { ASSETS } from './html.ts'
import { outputPath, type BuildTarget } from './pdf.ts'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const stripTags = (html: string) =>
  html
    .replace(/<figure[\s\S]*?<\/figure>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

const WORDS = {
  th: {
    skip: 'ข้ามไปที่เนื้อหา',
    search: 'ค้นหา',
    searchLabel: 'ค้นหาในคู่มือ',
    searchTitle: 'ผลการค้นหา',
    results: '{n} รายการ',
    noResults: 'ไม่พบหัวข้อที่ตรงกับคำค้น ลองใช้คำที่สั้นลงหรือคำอื่น',
    allResults: 'ดูผลการค้นหาทั้งหมด',
    noScript: 'การค้นหาต้องเปิดใช้ JavaScript ใช้สารบัญด้านข้างแทนได้',
    contents: 'สารบัญ',
    closeContents: 'ปิดสารบัญ',
    language: 'ภาษา',
    pager: 'หน้าก่อนหน้าและถัดไป',
    prev: 'ก่อนหน้า',
    next: 'ถัดไป',
    home: 'หน้าแรกของคู่มือ',
    downloads: 'ดาวน์โหลด',
    pdf: 'ไฟล์ PDF',
    docx: 'ไฟล์ Word (DOCX)',
    books: 'คู่มือเล่มอื่น',
    switchBook: 'เปลี่ยนเล่ม',
    goTo: 'ไปที่',
    reading: 'คุณกำลังอ่าน',
    iAm: 'ฉันเป็น…',
    allTasks: 'ดูทุกงาน',
    allTasksLede: 'ทุกหน้าของคู่มือ ไม่แยกตามบทบาท',
    pageCount: '{n} หน้า',
    for: 'สำหรับ:',
    print: 'พิมพ์หน้านี้',
    onThisPage: 'ในหน้านี้',
    crumbs: 'ตำแหน่งของหน้านี้',
    pageInfo: 'ข้อมูลของหน้านี้',
    allBooks: 'คู่มือทั้งหมด',
    pages: 'หน้า',
    close: 'ปิด',
    faq: 'ปัญหาที่พบบ่อย',
    faqLede: 'เจอปัญหาตอนใช้งาน พิมพ์สิ่งที่เห็นบนหน้าจอ หรือเลือกคู่มือและประเภทอาการ เพื่อดูสาเหตุและวิธีแก้',
    faqSearch: 'ค้นหาปัญหาที่พบบ่อย',
    faqPlaceholder: 'พิมพ์สิ่งที่เห็นบนหน้าจอ',
    faqBooks: 'กรองตามคู่มือ',
    faqAllBooks: 'ทุกคู่มือ',
    faqTypes: 'กรองตามอาการ',
    faqAllTypes: 'ทุกอาการ',
    faqCount: '{n} ปัญหา',
    faqNone: 'ไม่พบปัญหาที่ตรงกับเงื่อนไข ลองล้างตัวกรอง หรือใช้คำค้นที่สั้นลง',
    faqBanner: 'ไม่เห็นปุ่ม ขึ้นข้อความแจ้งเตือน หรือหาข้อมูลไม่เจอ ดูสาเหตุและวิธีแก้รวมไว้ที่เดียว',
    showFix: 'ดูวิธีแก้',
    hideFix: 'ซ่อนวิธีแก้',
    readFull: 'อ่านวิธีทำเต็ม:',
    cause: 'สาเหตุ',
    fix: 'วิธีแก้',
    tasks: 'งานที่ทำบ่อย ทีละขั้นพร้อมภาพ',
    videos: 'วิดีโอสาธิตการใช้งาน',
    readSteps: 'อ่านวิธีทำทีละขั้น',
    captions: 'คำบรรยาย',
    searchAll: 'ค้นหาทุกคู่มือ',
    heroSearch: 'พิมพ์สิ่งที่อยากทำ',
    homeLede: 'คู่มือ {n} เล่มสำหรับผู้ใช้แต่ละหน้าที่ อธิบายทีละขั้นพร้อมภาพหน้าจอ',
    tryHints: 'ลองค้น',
    example: 'เช่น',
    forWho: 'สำหรับ{who}',
    bookCounts: '{p} หน้า · {g} หมวด',
    openBook: 'เปิดคู่มือนี้',
    popular: 'หน้าที่เปิดบ่อย',
    journey: 'เส้นทางการทำงาน',
    journeyLede: 'งานเดินตามลำดับนี้ กดที่ขั้นที่กำลังทำอยู่เพื่ออ่านวิธีทำ',
    printed: 'ดาวน์โหลดคู่มือฉบับพิมพ์',
    contact: 'ติดต่อสอบถาม',
    kinds: { 'how-to': 'วิธีทำ', reference: 'ข้อมูลอ้างอิง', concept: 'แนวคิด' },
    groups: { concept: 'ภาพรวมและแนวคิด', 'how-to': 'วิธีใช้งาน', reference: 'ข้อมูลอ้างอิง' },
    updated: 'อัปเดตล่าสุด',
    theme: 'สลับโหมดสว่างและมืด',
    manual: 'คู่มือการใช้งาน',
    guides: 'เลือกคู่มือของคุณ',
    guidesLede: 'คู่มือแบ่งตามผู้ใช้ระบบ เลือกคู่มือที่ตรงกับงานของคุณ',
    guideCount: '{b} คู่มือ · {p} หน้า',
    forLabel: 'สำหรับ',
    content: 'เนื้อหา',
    clipsLabel: 'วิดีโอ',
    clipCount: '{n} คลิป',
    inGuide: 'ใน{book}',
    about: 'เกี่ยวกับคู่มือนี้',
    files: 'ไฟล์สำหรับพิมพ์หรือส่งต่อ',
    faqLead: '{n} ปัญหาพร้อมวิธีแก้',
  },
  en: {
    skip: 'Skip to content',
    search: 'Search',
    searchLabel: 'Search this manual',
    searchTitle: 'Search results',
    results: '{n} results',
    noResults: 'No section matches. Try a shorter or different word.',
    allResults: 'See all results',
    noScript: 'Search needs JavaScript. Use the contents instead.',
    contents: 'Contents',
    closeContents: 'Close the contents',
    language: 'Language',
    pager: 'Previous and next page',
    prev: 'Previous',
    next: 'Next',
    home: 'Manual home',
    downloads: 'Downloads',
    pdf: 'PDF file',
    docx: 'Word file (DOCX)',
    books: 'Other manuals',
    switchBook: 'Switch manual',
    goTo: 'Go to',
    reading: 'You are reading',
    iAm: 'I am a…',
    allTasks: 'See all tasks',
    allTasksLede: 'Every page, whatever your role',
    pageCount: '{n} pages',
    for: 'For:',
    print: 'Print this page',
    onThisPage: 'On this page',
    crumbs: 'Where this page is',
    pageInfo: 'About this page',
    allBooks: 'All manuals',
    pages: 'pages',
    close: 'Close',
    faq: 'Common problems',
    faqLede: 'Stuck? Type what you see on the screen, or pick a manual and a kind of problem, to see the cause and the fix.',
    faqSearch: 'Search common problems',
    faqPlaceholder: 'Type what you see on the screen',
    faqBooks: 'Filter by manual',
    faqAllBooks: 'All manuals',
    faqTypes: 'Filter by kind of problem',
    faqAllTypes: 'All kinds',
    faqCount: '{n} problems',
    faqNone: 'No problem matches. Clear a filter or try a shorter word.',
    faqBanner: 'A button is missing, a message came up, or something cannot be found: causes and fixes in one place.',
    showFix: 'Show the fix',
    hideFix: 'Hide the fix',
    readFull: 'Full how-to:',
    cause: 'Cause',
    fix: 'Fix',
    tasks: 'Common tasks, step by step with pictures',
    videos: 'Video walkthroughs',
    readSteps: 'Read the steps',
    captions: 'Captions',
    searchAll: 'Search all manuals',
    heroSearch: 'Type what you want to do',
    homeLede: '{n} manuals, one for each role, step by step with screenshots.',
    tryHints: 'Try',
    example: 'e.g.',
    forWho: 'For {who}',
    bookCounts: '{p} pages · {g} sections',
    openBook: 'Open this manual',
    popular: 'Frequently opened',
    journey: 'A typical flow',
    journeyLede: 'Work moves through these steps. Pick the one you are on to read how.',
    printed: 'Printable manuals',
    contact: 'Contact',
    kinds: { 'how-to': 'How-to', reference: 'Reference', concept: 'Concept' },
    groups: { concept: 'Overview', 'how-to': 'How-to guides', reference: 'Reference' },
    updated: 'Last updated',
    theme: 'Switch light and dark',
    manual: 'User manual',
    guides: 'Choose your guide',
    guidesLede: 'One guide for each kind of user. Pick the one that matches your work.',
    guideCount: '{b} guides · {p} pages',
    forLabel: 'For',
    content: 'Content',
    clipsLabel: 'Videos',
    clipCount: '{n} clips',
    inGuide: 'In {book}',
    about: 'About this manual',
    files: 'Files to print or send on',
    faqLead: '{n} problems with fixes',
  },
}
type Words = (typeof WORDS)['en']
const wordsFor = (lang: string): Words => (lang === 'th' ? WORDS.th : WORDS.en)
const LANG_NAMES: Record<string, string> = { th: 'ไทย', en: 'English', zh: '中文', ja: '日本語', lo: 'ລາວ', my: 'မြန်မာ', km: 'ខ្មែរ', vi: 'Tiếng Việt' }
const LANG_SHORT: Record<string, string> = { th: 'ไทย', en: 'EN' }
const langName = (l: string) => LANG_NAMES[l] ?? l
const KIND_ICON: Record<string, string> = { concept: 'bulb', 'how-to': 'list', reference: 'table' }

/** Folder of the site (dist/web). */
export const webDir = (project: Project) => join(project.manualDir, project.config.outputs.dir, 'web')

interface ChapterPage {
  id: string
  number: number
  title: string
  file: string
  html: string
  headings: Heading[]
  page: Page
  group: string
}

interface Group {
  id: string
  title: string
  icon: string
  chapters: ChapterPage[]
}

interface Download {
  kind: 'pdf' | 'docx'
  /** File name in the site's book/lang folder. */
  file: string
}

/** The PDF/DOCX of a role book (books.<id>.from) made from this site's book, copied next to the site's pages. */
interface RoleDownload extends Download {
  title: string
  /** The roles the role book is for. */
  audience: string[]
}

/** A card of the "I am a..." picker: a role the site's pages name, with the pages it sees and its role books. */
interface Role {
  id: string
  label: string
  description: string
  /** Pages shown for the role: those naming it and those for everyone. */
  count: number
  downloads: RoleDownload[]
}

interface BookSite {
  t: BuildTarget
  book: RenderedBook
  fm: FrontMatter
  chapters: ChapterPage[]
  groups: Group[]
  downloads: Download[]
  /** Every role book's files; `roles` lists them per role. */
  roleDownloads: RoleDownload[]
  /** The picker's roles: empty unless the pages name two or more audiences. */
  roles: Role[]
  clips: { clip: ClipCard; chapter: ChapterPage }[]
}

/** One card of a language's FAQ page; `n` numbers the cards across the books of the language (#faq-n). */
interface FaqCard {
  n: number
  site: BookSite
  chapter: ChapterPage
  problem: Problem
  type: SymptomType
}

export interface WebOptions {
  /** Where the site will be hosted (URL or path); canonical links. Default: config web.baseUrl. */
  base?: string
}

/**
 * Sidebar groups: front matter `group` (titles from config books.<id>.groups, then web.groups, else groupName), else the
 * page kind; in page order (renderBook already put the pages in the book's menu order).
 */
function groupsOf(chapters: ChapterPage[], config: ManualConfig, book: string, lang: string, primary: string): Group[] {
  const w = wordsFor(lang)
  const groups: Group[] = []
  for (const c of chapters) {
    let g = groups.find((x) => x.id === c.group)
    if (!g) {
      const conf = config.books[book]?.groups?.find((x) => x.id === c.group) ?? config.web.groups[c.group]
      const kind = c.group.startsWith('kind:') ? (c.group.slice(5) as keyof Words['groups']) : undefined
      g = {
        id: c.group,
        title: conf ? localize(conf.title, lang, primary) : kind ? w.groups[kind] : groupName(c.group),
        icon: conf?.icon ?? config.web.groups[c.group]?.icon ?? (kind ? (KIND_ICON[kind] ?? 'file') : 'folder'),
        chapters: [],
      }
      groups.push(g)
    }
    g.chapters.push(c)
  }
  return groups
}

const audLabel = (config: ManualConfig, value: string, lang: string, primary: string) => audienceText(config, value, lang, primary).label

/** The roles of a site's picker: web.audiences order first, then as the pages name them; none below two roles. */
function rolesOf(project: Project, t: BuildTarget, chapters: ChapterPage[], roleDownloads: RoleDownload[]): Role[] {
  const named = new Set(chapters.flatMap((c) => c.page.meta.audience))
  const ids = [...Object.keys(project.config.web.audiences).filter((a) => named.has(a)), ...named].filter((a, i, all) => all.indexOf(a) === i)
  if (ids.length < 2) return []
  return ids.map((id) => ({
    id,
    ...audienceText(project.config, id, t.lang, project.primary),
    count: chapters.filter((c) => isFor(c.page, [id])).length,
    downloads: roleDownloads.filter((d) => d.audience.includes(id)),
  }))
}

export async function buildWeb(project: Project, targets: BuildTarget[], opts: WebOptions = {}): Promise<string[]> {
  const out = webDir(project)
  const base = opts.base ?? project.config.web.baseUrl
  const written: string[] = []
  const media = new Set<string>()
  const roleBooks = Object.entries(project.config.books).flatMap(([id, b]) => (b.from ? [{ id, ...b.from, title: b.title }] : []))
  const printOnly = new Set(roleBooks.map((b) => b.id))
  const siteTargets = targets.filter((t) => !printOnly.has(t.book))
  if (!siteTargets.length && targets.length)
    throw new Error(`book "${targets[0]!.book}" is made from "${roleBooks.find((b) => b.id === targets[0]!.book)!.book}" (books.${targets[0]!.book}.from): it has PDF and DOCX only, its files are linked from that book's site`)
  const write = (rel: string, content: string) => {
    const file = join(out, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
    if (rel.endsWith('.html')) written.push(file)
  }

  // pages of every target first: navigation needs the other books and languages
  const sites: BookSite[] = siteTargets.map((t) => {
    const book = renderBook(project, { ...t, target: 'web' })
    const fm = buildFrontMatter(project, book)
    const ids = new Set(book.chapters.map((c) => c.id))
    const chapters = book.chapters.map((c): ChapterPage => {
      const { html, headings } = markdownToHtml(c.markdown, c.number)
      let body = html.replace(/href="#page-([^"]+)"/g, (m, anchor: string) => {
        const id = [...ids].find((i) => i.replace(/\./g, '_') === anchor)
        return id ? `href="${pageFile(id)}"` : m
      })
      body = body.replace(/<img src="(media\/[^"]+)"/g, (_, rel: string) => {
        const size = imageSize(join(project.manualDir, rel))
        return `<img src="${rel}"${size ? ` width="${size.width}" height="${size.height}"` : ''} loading="lazy" decoding="async"`
      })
      body = body.replace(/ (src|poster|data-poster)="(media\/[^"]+)"/g, (_, attr: string, rel: string) => {
        if (existsSync(join(project.manualDir, rel))) media.add(rel)
        return ` ${attr}="../../${rel}"`
      })
      body = body.replace(/<table>/g, '<div class="table-wrap" tabindex="0"><table>').replace(/<\/table>/g, '</table></div>')
      return { id: c.id, number: c.number, title: c.title, file: pageFile(c.id), html: body, headings, page: c.page, group: groupOf(c.page) }
    })
    /** The built PDF/DOCX of a book in this language, copied into this site's folder. */
    const filesOf = (book: string) =>
      (['pdf', 'docx'] as const).flatMap((kind) => {
        const src = outputPath(project, { book, lang: t.lang }, kind)
        if (!existsSync(src)) return []
        const file = `${book}.${t.lang}.${kind}`
        mkdirSync(join(out, t.book, t.lang), { recursive: true })
        copyFileSync(src, join(out, t.book, t.lang, file))
        return [{ kind, file }]
      })
    const downloads = filesOf(t.book)
    const roleDownloads = roleBooks
      .filter((b) => b.book === t.book)
      .flatMap((b) => filesOf(b.id).map((d) => ({ ...d, title: localize(b.title, t.lang, project.primary), audience: b.audience })))
    const groups = groupsOf(chapters, project.config, t.book, t.lang, project.primary)
    // pages in sidebar order, so previous / next follow what the reader sees
    const ordered = groups.flatMap((g) => g.chapters)
    const clips = ordered.flatMap((chapter) => clipsIn(chapter.html).map((clip) => ({ clip, chapter })))
    return { t, book, fm, chapters: ordered, groups, downloads, roleDownloads, roles: rolesOf(project, t, ordered, roleDownloads), clips }
  })

  // the FAQ of a language gathers the common problems of every book in it; a symptom repeated in a book shows once
  const faqs = new Map<string, FaqCard[]>()
  for (const site of sites) {
    const cards = faqs.get(site.t.lang) ?? []
    const seen = new Set<string>()
    for (const chapter of site.chapters)
      for (const problem of problemsIn(chapter.html, isProblemHeading(chapter.title))) {
        const key = stripTags(problem.symptom).toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        cards.push({ n: cards.length + 1, site, chapter, problem, type: symptomType(problem.symptom) })
      }
    faqs.set(site.t.lang, cards)
  }

  rmSync(join(out, 'assets'), { recursive: true, force: true })
  const brand = brandAssets(project, (rel, from) => {
    mkdirSync(dirname(join(out, rel)), { recursive: true })
    copyFileSync(from, join(out, rel))
  })
  for (const s of sites) {
    const ctx: Ctx = { project, sites, site: s, base, brand, faqs }
    write(join(s.t.book, s.t.lang, 'index.html'), homePage(ctx))
    s.chapters.forEach((c, i) => write(join(s.t.book, s.t.lang, c.file), chapterPage(ctx, c, s.chapters[i - 1], s.chapters[i + 1])))
    write(join(s.t.book, s.t.lang, 'search.html'), searchPage(ctx))
    if (faqs.get(s.t.lang)?.length) write(join(s.t.book, s.t.lang, 'faq.html'), faqPage(ctx))
    write(join(s.t.book, s.t.lang, 'search-index.js'), indexScript(searchDocs(project, s, faqs.get(s.t.lang) ?? [])))
  }
  /** Copies a file of the manual folder to assets/<name><ext>; undefined when the file is missing. */
  const asset = (from: string | undefined, name: string) => {
    if (!from || !existsSync(join(project.manualDir, from))) return undefined
    const rel = `assets/${name}${extname(from).toLowerCase()}`
    mkdirSync(dirname(join(out, rel)), { recursive: true })
    copyFileSync(join(project.manualDir, from), join(out, rel))
    return rel
  }
  const bookIcons = new Map<string, string>()
  for (const [id, b] of Object.entries(project.config.books)) {
    const rel = asset(b.icon, `book-${id}`)
    if (rel) bookIcons.set(id, rel)
  }
  const cover = project.config.document.coverImage
  const artFile = asset(cover, 'hero')
  const art = artFile ? { src: artFile, size: imageSize(join(project.manualDir, cover!)) } : undefined
  const root: Root = { project, sites, base, brand, faqs, bookIcons, art }
  write('index.html', rootPage(root))
  write('search.html', rootSearchPage(root))
  write('search-index.js', indexScript(primarySites(root).flatMap((s) => searchDocs(project, s, faqs.get(s.t.lang) ?? []).map((d) => ({ ...d, u: `${s.t.book}/${s.t.lang}/${d.u}`, c: `${s.book.title} · ${d.c}` })))))

  // assets: CSS, JS, search core, fonts; media referenced by the pages
  const assets = new URL('web/', ASSETS)
  for (const f of ['site.css', 'site.js']) write(join('assets', f), readFileSync(new URL(f, assets), 'utf8'))
  write('assets/brand.css', brand.css)
  write('assets/search-core.js', searchCoreScript())
  for (const f of ['IBMPlexSansThai-Regular.ttf', 'IBMPlexSansThai-SemiBold.ttf', 'IBMPlexSansThai-Bold.ttf', 'OFL-IBMPlexSansThai.txt']) {
    mkdirSync(join(out, 'assets/fonts'), { recursive: true })
    copyFileSync(new URL(`fonts/${f}`, ASSETS), join(out, 'assets/fonts', f))
  }
  rmSync(join(out, 'media'), { recursive: true, force: true })
  for (const rel of [...media].sort()) {
    mkdirSync(dirname(join(out, rel)), { recursive: true })
    copyFileSync(join(project.manualDir, rel), join(out, rel))
  }
  return written
}

interface Brand {
  /** Logo path relative to the site root, or undefined. */
  logo?: string
  /** assets/brand.css: the brand tokens of the configured (or default) colours, and the configured font. */
  css: string
  /** The logo sits on a white plate (web.brand.logoPlate). */
  plate: boolean
}

/** Copies the logo and font files into assets/ and returns assets/brand.css for the configured brand. */
function brandAssets(project: Project, copy: (rel: string, from: string) => void): Brand {
  const b = project.config.web.brand
  const out: Brand = { css: '', plate: b.logoPlate }
  if (b.logo) {
    const from = join(project.manualDir, b.logo)
    if (!existsSync(from)) throw new Error(`web.brand.logo: ${b.logo} not found in the manual folder`)
    out.logo = `assets/brand-logo${extname(b.logo).toLowerCase()}`
    copy(out.logo, from)
  }
  const c = b.colors
  const parts = [brandCss({ brand: c.brand ?? DEFAULT_BRAND.brand, accent: c.accent ?? DEFAULT_BRAND.accent, brandInk: c.brandInk, link: c.link })]
  if (b.font) {
    const family = b.font.family.replace(/['"\\;{}]/g, '')
    for (const [weight, rel] of [['400', b.font.files.regular], ['600 800', b.font.files.bold]] as const) {
      if (!rel) continue
      const from = join(project.manualDir, rel)
      if (!existsSync(from)) throw new Error(`web.brand.font: ${rel} not found in the manual folder`)
      const name = `brand-${weight.split(' ')[0]}${extname(rel).toLowerCase()}`
      copy(`assets/fonts/${name}`, from)
      parts.push(`@font-face { font-family: '${family}'; src: url('fonts/${name}'); font-weight: ${weight}; font-display: swap; }`)
    }
    parts.push(`:root { --font: '${family}', 'IBM Plex Sans Thai', 'Noto Sans Thai', Tahoma, system-ui, sans-serif; }`)
  }
  out.css = `${parts.join('\n')}\n`
  return out
}

/** The light / dark switch (site.js); hidden without JS, where the system setting decides. */
const themeButton = (w: Words) => `<button type="button" class="top-btn top-btn--ghost theme-toggle" aria-label="${esc(w.theme)}" title="${esc(w.theme)}">${icon('moon')}</button>`

const indexScript = (docs: SearchDoc[]) => `window.ManualKitIndex = ${JSON.stringify(buildIndex(docs))};\n`

/** Sections of the book for search: each chapter's lead, each h2 section, and the book's FAQ cards. */
function searchDocs(project: Project, s: BookSite, faqs: FaqCard[]): SearchDoc[] {
  const docs: SearchDoc[] = []
  const rolesOfPage = (c: ChapterPage) => {
    const r = audiencesOf(c).map((a) => audLabel(project.config, a, s.t.lang, project.primary))
    return r.length ? { r } : {}
  }
  for (const c of s.chapters) {
    const parts = c.html.split(/(?=<h2 id=")/)
    parts.forEach((part, i) => {
      const id = i === 0 ? '' : (/<h2 id="([^"]+)"/.exec(part)?.[1] ?? '')
      const heading = id ? stripTags(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(part)?.[1] ?? '') : c.title
      const text = stripTags(id ? part.replace(/<h2[^>]*>[\s\S]*?<\/h2>/, '') : part)
      if (!text && id === '') return
      docs.push({ u: id ? `${c.file}#${id}` : c.file, t: heading, c: c.title, x: text, ...rolesOfPage(c) })
    })
  }
  const w = wordsFor(s.t.lang)
  for (const f of faqs.filter((f) => f.site === s))
    docs.push({ u: `faq.html#faq-${f.n}`, t: stripTags(f.problem.symptom), c: w.faq, x: stripTags(`${f.problem.cause ?? ''} ${f.problem.fix}`), ...rolesOfPage(f.chapter) })
  return docs
}

interface Ctx {
  project: Project
  sites: BookSite[]
  site: BookSite
  base: string | undefined
  brand: Brand
  faqs: Map<string, FaqCard[]>
}

/** A file of `to` as linked from a page of `from` (both are book/lang folders, one level apart from each other). */
const fileOf = (from: BookSite, to: BookSite, file: string) => (from === to ? file : `../../${to.t.book}/${to.t.lang}/${file}`)

/** The setup words site.js reads (dialogs, live search, FAQ, video gallery). */
const scriptWords = (w: Words) =>
  `window.ManualKitWords=${JSON.stringify({ results: w.results, none: w.noResults, all: w.allResults, close: w.close, prev: w.prev, next: w.next, showFix: w.showFix, hideFix: w.hideFix, readSteps: w.readSteps, captions: w.captions }).replace(/</g, '\\u003c')}`

/** Video gallery: a card per clip; the thumbnail plays it in a dialog, the title opens its page. */
function gallery(clips: { clip: ClipCard; href: string; page: string }[], lang: string, id: string, rebase: (url: string) => string, readLink = false): string {
  const w = wordsFor(lang)
  const play = labelsFor(lang).play
  const cards = clips
    .map(
      ({ clip: c, href, page }) =>
        `<li class="vcard"><button type="button" class="vthumb" data-video="${esc(rebase(c.video))}" data-vtt="${esc(rebase(c.vtt))}" data-title="${esc(c.title)}" data-href="${esc(href)}" aria-label="${esc(play)}: ${esc(c.title)}"><img src="${esc(rebase(c.thumb))}" alt="" loading="lazy" decoding="async"><span class="play">${icon('play')}</span>${c.len ? `<span class="len">${esc(c.len)}</span>` : ''}</button><a class="vtitle" href="${esc(href)}">${esc(c.title)}</a><small>${esc(page)}${readLink ? ` · <a href="${esc(href)}">${esc(w.readSteps)}</a>` : ''}</small></li>`,
    )
    .join('')
  return `<section class="videos" aria-labelledby="${id}"><div class="sec-h"><h2 id="${id}">${esc(w.videos)}</h2></div><ul class="vgrid">${cards}</ul></section>`
}

/** Link to the FAQ page with its count. */
const faqBanner = (href: string, count: number, w: Words) =>
  `<a class="faq-banner" href="${esc(href)}"><span class="fb-count">${count}</span><span class="fb-text"><strong>${esc(w.faqLead.replace('{n}', String(count)))}</strong><span>${esc(w.faqBanner)}</span></span>${icon('arrow')}</a>`

/** A table with its title as caption; `hideCaption` when a heading right above already says the same. */
function table(t: TableBlock, hideCaption = false): string {
  return `<div class="table-wrap" tabindex="0"><table><caption${hideCaption ? ' class="visually-hidden"' : ''}>${esc(t.title)}</caption><thead><tr>${t.header.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows
    .map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`)
    .join('')}</tbody></table></div>`
}

const audiencesOf = (c: ChapterPage) => c.page.meta.audience

function sidebar(ctx: Ctx, current: ChapterPage | undefined, isHome: boolean): string {
  const { site: s, sites, project } = ctx
  const { lang, book } = s.t
  const w = wordsFor(lang)
  const others = sites.filter((x) => x.t.lang === lang && x.t.book !== book)
  const switches = others
    .map((x) => `<a class="switch" href="../../${esc(x.t.book)}/${esc(lang)}/index.html">${icon('book')}<span>${esc(w.goTo)} ${esc(x.book.title)}</span>${icon('arrow')}</a>`)
    .join('')
  // the current role: the pressed chip; another chip changes it, "see all tasks" clears it
  const chips = s.roles.length
    ? `<div class="aud" data-book="${esc(book)}"><span class="aud-label" id="aud-label">${esc(w.iAm)}</span><div class="chips" role="group" aria-labelledby="aud-label"><button type="button" class="chip" data-aud="" aria-pressed="true">${esc(w.allTasks)} <small>${s.chapters.length}</small></button>${s.roles
        .map((r) => `<button type="button" class="chip" data-aud="${esc(r.id)}" aria-pressed="false">${esc(r.label)} <small>${r.count}</small></button>`)
        .join('')}</div></div>`
    : ''
  const many = s.chapters.length > 12
  const groups = s.groups
    .map((g) => {
      const open = !many || isHome || g.chapters.some((c) => c.id === current?.id)
      const items = g.chapters
        .map((c) => `<li data-aud="${esc(audiencesOf(c).join('|'))}"><a href="${esc(c.file)}"${current?.id === c.id ? ' aria-current="page"' : ''}>${esc(c.title)}</a></li>`)
        .join('')
      return `<details class="group"${open ? ' open' : ''}><summary>${icon(g.icon)}<span>${esc(g.title)}</span><small>${g.chapters.length}</small></summary><ul>${items}</ul></details>`
    })
    .join('')
  // a role book's files show once its role is picked (site.js); without a role, the whole book's
  const roleFiles = s.roles.length ? s.roleDownloads : []
  const downloads =
    s.downloads.length || roleFiles.length
      ? `<div class="side-downloads"><p>${esc(w.downloads)}</p><ul>${s.downloads.map((d) => `<li><a href="${esc(d.file)}" download>${icon('download')}${esc(d.kind === 'pdf' ? w.pdf : w.docx)}</a></li>`).join('')}${roleFiles
          .map((d) => `<li data-for="${esc(d.audience.join('|'))}"><a href="${esc(d.file)}" download>${icon('download')}${esc(d.title)} (${d.kind.toUpperCase()})</a></li>`)
          .join('')}</ul></div>`
      : ''
  return `<nav id="site-nav" class="side" aria-label="${esc(w.contents)}">
<button type="button" class="top-btn side-close" aria-label="${esc(w.closeContents)}">${icon('close')}</button>
<a class="reading" href="index.html"${isHome ? ' aria-current="page"' : ''}>${icon('book')}<span><small>${esc(w.reading)}</small><strong>${esc(s.book.title)}</strong></span></a>
${switches}
${chips}
${groups}
${downloads}
</nav>`
}

function layout(ctx: Ctx, o: { file: string; title: string; main: string; current?: ChapterPage; home?: boolean; solo?: boolean }): string {
  const { site: s, sites, project } = ctx
  const { lang, book } = s.t
  const w = wordsFor(lang)
  const twin = (l: string) => {
    const other = sites.find((x) => x.t.book === book && x.t.lang === l)
    if (!other) return null
    const has = o.current ? other.chapters.some((c) => c.id === o.current!.id) : o.file !== 'faq.html' || !!ctx.faqs.get(l)?.length
    return `../${l}/${has ? o.file : 'index.html'}`
  }
  const langs = sites.filter((x) => x.t.book === book).map((x) => x.t.lang)
  const langNav =
    langs.length > 1
      ? `<nav class="lang" aria-label="${esc(w.language)}"><ul>${langs
          .map((l) =>
            l === lang
              ? `<li><a class="top-btn top-btn--ghost" href="${esc(o.file)}" lang="${esc(l)}" aria-current="true">${esc(langName(l))}</a></li>`
              : `<li><a class="top-btn top-btn--ghost" href="${esc(twin(l)!)}" lang="${esc(l)}" hreflang="${esc(l)}" title="${esc(langName(l))}">${icon('globe')}<span>${esc(LANG_SHORT[l] ?? l.toUpperCase())}</span></a></li>`,
          )
          .join('')}</ul></nav>`
      : ''
  const alternates = langs
    .filter((l) => l !== lang)
    .map((l) => `<link rel="alternate" hreflang="${esc(l)}" href="${esc(twin(l)!)}">`)
    .join('\n')
  const canonical = webUrl(ctx.base, book, lang, o.file)
  const cfg = project.config
  const brandName = cfg.web.brand.name ? localize(cfg.web.brand.name, lang, project.primary) : s.fm.documentTitle
  const otherBooks = sites.filter((x) => x.t.lang === lang && x.t.book !== book)
  const pill = otherBooks.length
    ? `<details class="book-pill"><summary aria-label="${esc(w.switchBook)}: ${esc(s.book.title)}">${icon('book')}<span>${esc(s.book.title)}</span>${icon('down')}</summary><ul>${[s, ...otherBooks]
        .map((x) => `<li><a href="../../${esc(x.t.book)}/${esc(lang)}/index.html"${x === s ? ' aria-current="true"' : ''}>${esc(x.book.title)}</a></li>`)
        .join('')}</ul></details>`
    : `<div class="book-pill"><span>${icon('book')}${esc(s.book.title)}</span></div>`
  const back = cfg.web.backLink
    ? `<a class="top-btn back" href="${esc(cfg.web.backLink.url)}" title="${esc(localize(cfg.web.backLink.label, lang, project.primary))}">${icon('back')}<span class="back-label">${esc(localize(cfg.web.backLink.label, lang, project.primary))}</span></a>`
    : ''
  const d = cfg.document
  // a web page shows when it was last updated, not the document control of the PDF (DESIGN.md)
  const meta = d.date ? `${w.updated} ${d.date}` : ''
  const faq = ctx.faqs.get(lang)?.length
    ? `<a class="top-btn top-btn--ghost top-faq" href="faq.html"${o.file === 'faq.html' ? ' aria-current="page"' : ''}>${icon('help')}<span class="faq-label">${esc(w.faq)}</span></a>`
    : ''

  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(o.title)}</title>
<link rel="stylesheet" href="../../assets/site.css">
<link rel="stylesheet" href="../../assets/brand.css">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ''}${alternates}
<script>document.documentElement.classList.add('js');try{var t=localStorage.getItem('mk-theme');if(t)document.documentElement.dataset.theme=t}catch(e){};${scriptWords(w)}</script>
<script src="../../assets/search-core.js" defer></script>
<script src="search-index.js" defer></script>
<script src="../../assets/site.js" defer></script>
</head>
<body>
<a class="skip-link" href="#content">${esc(w.skip)}</a>
<header class="top">
${o.solo ? '' : `<button type="button" class="top-btn top-btn--ghost nav-toggle" aria-expanded="false" aria-controls="site-nav">${icon('menu')}<span class="visually-hidden">${esc(w.contents)}</span></button>`}
<a class="brand" href="index.html">${ctx.brand.logo ? `<img src="../../${esc(ctx.brand.logo)}" alt=""${ctx.brand.plate ? ' class="plate"' : ''}>` : `<span class="logo-mark" aria-hidden="true">${esc([...brandName.trim()][0] ?? '')}</span>`}<span>${esc(brandName)}</span></a>
${pill}
<form class="search" role="search" action="search.html" method="get">
${icon('search')}<label for="q" class="visually-hidden">${esc(w.searchLabel)}</label>
<input type="search" id="q" name="q" placeholder="${esc(w.searchLabel)}" autocomplete="off" enterkeyhint="search" aria-keyshortcuts="Control+K Meta+K /" aria-controls="search-pop">
<kbd class="kbd" aria-hidden="true">⌘K</kbd>
<div id="search-pop" class="pop" hidden></div>
</form>
<div class="top-right">
<button type="button" class="top-btn top-btn--ghost search-open" aria-label="${esc(w.search)}">${icon('search')}</button>
${faq}
${langNav}
${themeButton(w)}
${back}
</div>
</header>
<div class="scrim" hidden></div>
<div class="layout${o.solo ? ' layout--solo' : ''}">
${o.solo ? '' : sidebar(ctx, o.current, !!o.home)}
<main id="content" tabindex="-1">
${o.main}
</main>
</div>
<footer class="site-footer">
<p>${esc(s.fm.documentTitle)} — ${esc(s.book.title)}${meta ? ` · ${esc(meta)}` : ''}</p>
<p><a href="../../index.html">${esc(w.allBooks)}</a></p>
</footer>
</body>
</html>
`
}

/**
 * The "I am a..." picker: a card per role (label, description, page count, its role books' files) and a "see all tasks"
 * card. Picking a card stores the role for the book (site.js) and opens the book's home, `href` relative to the page.
 */
function rolePicker(s: BookSite, href: (file: string) => string, headingId: string, heading: string): string {
  const w = wordsFor(s.t.lang)
  const files = (list: (Download & { title?: string })[]) =>
    list.length
      ? `<ul class="rdl">${list.map((d) => `<li><a href="${esc(href(d.file))}" download>${icon('download')}<span>${esc(d.title ?? s.book.title)}</span><small>${d.kind.toUpperCase()}</small></a></li>`).join('')}</ul>`
      : ''
  const card = (aud: string, label: string, description: string, count: number, list: (Download & { title?: string })[]) =>
    `<li class="rcard${aud ? '' : ' rcard--all'}" data-role="${esc(aud)}"><a class="rpick" href="${esc(href('index.html'))}" data-book="${esc(s.t.book)}" data-aud="${esc(aud)}"><span class="rcard-head">${icon(aud ? 'user' : 'list')}<strong>${esc(label)}</strong></span><small>${esc(w.pageCount.replace('{n}', String(count)))}</small></a>${description ? `<p>${esc(description)}</p>` : ''}${files(list)}</li>`
  return `<section class="roles" aria-labelledby="${headingId}"><h2 id="${headingId}">${esc(heading)}</h2><ul class="rgrid">${s.roles
    .map((r) => card(r.id, r.label, r.description, r.count, r.downloads))
    .join('')}${card('', w.allTasks, w.allTasksLede, s.chapters.length, s.downloads)}</ul></section>`
}

function homePage(ctx: Ctx): string {
  const s = ctx.site
  const w = wordsFor(s.t.lang)
  const fm = s.fm
  const parts: string[] = []
  if (s.roles.length) parts.push(rolePicker(s, (f) => f, 'roles-h', w.iAm))
  const faqCount = ctx.faqs.get(s.t.lang)?.length ?? 0
  if (faqCount) parts.push(faqBanner('faq.html', faqCount, w))
  const tasks = s.chapters.filter((c) => c.page.meta.kind === 'how-to')
  if (tasks.length)
    parts.push(
      `<section aria-labelledby="tasks-h"><h2 id="tasks-h">${esc(w.tasks)}</h2><ul class="tgrid">${tasks
        .map((c) => {
          const shot = firstShot(c.html)
          return `<li data-aud="${esc(audiencesOf(c).join('|'))}"><a class="tcard" href="${esc(c.file)}"><span class="tthumb">${shot ? `<img src="${esc(shot)}" alt="" loading="lazy" decoding="async">` : icon('list')}</span><span class="tbody"><strong>${esc(c.title)}</strong>${c.page.meta.summary ? `<small>${esc(c.page.meta.summary)}</small>` : ''}</span></a></li>`
        })
        .join('')}</ul></section>`,
    )
  if (s.clips.length) parts.push(gallery(s.clips.map(({ clip, chapter }) => ({ clip, href: chapter.file, page: chapter.title })), s.t.lang, 'videos-h', (u) => u))
  for (const g of s.groups)
    parts.push(
      `<section aria-labelledby="g-${esc(g.id.replace(/[^\w-]/g, '_'))}"><h2 id="g-${esc(g.id.replace(/[^\w-]/g, '_'))}">${esc(g.title)}</h2><ul class="cards">${g.chapters
        .map((c) => `<li data-aud="${esc(audiencesOf(c).join('|'))}"><a href="${esc(c.file)}"><strong>${esc(c.title)}</strong>${c.page.meta.summary ? `<small>${esc(c.page.meta.summary)}</small>` : ''}</a></li>`)
        .join('')}</ul></section>`,
    )
  if (s.downloads.length)
    parts.push(
      `<section aria-labelledby="dl-h"><h2 id="dl-h">${esc(w.downloads)}</h2><ul class="downloads">${s.downloads
        .map((d) => `<li><a class="btn" href="${esc(d.file)}" download>${icon('download')}${esc(d.kind === 'pdf' ? w.pdf : w.docx)}</a></li>`)
        .join('')}</ul></section>`,
    )
  if (fm.intro) {
    parts.push(
      `<section aria-labelledby="intro-h"><h2 id="intro-h">${esc(fm.intro.title)}</h2>${fm.intro.parts
        .map((p) => `<h3>${esc(p.title)}</h3>${markdownToHtml(p.text, 0).html}`)
        .join('')}${fm.intro.glossary ? table(fm.intro.glossary) : ''}</section>`,
    )
  }
  // no document control or revision table on the web (DESIGN.md): the PDF and DOCX carry them
  if (fm.appendix)
    parts.push(`<section aria-labelledby="app-h"><h2 id="app-h">${esc(fm.appendix.title)}</h2>${fm.appendix.parts.map((p) => `<h3>${esc(p.title)}</h3>${markdownToHtml(p.text, 0).html}`).join('')}</section>`)
  const crumbs = `<nav class="crumbs" aria-label="${esc(w.crumbs)}"><ol><li><a href="../../index.html">${esc(fm.documentTitle)}</a></li><li><a href="index.html" aria-current="page">${esc(s.book.title)}</a></li></ol></nav>`
  const head = pageHead(ctx, { crumbs, title: s.book.title, summary: fm.cover?.subtitle })
  return layout(ctx, { file: 'index.html', title: `${s.book.title} — ${fm.documentTitle}`, main: `<div class="page page--wide"><article class="home sheet">${head}<div class="sheet-body">${parts.join('\n')}</div></article></div>`, home: true })
}

function tocList(headings: Heading[]): string {
  return `<ol>${headings.map((h) => `<li class="l${h.level}"><a href="#${h.id}">${esc(stripTags(h.text))}</a></li>`).join('')}</ol>`
}

/** The coloured page head: breadcrumbs, page kind, title, summary, and the "last updated" line with print. */
function pageHead(ctx: Ctx, o: { crumbs: string; kind?: string; title: string; summary?: string; print?: boolean; extra?: string }): string {
  const w = wordsFor(ctx.site.t.lang)
  const date = ctx.project.config.document.date
  const control = date || o.print
    ? `<div class="control">${date ? `<span>${esc(w.updated)} <b>${esc(date)}</b></span>` : ''}${o.print ? `<button type="button" class="btn print" data-print hidden>${icon('print')}${esc(w.print)}</button>` : ''}</div>`
    : ''
  return `<header class="head">${o.crumbs}${o.kind ? `<span class="kind">${esc(o.kind)}</span>` : ''}<h1>${esc(o.title)}</h1>${o.summary ? `<p class="summary">${esc(o.summary)}</p>` : ''}${o.extra ?? ''}${control}</header>`
}

function chapterPage(ctx: Ctx, c: ChapterPage, prev: ChapterPage | undefined, next: ChapterPage | undefined): string {
  const s = ctx.site
  const { project } = ctx
  const lang = s.t.lang
  const w = wordsFor(lang)
  const meta = c.page.meta
  const group = s.groups.find((g) => g.id === c.group)
  const crumbs = `<nav class="crumbs" aria-label="${esc(w.crumbs)}"><ol><li><a href="index.html">${esc(s.book.title)}</a></li>${group ? `<li>${esc(group.title)}</li>` : ''}<li><a href="${esc(c.file)}" aria-current="page">${esc(c.title)}</a></li></ol></nav>`
  // task facts: who it is for, then the page's info (menu, time, permission ...) as one ruled strip
  const facts = [
    ...(meta.audience.length ? [[w.forLabel, meta.audience.map((a) => audLabel(project.config, a, lang, project.primary)).join(' '), 'who'] as const] : []),
    ...Object.entries(meta.info ?? {}).map(([k, v]) => [k, v, ''] as const),
  ]
  const factStrip = facts.length
    ? `<dl class="facts" aria-label="${esc(w.pageInfo)}">${facts.map(([k, v, cls]) => `<div><dt>${esc(k)}</dt><dd${cls ? ` class="${cls}"` : ''}>${esc(v)}</dd></div>`).join('')}</dl>`
    : ''
  const toc = c.headings.length >= 2
  const pager =
    prev || next
      ? `<nav class="pager" aria-label="${esc(w.pager)}">${prev ? `<a rel="prev" href="${esc(prev.file)}"><small>${esc(w.prev)}</small><strong>${esc(prev.title)}</strong></a>` : ''}${
          next ? `<a rel="next" href="${esc(next.file)}"><small>${esc(w.next)}</small><strong>${esc(next.title)}</strong></a>` : ''
        }</nav>`
      : ''
  const main = `<div class="page${toc ? '' : ' page--wide'}">
<article class="chapter sheet" data-page="${esc(c.id)}">
${pageHead(ctx, { crumbs, kind: w.kinds[meta.kind], title: c.title, summary: meta.summary, print: true })}
<div class="sheet-body">
${factStrip}
${toc ? `<details class="toc-inline"><summary>${esc(w.onThisPage)}</summary>${tocList(c.headings)}</details>` : ''}
<div class="body">
${meta.kind === 'how-to' ? methodCards(c.html, lang) : c.html}
</div>
${pager}
</div>
</article>
${toc ? `<aside class="toc" aria-label="${esc(w.onThisPage)}"><p>${esc(w.onThisPage)}</p>${tocList(c.headings)}</aside>` : ''}
</div>`
  return layout(ctx, { file: c.file, title: `${c.title} — ${s.book.title} — ${s.fm.documentTitle}`, main, current: c })
}

function faqPage(ctx: Ctx): string {
  const s = ctx.site
  const { lang } = s.t
  const w = wordsFor(lang)
  const cards = ctx.faqs.get(lang) ?? []
  const typeLabel = (id: SymptomType) => SYMPTOM_TYPES.find((t) => t.id === id)!.label[lang === 'th' ? 'th' : 'en']
  const books = ctx.sites.filter((x) => x.t.lang === lang && cards.some((f) => f.site === x))
  const rebase = (from: BookSite, html: string) =>
    from === s ? html : html.replace(/href="(?![a-z][a-z0-9+.-]*:|#|\.\.\/|\/)([^"]+)"/gi, `href="../../${from.t.book}/${lang}/$1"`)
  const items = cards
    .map((f) => {
      const p = f.problem
      const answer = p.cause ? `<p><strong>${esc(w.cause)}</strong> ${p.cause}</p><p><strong>${esc(w.fix)}</strong> ${p.fix}</p>` : `<p>${p.fix}</p>`
      const src = fileOf(s, f.site, `${f.chapter.file}${p.anchor ? `#${p.anchor}` : ''}`)
      return `<li class="faq-card" id="faq-${f.n}" data-book="${esc(f.site.t.book)}" data-type="${f.type}"><p class="faq-tags"><span class="tag">${esc(f.site.book.title)}</span><span class="tag faq-type faq-type--${f.type}">${esc(typeLabel(f.type))}</span></p><h2 class="faq-q">${rebase(f.site, p.symptom)}</h2><button type="button" class="faq-toggle" aria-expanded="false" aria-controls="faq-${f.n}-a"><span>${esc(w.showFix)}</span>${icon('down')}</button><div class="faq-a" id="faq-${f.n}-a">${rebase(f.site, answer)}<a class="faq-src" href="${esc(src)}">${esc(w.readFull)} ${esc(f.chapter.title)}${icon('arrow')}</a></div></li>`
    })
    .join('')
  const count = (pred: (f: FaqCard) => boolean) => cards.filter(pred).length
  const bookButtons = [
    `<button type="button" class="faq-book" data-book="" aria-pressed="true"><span>${esc(w.faqAllBooks)}</span><small>${cards.length}</small></button>`,
    ...books.map((b) => `<button type="button" class="faq-book" data-book="${esc(b.t.book)}" aria-pressed="false">${icon('book')}<span>${esc(b.book.title)}</span><small>${count((f) => f.site === b)}</small></button>`),
  ].join('')
  const typeChips = [
    `<button type="button" class="chip" data-type="" aria-pressed="true">${esc(w.faqAllTypes)}</button>`,
    ...SYMPTOM_TYPES.filter((t) => count((f) => f.type === t.id)).map(
      (t) => `<button type="button" class="chip" data-type="${t.id}" aria-pressed="false">${esc(typeLabel(t.id))} <small>${count((f) => f.type === t.id)}</small></button>`,
    ),
  ].join('')
  const crumbs = `<nav class="crumbs" aria-label="${esc(w.crumbs)}"><ol><li><a href="../../index.html">${esc(s.fm.documentTitle)}</a></li><li><a href="faq.html" aria-current="page">${esc(w.faq)}</a></li></ol></nav>`
  const search = `<div class="faq-search">${icon('search')}<label for="faq-q" class="visually-hidden">${esc(w.faqSearch)}</label><input type="search" id="faq-q" placeholder="${esc(w.faqPlaceholder)}" autocomplete="off"></div>`
  const main = `<div class="faq"><div class="sheet">
${pageHead(ctx, { crumbs, title: w.faq, summary: w.faqLede, extra: search })}
<div class="sheet-body">
<div class="faq-body">
<div class="faq-books" role="group" aria-label="${esc(w.faqBooks)}">${bookButtons}</div>
<div class="faq-main">
<div class="chips faq-types" role="group" aria-label="${esc(w.faqTypes)}">${typeChips}</div>
<p class="faq-count" role="status" data-count="${esc(w.faqCount)}">${esc(w.faqCount.replace('{n}', String(cards.length)))}</p>
<ul class="faq-grid">${items}</ul>
<p class="faq-empty" hidden>${esc(w.faqNone)}</p>
</div>
</div>
</div>
</div></div>`
  return layout(ctx, { file: 'faq.html', title: `${w.faq} — ${s.fm.documentTitle}`, main, solo: true })
}

function searchPage(ctx: Ctx): string {
  const s = ctx.site
  const w = wordsFor(s.t.lang)
  const main = `<div class="page page--wide"><article class="search-page sheet"><div class="sheet-body"><h1>${esc(w.searchTitle)}</h1>
<p id="search-status" role="status" data-results="${esc(w.results)}" data-none="${esc(w.noResults)}"></p>
<ol id="search-results" class="search-results"></ol>
<noscript><p>${esc(w.noScript)}</p></noscript>
</div></article></div>`
  return layout(ctx, { file: 'search.html', title: `${w.searchTitle} — ${s.book.title}`, main })
}

interface Root {
  project: Project
  /** Every book and language; the front page shows the primary language. */
  sites: BookSite[]
  base: string | undefined
  brand: Brand
  faqs: Map<string, FaqCard[]>
  bookIcons: Map<string, string>
  /** document.coverImage copied into assets/, the hero illustration. */
  art?: { src: string; size: { width: number; height: number } | null }
}

/** The books of the primary language, in the order of config books (books not listed there last). */
const primarySites = (r: Root) => {
  const order = Object.keys(r.project.config.books)
  const rank = (s: BookSite) => (order.includes(s.t.book) ? order.indexOf(s.t.book) : order.length)
  return r.sites.filter((s) => s.t.lang === r.project.primary).sort((a, b) => rank(a) - rank(b))
}

/** A search placeholder with the first hints of web.home.hints as examples. */
const withHints = (r: Root, text: string) => {
  const { primary, config } = r.project
  const hints = config.web.home.hints.map((h) => localize(h, primary, primary)).filter(Boolean).slice(0, 3)
  return hints.length ? `${text} ${wordsFor(primary).example} ${hints.join(' ')}` : text
}

/** The root shell: top bar (brand, search across the books, FAQ, back link), `main`, the footer. */
function rootShell(r: Root, o: { file: string; title: string; main: string; topSearch?: boolean; art?: boolean }): string {
  const { project, brand } = r
  const { primary, config } = project
  const w = wordsFor(primary)
  const loc = (v: Parameters<typeof localize>[0]) => localize(v, primary, primary)
  const d = config.document
  const title = loc(d.title)
  const brandName = config.web.brand.name ? loc(config.web.brand.name) : title
  const faqList = r.faqs.get(primary) ?? []
  const faqHref = faqList.length ? `${faqList[0]!.site.t.book}/${primary}/faq.html` : ''
  const back = config.web.backLink
    ? `<a class="top-btn back" href="${esc(config.web.backLink.url)}" title="${esc(loc(config.web.backLink.label))}">${icon('back')}<span class="back-label">${esc(loc(config.web.backLink.label))}</span></a>`
    : ''
  const canonical = r.base ? `${r.base.replace(/\/?$/, '/')}${o.file}` : ''
  const books = primarySites(r)
  const org = [loc(d.client), loc(d.developer)].filter(Boolean).join(' · ')
  const pdfs = books.flatMap((s) =>
    [...s.downloads.map((x) => ({ ...x, title: s.book.title })), ...s.roleDownloads]
      .filter((x) => x.kind === 'pdf')
      .map((x) => `<li><a href="${esc(s.t.book)}/${esc(s.t.lang)}/${esc(x.file)}" download>${icon('download')}${esc(x.title)}</a></li>`),
  )
  const contact = loc(d.contact)
  const foot = [
    `<div><strong>${esc(w.about)}</strong><p>${esc(title)}${org ? ` · ${esc(org)}` : ''}</p>${d.date ? `<p>${esc(w.updated)} ${esc(d.date)}</p>` : ''}${contact ? `<p>${esc(w.contact)}: ${esc(contact)}</p>` : ''}</div>`,
    pdfs.length ? `<div><strong>${esc(w.files)}</strong><ul>${pdfs.join('')}</ul></div>` : '',
  ].join('')
  return `<!doctype html>
<html lang="${esc(primary)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(o.title)}</title>
<link rel="stylesheet" href="assets/site.css">
<link rel="stylesheet" href="assets/brand.css">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ''}<script>document.documentElement.classList.add('js');try{var t=localStorage.getItem('mk-theme');if(t)document.documentElement.dataset.theme=t}catch(e){};${scriptWords(w)}</script>
<script src="assets/search-core.js" defer></script>
<script src="search-index.js" defer></script>
<script src="assets/site.js" defer></script>
</head>
<body class="root-body">
<a class="skip-link" href="#content">${esc(w.skip)}</a>
<header class="top">
<a class="brand" href="index.html">${brand.logo ? `<img src="${esc(brand.logo)}" alt=""${brand.plate ? ' class="plate"' : ''}>` : `<span class="logo-mark" aria-hidden="true">${esc([...brandName.trim()][0] ?? '')}</span>`}<span>${esc(brandName)}</span></a>
${o.topSearch ? `<form class="search" role="search" aria-label="${esc(w.searchAll)}" action="search.html" method="get">
${icon('search')}<label for="q" class="visually-hidden">${esc(w.searchAll)}</label>
<input type="search" id="q" name="q" placeholder="${esc(withHints(r, w.searchAll))}" autocomplete="off" enterkeyhint="search" aria-keyshortcuts="Control+K Meta+K /" aria-controls="search-pop">
<kbd class="kbd" aria-hidden="true">⌘K</kbd>
<div id="search-pop" class="pop" hidden></div>
</form>` : ''}
<div class="top-right">
${o.topSearch ? `<button type="button" class="top-btn top-btn--ghost search-open" aria-label="${esc(w.search)}">${icon('search')}</button>` : ''}
${faqHref ? `<a class="top-btn top-btn--ghost top-faq" href="${esc(faqHref)}">${icon('help')}<span class="faq-label">${esc(w.faq)}</span></a>` : ''}
${themeButton(w)}
${back}
</div>
</header>
${artSymbols(!!o.art)}
<main id="content" class="root" tabindex="-1">
${o.main}
</main>
<footer class="root-foot"><div class="root-foot-in">${foot}</div></footer>
</body>
</html>
`
}

/** The front page of the whole site, in the primary language: hero with search, a card per book, the FAQ, the journey
 * strip and the videos. Every part without data is left out. */
function rootPage(r: Root): string {
  const { project } = r
  const sites = primarySites(r)
  const { primary, config } = project
  const w = wordsFor(primary)
  const loc = (v: Parameters<typeof localize>[0]) => localize(v, primary, primary)
  const d = config.document
  const home = config.web.home
  const title = loc(home.title) || loc(d.title)
  const books = config.books
  const audienceOf = (s: BookSite) => loc(books[s.t.book]?.audience)
  const hrefOf = (s: BookSite, file: string) => `${s.t.book}/${s.t.lang}/${file}`

  const sub = [loc(d.project), loc(d.developer)].filter(Boolean).join(' · ')
  const lede = loc(home.lede) || (sites.length > 1 ? w.homeLede.replace('{n}', String(sites.length)) : '')
  const hints = home.hints.map(loc).filter(Boolean)
  // document.coverImage replaces the theme's drawing
  const art = r.art
    ? `<img class="hero-art" src="${esc(r.art.src)}" alt=""${r.art.size ? ` width="${r.art.size.width}" height="${r.art.size.height}"` : ''}>`
    : '<svg class="hero-art" viewBox="0 0 520 360" aria-hidden="true" focusable="false"><use href="#a-hero"/></svg>'
  const hero = `<div class="hero-field"><header class="root-hero wrap">
<div class="hero-text"><p class="eyebrow">${esc(w.manual)}</p>
<h1>${title.split('\n').map(esc).join('<br>')}</h1>
${d.client ? `<p class="hero-org">${esc(loc(d.client))}</p>` : ''}${sub ? `<p class="hero-dev">${esc(sub)}</p>` : ''}${lede ? `<p class="hero-lede">${esc(lede)}</p>` : ''}
<form class="hero-search" role="search" aria-label="${esc(w.heroSearch)}" action="search.html" method="get">${icon('search')}<label for="hq" class="visually-hidden">${esc(w.searchAll)}</label><input type="search" id="hq" name="q" placeholder="${esc(withHints(r, w.heroSearch))}" autocomplete="off" enterkeyhint="search" aria-keyshortcuts="Control+K Meta+K /" aria-controls="hero-pop"><div id="hero-pop" class="pop" hidden></div></form>
${hints.length ? `<p class="try"><span>${esc(w.tryHints)}:</span>${hints.map((h) => `<button type="button" data-hint="${esc(h)}">${esc(h)}</button>`).join('')}</p>` : ''}
</div>
${art}
</header></div>`

  const sec = (id: string, heading: string, body: string, o: { small?: string; intro?: string } = {}) =>
    `<section aria-labelledby="${id}"><div class="sec-h"><h2 id="${id}">${esc(heading)}</h2>${o.small ? `<small>${esc(o.small)}</small>` : ''}</div>${o.intro ? `<p class="sec-intro">${esc(o.intro)}</p>` : ''}${body}</section>`

  const cards = sites
    .map((s, i) => {
      const pic = r.bookIcons.get(s.t.book)
      const who = audienceOf(s)
      const blurb = loc(books[s.t.book]?.description)
      const drawing = pic
        ? `<img class="bcard-art" src="${esc(pic)}" alt="">`
        : `<svg class="bcard-art" viewBox="0 0 120 96" aria-hidden="true" focusable="false"><use href="#${GUIDE_ART[i % GUIDE_ART.length]}"/></svg>`
      const groups = s.groups.map((g) => `<li><a href="${esc(hrefOf(s, g.chapters[0]!.file))}"><span>${esc(g.title)}</span><small>${esc(w.pageCount.replace('{n}', String(g.chapters.length)))}</small></a></li>`).join('')
      const facts = [
        ...(who ? [[w.forLabel, who, ' class="who"']] : []),
        [w.content, w.pageCount.replace('{n}', String(s.chapters.length)), ''],
        ...(s.clips.length ? [[w.clipsLabel, w.clipCount.replace('{n}', String(s.clips.length)), '']] : []),
      ]
      const twins = r.sites.filter((x) => x.t.book === s.t.book)
      const langs = twins.length > 1 ? `<p class="book-langs">${twins.map((x) => `<a href="${esc(hrefOf(x, 'index.html'))}" lang="${esc(x.t.lang)}" hreflang="${esc(x.t.lang)}" class="tag">${esc(langName(x.t.lang))}</a>`).join('')}</p>` : ''
      return `<li class="bcard"><div class="bcard-top has-art">${drawing}<h2><a href="${esc(hrefOf(s, 'index.html'))}">${esc(s.book.title)}</a></h2>${blurb ? `<p class="bcard-blurb">${esc(blurb)}</p>` : ''}</div>
<dl class="bfacts">${facts.map(([k, v, cls]) => `<div><dt>${esc(k!)}</dt><dd${cls}>${esc(v!)}</dd></div>`).join('')}</dl>
${groups ? `<ul class="bgroups">${groups}</ul>` : ''}
<div class="bcard-foot"><a class="open-book" href="${esc(hrefOf(s, 'index.html'))}">${esc(w.openBook)}${icon('next')}</a>${langs}</div></li>`
    })
    .join('')
  const pageTotal = sites.reduce((n, s) => n + s.chapters.length, 0)
  const guides = cards
    ? sec('guides-h', sites.length > 1 ? w.guides : sites[0]!.book.title, `<ul class="books">${cards}</ul>`, {
        small: w.guideCount.replace('{b}', String(sites.length)).replace('{p}', String(pageTotal)),
        intro: sites.length > 1 ? w.guidesLede : undefined,
      })
    : ''

  const pickers = sites
    .filter((s) => s.roles.length)
    .map((s, i, all) => rolePicker(s, (f) => hrefOf(s, f), `roles-${i + 1}`, all.length > 1 ? `${w.iAm} ${s.book.title}` : w.iAm))
    .join('\n')

  const faqList = r.faqs.get(primary) ?? []
  const faq = faqList.length ? sec('faq-h', w.faq, faqBanner(hrefOf(faqList[0]!.site, 'faq.html'), faqList.length, w)) : ''

  const steps = home.journey.map((j, i) => {
    const s = sites.find((x) => x.chapters.some((c) => c.id === j.page))
    if (!s) throw new Error(`web.home.journey[${i}]: page "${j.page}" is not in any ${primary} book`)
    const c = s.chapters.find((x) => x.id === j.page)!
    return { href: hrefOf(s, c.file), label: loc(j.label) || c.title, who: loc(j.who) || audienceOf(s) || s.book.title }
  })
  const journey = steps.length
    ? sec('journey-h', loc(home.journeyTitle) || w.journey, `<ol class="journey-track">${steps
        .map((j) => `<li><a href="${esc(j.href)}"><span class="j-who">${esc(j.who)}</span><span class="j-label">${esc(j.label)}</span></a></li>`)
        .join('')}</ol>`, { intro: w.journeyLede })
    : ''

  const clips = sites.flatMap((s) => s.clips.map(({ clip, chapter }) => ({ clip, href: hrefOf(s, chapter.file), page: audienceOf(s) || s.book.title })))
  const videos = clips.length ? gallery(clips, primary, 'videos-h', (u) => u.replace(/^\.\.\/\.\.\//, ''), true) : ''

  const main = [hero, `<div class="wrap">`, guides, pickers, journey, faq, videos, `</div>`].filter(Boolean).join('\n')
  return rootShell(r, { file: 'index.html', title: title.replace(/\n/g, ' '), main, art: !r.art })
}

/** Search results across every book of the primary language. */
function rootSearchPage(r: Root): string {
  const w = wordsFor(r.project.primary)
  const main = `<div class="wrap"><article class="search-page sheet"><div class="sheet-body"><h1>${esc(w.searchTitle)}</h1>
<p id="search-status" role="status" data-results="${esc(w.results)}" data-none="${esc(w.noResults)}"></p>
<ol id="search-results" class="search-results"></ol>
<noscript><p>${esc(w.noScript)}</p></noscript>
</div></article></div>`
  return rootShell(r, { topSearch: true, file: 'search.html', title: `${w.searchTitle} — ${localize(r.project.config.document.title, r.project.primary, r.project.primary)}`, main })
}
