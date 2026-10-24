import { describe, expect, it } from 'vitest'
import { brandCss, contrast, DEFAULT_BRAND, fieldInks } from '../src/web/brand.ts'

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
/** The tokens of one block of brandCss: `:root { ... }` (light) or the `[data-theme="dark"]` block. */
function tokens(css: string, dark: boolean): Record<string, string> {
  const block = dark ? /:root\[data-theme="dark"\] \{([^}]*)\}/.exec(css)![1]! : /^:root \{([^}]*)\}/.exec(css)![1]!
  return Object.fromEntries(block.split(';').map((d) => d.split(':').map((x) => x.trim())).filter((d) => d[0]?.startsWith('--')))
}

// no brand, a dark navy, a bright orange, a yellow (usability goal G5), and a near-black pair
const PAIRS = [DEFAULT_BRAND, { brand: '#0d2470', accent: '#f79722' }, { brand: '#f97316', accent: '#1e3a8a' }, { brand: '#facc15', accent: '#111827' }, { brand: '#111111', accent: '#e11d48' }]
const SURFACES = { light: ['#ffffff', '#eef1f5'], dark: ['#14181e', '#1b2028'] }

describe('web brand tokens', () => {
  for (const pair of PAIRS)
    for (const dark of [false, true])
      it(`${pair.brand} + ${pair.accent} reads in ${dark ? 'dark' : 'light'}`, () => {
        const t = tokens(brandCss(pair), dark)
        // text on the colour fields
        expect(contrast(rgb(t['--on-brand']!), rgb(t['--brand']!))).toBeGreaterThanOrEqual(4.5)
        expect(contrast(rgb(t['--on-deep']!), rgb(t['--brand-deep']!))).toBeGreaterThanOrEqual(4.5)
        // headings, links and the accent text on every page surface, and on the brand-soft tint
        for (const bg of [...SURFACES[dark ? 'dark' : 'light'], t['--brand-soft']!]) {
          expect(contrast(rgb(t['--brand-ink']!), rgb(bg))).toBeGreaterThanOrEqual(4.5)
          expect(contrast(rgb(t['--accent-ink']!), rgb(bg))).toBeGreaterThanOrEqual(4.5)
        }
        // the accent rule shows against the field it closes
        expect(contrast(rgb(t['--accent']!), rgb(t['--brand']!))).toBeGreaterThanOrEqual(1.6)
      })

  it('keeps the configured brand colour on the light field and honours brandInk and link', () => {
    const t = tokens(brandCss({ brand: '#123a6b', accent: '#e8890c', brandInk: '#fefefe', link: '#0050c8' }), false)
    expect(t['--brand']).toBe('#123a6b')
    expect(t['--on-brand']).toBe('#fefefe')
    expect(t['--brand-ink']).toBe('#0050c8')
  })

  for (const pair of PAIRS)
    it(`title card text reads on ${pair.brand} with ${pair.accent}`, () => {
      const t = fieldInks(pair.brand, pair.accent)
      expect(contrast(rgb(t.ink), rgb(pair.brand))).toBeGreaterThanOrEqual(4.5)
      expect(contrast(rgb(t.accent), rgb(pair.brand))).toBeGreaterThanOrEqual(4.5)
    })
})
