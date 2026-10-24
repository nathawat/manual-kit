import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCli, runCliAsync } from './helpers/cli.ts'
import { imageSize } from '../src/media/size.ts'
import { pixel } from './helpers/png.ts'

/**
 * A local server that also answers as `localhost.`, a name snap does not count as local. `hits` records `host path`
 * for every request, so a test can prove the outside name was never asked for anything.
 */
async function site() {
  const { createServer } = await import('node:http')
  const hits: string[] = []
  let port = 0
  const server = createServer((req, res) => {
    const host = (req.headers.host ?? '').replace(/:\d+$/, '')
    hits.push(`${host} ${req.url}`)
    const html = (body: string) => void res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><body style="margin:0">${body}`)
    const redirect = (location: string) => void res.writeHead(302, { location }).end()
    switch (req.url) {
      case '/away':
        return redirect(`http://localhost.:${port}/outside.html`)
      case '/img':
        return redirect(`http://localhost.:${port}/pic.png`)
      case '/image.html':
        return html('<img src="/img">')
      case '/moved':
        return redirect('/tall.html')
      case '/tall.html':
        return html('<div style="height:3000px;background:#036"></div>')
    }
    html('<p>outside</p>')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as { port: number }).port
  return { url: `http://127.0.0.1:${port}`, outside: () => hits.filter((h) => h.startsWith('localhost.')), close: () => new Promise<void>((r) => server.close(() => r())) }
}

describe('snap', () => {
  it('writes one full-page PNG per width and warns when the page scrolls sideways', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mk-snap-'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html><body style="margin:0"><div style="width:600px;height:2000px;background:#036"></div>')
    const r = runCli(['snap', join(dir, 'index.html'), '--width', '1280,390', '--out', join(dir, 'out')])
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, 'out/index-1280.png'))).toBe(true)
    expect(imageSize(join(dir, 'out/index-390.png'))).toEqual({ width: 600, height: 2000 }) // the sideways overflow is in the picture too
    expect(r.stderr).toMatch(/390 px wide: the page scrolls sideways by 210 px/)
    expect(r.stderr).not.toMatch(/1280 px wide/)
  })

  it('refuses hosts other than local ones', () => {
    const r = runCli(['snap', 'https://example.com/'])
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/local files and 127\.0\.0\.1\/localhost only/)
  })

  it('checks every redirect hop: a local page or image that redirects outside is refused, local redirects are followed', async () => {
    const s = await site()
    const dir = mkdtempSync(join(tmpdir(), 'mk-snap-'))
    try {
      const away = await runCliAsync(['snap', `${s.url}/away`, '--width', '800', '--out', dir])
      expect(away.stderr).toContain(`refused a redirect from ${s.url}/away to localhost.:`)
      const image = await runCliAsync(['snap', `${s.url}/image.html`, '--width', '800', '--out', dir])
      expect(image.code).toBe(0)
      expect(image.stderr).toContain(`refused a redirect from ${s.url}/img to localhost.:`)
      expect(s.outside()).toEqual([])
      const moved = await runCliAsync(['snap', `${s.url}/moved`, '--width', '800', '--out', dir])
      expect(moved.code).toBe(0)
      expect(imageSize(join(dir, 'moved-800.png'))).toEqual({ width: 800, height: 3000 })
    } finally {
      await s.close()
    }
  })

  it('loads lazy images below the fold before the full-page shot', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mk-snap-'))
    // a 1x1 red PNG
    const red = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')
    writeFileSync(join(dir, 'red.png'), red)
    writeFileSync(
      join(dir, 'index.html'),
      '<!doctype html><body style="margin:0"><div style="height:5000px"></div><img id="pic" src="red.png" loading="lazy" width="100" height="100" style="display:block">',
    )
    const r = runCli(['snap', join(dir, 'index.html'), '--width', '400', '--out', join(dir, 'out')])
    expect(r.code).toBe(0)
    expect(pixel(join(dir, 'out/index-400.png'), 50, 5050)).toEqual([255, 0, 0])
  })
})
