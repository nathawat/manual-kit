// Renders the diagrams (make.py) to 2x PNG for the README, with the repo's IBM Plex Sans Thai so GitHub shows the
// right font (an SVG in a README cannot load fonts). Usage: node docs/diagrams/export.mjs
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const HERE = fileURLToPath(new URL('.', import.meta.url))
const { chromium } = createRequire(join(HERE, '../../package.json'))('playwright')
const font = (w, file) => `@font-face { font-family: 'IBM Plex Sans Thai'; font-weight: ${w}; src: url(${pathToFileURL(join(HERE, '../../assets/fonts', file))}); }`
const css = font(400, 'IBMPlexSansThai-Regular.ttf') + font(600, 'IBMPlexSansThai-SemiBold.ttf') + font(700, 'IBMPlexSansThai-Bold.ttf')
const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 2 })
for (const slug of ['how-it-works', 'keep-current']) {
  const svg = readFileSync(join(HERE, `${slug}.svg`), 'utf8')
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css} body { margin: 0 }</style></head><body>${svg}</body></html>`)
  await page.evaluate(() => document.fonts.ready)
  await page.locator('svg').screenshot({ path: join(HERE, `${slug}.png`) })
  console.log('wrote', `${slug}.png`)
}
await browser.close()
