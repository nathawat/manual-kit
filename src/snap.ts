// snap: full-page screenshots of a built page (web manual, an HTML file) at several widths, so a person or an agent
// can look at the result. Local files and 127.0.0.1/localhost only; nothing else is fetched.
import { mkdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lazyDep } from './deps.ts'
import { checkedFetch } from './redirects.ts'
import { UsageError } from './sign.ts'

const playwright = lazyDep<typeof import('playwright')>('playwright')

const LOCAL = new Set(['127.0.0.1', 'localhost', '[::1]'])
const local = (url: string) => /^https?:$/.test(new URL(url).protocol) && LOCAL.has(new URL(url).hostname)

export async function snap(target: string, widths: number[], outDir: string): Promise<string[]> {
  const url = /^https?:\/\//.test(target) ? new URL(target) : pathToFileURL(resolve(target))
  if (url.protocol !== 'file:' && !LOCAL.has(url.hostname)) throw new UsageError(`snap opens local files and 127.0.0.1/localhost only, not ${url.hostname}`)
  mkdirSync(outDir, { recursive: true })
  const name = basename(url.pathname.replace(/\/$/, '/index.html')).replace(/\.\w+$/, '') || 'page'
  const browser = await playwright.chromium.launch()
  const written: string[] = []
  try {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const answer = checkedFetch(page.context())
      await page.route('**/*', (route) => {
        const url = route.request().url()
        if (/^(file|data):/.test(url)) return route.continue()
        if (!local(url)) return route.abort()
        return answer(route, local, (to, from) => console.error(`warning: refused a redirect from ${from} to ${new URL(to).host}`))
      })
      await page.goto(url.href, { waitUntil: 'load' })
      // a full-page shot does not scroll, so images below the fold that wait to be scrolled to would stay blank
      await page.evaluate(() =>
        Promise.all(
          Array.from(document.images, (img) => {
            img.loading = 'eager'
            return img.decode().catch(() => {})
          }),
        ),
      )
      const file = join(outDir, `${name}-${width}.png`)
      await page.screenshot({ path: file, fullPage: true })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      if (overflow > 1) console.error(`warning: ${width} px wide: the page scrolls sideways by ${overflow} px`)
      written.push(file)
      await page.close()
    }
  } finally {
    await browser.close()
  }
  return written
}
