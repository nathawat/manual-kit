// Fixed UI text in components: JSX/TSX through the TypeScript parser, Vue single-file components through Vue's
// template parser. Nothing is executed. A label is its own key, so pages quote it as {{ui:"Label text"}}.
import { NodeTypes, parse as parseVue, type ElementNode, type TemplateChildNode } from '@vue/compiler-dom'
import type * as TS from 'typescript'
import { lazyDep } from '../deps.ts'

export const ts = lazyDep<typeof TS>('typescript')

/** Attributes whose literal value people see or hear. */
const UI_ATTRS = new Set(['placeholder', 'title', 'alt', 'aria-label', 'aria-description', 'label'])

const HAS_LETTER = /\p{L}/u
const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

function add(out: Set<string>, raw: string) {
  const s = clean(raw)
  if (s && HAS_LETTER.test(s)) out.add(s)
}

export const scriptKind = (file: string) =>
  /\.(tsx|jsx)$/.test(file) ? ts.ScriptKind.TSX : /\.(js|mjs|cjs)$/.test(file) ? ts.ScriptKind.JSX : ts.ScriptKind.TS

export function stringOf(e: TS.Expression | undefined): string | undefined {
  if (!e) return undefined
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text
  if (ts.isParenthesizedExpression(e)) return stringOf(e.expression)
  return undefined
}

/** Children that are expressions other than plain string literals make the text around them a template, not a label. */
const dynamicChildren = (children: TS.NodeArray<TS.JsxChild>) =>
  children.some((c) => ts.isJsxExpression(c) && c.expression !== undefined && stringOf(c.expression) === undefined)

/** UI text in a JS/TS/JSX/TSX file. `all` also takes every other string literal (constants, label maps). */
export function jsxStrings(file: string, text: string, literals: 'ui' | 'all' = 'ui'): Set<string> {
  const out = new Set<string>()
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file))
  const visit = (n: TS.Node) => {
    if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
      if (!dynamicChildren(n.children)) for (const c of n.children) if (ts.isJsxText(c)) add(out, decodeEntities(c.text))
      for (const c of n.children) if (ts.isJsxExpression(c)) {
        const s = stringOf(c.expression)
        if (s !== undefined) add(out, s)
      }
    } else if (ts.isJsxAttribute(n) && UI_ATTRS.has(n.name.getText(sf))) {
      const init = n.initializer
      const s = init && ts.isStringLiteral(init) ? init.text : init && ts.isJsxExpression(init) ? stringOf(init.expression) : undefined
      if (s !== undefined) add(out, s)
    } else if (literals === 'all' && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))) {
      const p = n.parent
      const skip = ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) || ts.isJsxAttribute(p) || ts.isLiteralTypeNode(p)
      if (!skip) add(out, n.text)
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return out
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decodeEntities = (s: string) => s.replace(/&(\w+);/g, (m, name: string) => ENTITIES[name] ?? m)

/** UI text in the `<template>` of a Vue SFC: static text and literal UI attributes. Interpolations are skipped. */
export function vueStrings(text: string): Set<string> {
  const out = new Set<string>()
  let root
  try {
    root = parseVue(text, { parseMode: 'sfc' })
  } catch {
    return out
  }
  const template = root.children.find((c): c is ElementNode => c.type === NodeTypes.ELEMENT && c.tag === 'template')
  if (!template) return out
  const visit = (nodes: TemplateChildNode[]) => {
    const dynamic = nodes.some((c) => c.type === NodeTypes.INTERPOLATION)
    for (const n of nodes) {
      if (n.type === NodeTypes.TEXT && !dynamic) add(out, n.content)
      if (n.type === NodeTypes.ELEMENT) {
        for (const p of n.props) if (p.type === NodeTypes.ATTRIBUTE && UI_ATTRS.has(p.name) && p.value) add(out, p.value.content)
        visit(n.children)
      }
    }
  }
  visit(template.children)
  return out
}
