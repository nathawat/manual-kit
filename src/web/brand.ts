// Brand colours of the web theme, worked out at build time from web.brand.colors so every pair stays readable:
// the field colours (top bar, page head), the text on them, and the brand and accent inks on light and dark pages.
// site.css carries the same values for the default pair; a configured pair overrides them with an inline <style>.

type Rgb = [number, number, number]

const hex = (h: string): Rgb => {
  const s = h.replace('#', '')
  const full = s.length === 3 ? [...s].map((c) => c + c).join('') : s.slice(0, 6)
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb
}
const lum = (c: Rgb) => {
  const [r, g, b] = c.map((v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }) as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** WCAG contrast ratio of two colours. */
export const contrast = (a: Rgb, b: Rgb) => {
  const x = lum(a)
  const y = lum(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
const mix = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => Math.round(v + (b[i]! - v) * t)) as Rgb
const css = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`

const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]
const DARK_INK: Rgb = [24, 32, 43]
/** Page surfaces the inks must read on: bg and sunken, light and dark (site.css --bg, --sunken). */
const SURFACES = { light: { bg: WHITE, sunken: [238, 241, 245] as Rgb }, dark: { bg: [20, 24, 30] as Rgb, sunken: [27, 32, 40] as Rgb } }

/** `c` moved toward black (light pages) or white (dark pages) until it reads at 4.6:1 on every surface in `on`. */
function readable(c: Rgb, on: Rgb[], dark: boolean): Rgb {
  let ink = c
  for (let t = 0; t <= 1 && on.some((s) => contrast(ink, s) < 4.6); t += 0.05) ink = mix(c, dark ? WHITE : BLACK, t)
  return ink
}
const textOn = (field: Rgb) => (contrast(field, WHITE) >= 4.5 ? WHITE : DARK_INK)
const softText = (on: Rgb) => (on === WHITE ? 'rgb(255 255 255 / 0.9)' : 'rgb(24 32 43 / 0.86)')

export interface BrandInput {
  brand: string
  accent: string
  /** Text on the brand field (web.brand.colors.brandInk); default: white or near-black, whichever reads. */
  brandInk?: string
  /** Links and headings on light pages (web.brand.colors.link); default: worked out from the brand. */
  link?: string
}

/** CSS custom properties for one theme (light or dark). */
function tokens(b: BrandInput, dark: boolean): Record<string, string> {
  const brand = hex(b.brand)
  const accent = hex(b.accent)
  const { bg, sunken } = dark ? SURFACES.dark : SURFACES.light
  const field = dark ? mix(brand, BLACK, 0.25) : brand
  const fieldInk = b.brandInk && !dark ? hex(b.brandInk) : textOn(field)
  const deep = dark ? mix(brand, BLACK, 0.55) : textOn(brand) === WHITE ? mix(brand, BLACK, 0.32) : brand
  const deepInk = textOn(deep)
  const soft = mix(bg, brand, dark ? 0.2 : 0.09)
  const ink = b.link && !dark ? readable(hex(b.link), [bg, soft, sunken], false) : readable(brand, [bg, soft, sunken], dark)
  return {
    '--brand': css(field),
    '--on-brand': css(fieldInk),
    '--on-brand-2': softText(fieldInk === WHITE ? WHITE : DARK_INK),
    '--brand-deep': css(deep),
    '--on-deep': css(deepInk),
    '--on-deep-2': softText(deepInk),
    '--brand-ink': css(ink),
    '--brand-soft': css(soft),
    '--brand-line': css(mix(bg, brand, dark ? 0.42 : 0.32)),
    // the rule under a colour field must show against it
    '--accent': css(contrast(accent, field) < 1.6 ? mix(accent, WHITE, 0.5) : accent),
    '--accent-ink': css(readable(accent, [bg, sunken, soft], dark)),
  }
}

const block = (sel: string, t: Record<string, string>) => `${sel} { ${Object.entries(t).map(([k, v]) => `${k}: ${v};`).join(' ')} }`

/** The brand CSS: light tokens on :root, dark tokens for the dark theme (system setting or the theme switch). */
export function brandCss(b: BrandInput): string {
  const dark = tokens(b, true)
  return [
    block(':root', tokens(b, false)),
    `@media (prefers-color-scheme: dark) { ${block(':root:not([data-theme="light"])', dark)} }`,
    block(':root[data-theme="dark"]', dark),
  ].join('\n')
}

/** A colour made readable as text on white paper (the PDF cover's title and labels). */
export const inkOnPaper = (c: string) => css(readable(hex(c), [WHITE], false))

/** Text on a brand-coloured field (video title cards): the main ink, a softer one, and the accent made readable on it. */
export function fieldInks(brand: string, accent: string): { ink: string; soft: string; accent: string } {
  const field = hex(brand)
  const ink = textOn(field)
  return { ink: css(ink), soft: softText(ink), accent: css(readable(hex(accent), [field], ink === WHITE)) }
}

/** The default pair when web.brand.colors sets nothing (DESIGN.md). */
export const DEFAULT_BRAND: BrandInput = { brand: '#183b5e', accent: '#d9480f' }
