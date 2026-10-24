// Content pages: manual/pages/<lang>/<book>/NN-slug.md with YAML front matter, plus the token grammar.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import YAML from 'yaml'
import { z } from 'zod'
import { formatIssues } from './config.ts'

export const PAGE_ID = /^[a-z0-9][a-z0-9._-]*$/

export const PageMeta = z.object({
  id: z.string().regex(PAGE_ID, 'lower-case id like "teacher.create-class"'),
  title: z.string().min(1),
  audience: z.array(z.string()).default([]),
  book: z.string().min(1),
  kind: z.enum(['how-to', 'reference', 'concept']),
  routes: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
  /** Coverage ids this page documents besides its routes (e.g. role:teacher, perm:classes.*); `*` is a wildcard. */
  covers: z.array(z.string().min(1)).default([]),
  /** One or two sentences under the title (web). */
  summary: z.string().optional(),
  /** Key-value card under the title (web), e.g. { ใช้เวลา: 5 นาที }. */
  info: z.record(z.string(), z.union([z.string(), z.number()]).transform(String)).optional(),
  /** Sidebar group (config web.groups); default: the page kind. */
  group: z.string().optional(),
})
export type PageMeta = z.infer<typeof PageMeta>

/** A front matter group that config web.groups does not name, as a sidebar title: `getting-started` -> "Getting started". */
export function groupName(id: string): string {
  const words = id.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export type TokenKind = 'ui' | 'shot' | 'steps' | 'clip' | 'data' | 'link' | 'unknown'
export interface Token {
  kind: TokenKind
  arg: string
  /** 1-based line within the text that was scanned. */
  line: number
  /** `{{ui:"label"}}`: a visible label rather than a key (may hold spaces; differs between languages). */
  quoted?: true
}

export interface Page {
  id: string
  lang: string
  /** Book folder name. */
  book: string
  meta: PageMeta
  /** Markdown after the front matter. */
  body: string
  /** Line number in the file where `body` starts (1-based). */
  bodyLine: number
  /** Absolute file path. */
  file: string
  /** Path relative to the manual folder (posix). */
  rel: string
  tokens: Token[]
}

export interface PageProblem {
  file: string
  message: string
}

const KNOWN = new Set(['ui', 'shot', 'steps', 'clip', 'data'])
const TOKEN_RE = /\{\{([a-z]+):(?:"([^"}\n]+)"|([^}\s]+))\}\}|\[\[([a-z0-9][a-z0-9._-]*)\]\]/g

/** A UI string by key, or — for labels quoted in the page — the same text found in the product. */
export function findUi(strings: Map<string, string>, arg: string): string | undefined {
  const byKey = strings.get(arg)
  if (byKey !== undefined) return byKey
  const want = arg.replace(/\s+/g, ' ').trim()
  for (const v of strings.values()) if (v.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() === want) return v
  return undefined
}

/**
 * Replace every token outside fenced code blocks. The scanner and the renderer both go through here,
 * so a token that check sees is exactly a token that build replaces.
 */
/** Replace every token outside code fences; `fn` also gets the whole source line the token is on. */
export function mapTokens(text: string, fn: (token: Token, raw: string, line: string) => string): string {
  let inFence = false
  return text
    .split('\n')
    .map((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence
        return line
      }
      if (inFence) return line
      return line.replace(TOKEN_RE, (raw, kind: string | undefined, quoted: string | undefined, plain: string | undefined, link: string | undefined) => {
        const arg = quoted ?? plain
        const token: Token =
          link !== undefined
            ? { kind: 'link', arg: link, line: i + 1 }
            : KNOWN.has(kind!)
              ? { kind: kind as TokenKind, arg: arg!, line: i + 1, ...(quoted !== undefined ? { quoted: true as const } : {}) }
              : { kind: 'unknown', arg: `${kind}:${arg}`, line: i + 1 }
        return fn(token, raw, line)
      })
    })
    .join('\n')
}

export function scanTokens(text: string): Token[] {
  const out: Token[] = []
  mapTokens(text, (t, raw) => {
    out.push(t)
    return raw
  })
  return out
}

/** Split `---\nyaml\n---\nbody`; returns the body start line (1-based). */
export function splitFrontMatter(raw: string): { data: unknown; body: string; bodyLine: number } {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text)
  if (!m) return { data: {}, body: text, bodyLine: 1 }
  return { data: YAML.parse(m[1]!) ?? {}, body: text.slice(m[0].length), bodyLine: m[0].split('\n').length }
}

const sortedDirs = (dir: string) =>
  existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : []

export function loadPages(manualDir: string): { pages: Page[]; problems: PageProblem[] } {
  const pages: Page[] = []
  const problems: PageProblem[] = []
  const root = join(manualDir, 'pages')
  for (const lang of sortedDirs(root)) {
    for (const book of sortedDirs(join(root, lang))) {
      const dir = join(root, lang, book)
      const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
      for (const name of files) {
        const file = join(dir, name)
        const rel = relative(manualDir, file).split('\\').join('/')
        let split: ReturnType<typeof splitFrontMatter>
        try {
          split = splitFrontMatter(readFileSync(file, 'utf8'))
        } catch (e) {
          problems.push({ file: rel, message: `front matter is not valid YAML: ${(e as Error).message}` })
          continue
        }
        const parsed = PageMeta.safeParse(split.data)
        if (!parsed.success) {
          problems.push({ file: rel, message: `invalid front matter:\n${formatIssues(parsed.error.issues)}` })
          continue
        }
        const tokens = scanTokens(split.body).map((t) => ({ ...t, line: t.line + split.bodyLine - 1 }))
        pages.push({ id: parsed.data.id, lang, book, meta: parsed.data, body: split.body, bodyLine: split.bodyLine, file, rel, tokens })
      }
    }
  }
  return { pages, problems }
}
