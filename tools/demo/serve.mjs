// A static server for the demo scenes on 127.0.0.1: generated scenes (WORK/site) over the committed ones (site/),
// /fonts from the repo's bundled Sarabun, /web from DEMO_WEB. Run it in the background while record.mjs runs.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { BASE, HERE, PORT, REPO, WEB, WORK } from './paths.mjs'

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.vtt': 'text/vtt', '.pdf': 'application/pdf' }
const roots = (path) =>
  path.startsWith('/fonts/') ? [join(REPO, 'assets', path)]
  : path.startsWith('/web/') ? [join(WEB, path.slice(5))]
  : [join(WORK, 'site', path), join(HERE, 'site', path)]

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, BASE).pathname)).replace(/^(\.\.[/\\])+/, '')
  let file = roots(path.endsWith('/') ? `${path}index.html` : path).find((f) => existsSync(f) && statSync(f).isFile())
  if (!file) return res.writeHead(404).end('not found')
  const size = statSync(file).size
  const type = TYPES[extname(file)] ?? 'application/octet-stream'
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
  if (range) {
    const start = Number(range[1] || 0)
    const end = range[2] ? Number(range[2]) : size - 1
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 })
    return createReadStream(file, { start, end }).pipe(res)
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' })
  createReadStream(file).pipe(res)
}).listen(PORT, '127.0.0.1', () => console.log(`demo scenes on ${BASE} (web: ${WEB || 'DEMO_WEB not set'})`))
