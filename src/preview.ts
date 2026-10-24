// preview: serve dist/ on 127.0.0.1 only and open the web build. Byte ranges for video (Safari needs them).
import { spawn } from 'node:child_process'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt; charset=utf-8',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain; charset=utf-8',
}

export interface Preview {
  url: string
  close: () => Promise<void>
}

/** Serve `dir` on 127.0.0.1 (never other interfaces). Port 0 = any free port. */
export async function startPreview(dir: string, port = 0): Promise<Preview> {
  const root = resolve(dir)
  const server: Server = createServer((req, res) => {
    let path: string
    try {
      path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    } catch {
      res.writeHead(400).end()
      return
    }
    let file = normalize(join(root, path))
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end()
      return
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found')
      return
    }
    const size = statSync(file).size
    const headers = { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'accept-ranges': 'bytes', 'cache-control': 'no-cache' }
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
      const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1
      if (start > end || start >= size) {
        res.writeHead(416, { 'content-range': `bytes */${size}` }).end()
        return
      }
      res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 })
      if (req.method === 'HEAD') return void res.end()
      createReadStream(file, { start, end }).pipe(res)
      return
    }
    res.writeHead(200, { ...headers, 'content-length': size })
    if (req.method === 'HEAD') return void res.end()
    createReadStream(file).pipe(res)
  })
  await new Promise<void>((ok, fail) => {
    server.once('error', fail)
    server.listen(port, '127.0.0.1', ok)
  })
  const actual = (server.address() as { port: number }).port
  return { url: `http://127.0.0.1:${actual}/`, close: () => new Promise((r) => server.close(() => r())) }
}

/** Open a URL in the default browser. */
export function openBrowser(url: string) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]]
  spawn(cmd, args as string[], { stdio: 'ignore', detached: true }).unref()
}
