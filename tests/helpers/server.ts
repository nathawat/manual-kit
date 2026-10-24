import { readFileSync, existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { join, normalize } from 'node:path'

/** A static file server on 127.0.0.1 with a random port. */
export async function serveStatic(dir: string): Promise<{ url: string; close: () => Promise<void>; hits: string[] }> {
  const hits: string[] = []
  const server: Server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!)).replace(/^(\.\.[/\\])+/, '')
    hits.push(path)
    const file = join(dir, path)
    if (!existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    const type = file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8'
    res.writeHead(200, { 'content-type': type }).end(readFileSync(file))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  return { url: `http://127.0.0.1:${port}`, hits, close: () => new Promise((r) => server.close(() => r())) }
}
