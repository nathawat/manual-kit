import { createServer, type IncomingMessage, type Server } from 'node:http'

export interface Call {
  path: string
  auth?: string
  body: Record<string, unknown>
}
interface Doc {
  id: string
  urlId: string
  url: string
  title: string
  text: string
  collectionId: string
  parentDocumentId?: string
}

const read = (req: IncomingMessage) =>
  new Promise<Buffer>((r) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => r(Buffer.concat(chunks)))
  })

/** A small in-memory Outline API: collections, documents, attachments (+ the local upload endpoint). */
export async function outlineMock(opts: { collection?: { id: string; urlId: string }; uploadOrigin?: string } = {}) {
  const collection = opts.collection ?? { id: 'dae52987-941e-47e3-8d75-d3b021e7666a', urlId: 'Hq7RtK2xWm' }
  const calls: Call[] = []
  const uploads: { path: string; auth?: string; size: number }[] = []
  const docs = new Map<string, Doc>()
  let n = 0
  let url = ''
  const server: Server = createServer(async (req, res) => {
    const raw = await read(req)
    const path = (req.url ?? '').split('?')[0]!
    const json = (status: number, data: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    if (path === '/api/files.create' || path === '/upload') {
      uploads.push({ path, auth: req.headers.authorization, size: raw.length })
      return json(200, { ok: true })
    }
    const body = raw.length ? (JSON.parse(raw.toString()) as Record<string, unknown>) : {}
    calls.push({ path, auth: req.headers.authorization, body })
    if (req.headers.authorization !== 'Bearer test-token-123') return json(401, { ok: false, error: 'authentication_required', message: 'Authentication required' })
    switch (path) {
      case '/api/collections.info':
        if (body.id !== collection.id && body.id !== collection.urlId) return json(404, { ok: false, error: 'not_found', message: 'Resource not found' })
        return json(200, { data: { id: collection.id, urlId: collection.urlId, name: 'Product Docs' } })
      case '/api/documents.create': {
        n += 1
        const d: Doc = {
          id: `doc-${n}`,
          urlId: `u${n}`,
          url: `/doc/d-${n}-u${n}`,
          title: String(body.title),
          text: String(body.text ?? ''),
          collectionId: String(body.collectionId),
          ...(body.parentDocumentId ? { parentDocumentId: String(body.parentDocumentId) } : {}),
        }
        docs.set(d.id, d)
        return json(200, { data: d })
      }
      case '/api/documents.update': {
        const d = docs.get(String(body.id))
        if (!d) return json(404, { ok: false, error: 'not_found', message: 'Resource not found' })
        if (body.title !== undefined) d.title = String(body.title)
        if (body.text !== undefined) d.text = String(body.text)
        return json(200, { data: d })
      }
      case '/api/documents.info': {
        const d = docs.get(String(body.id))
        return d ? json(200, { data: d }) : json(404, { ok: false, error: 'not_found', message: 'Resource not found' })
      }
      case '/api/documents.move':
        return json(200, { data: { documents: [] } })
      case '/api/attachments.create': {
        n += 1
        const id = `att-${n}`
        return json(200, {
          data: {
            uploadUrl: opts.uploadOrigin ? `${opts.uploadOrigin}/upload` : '/api/files.create',
            form: { key: `uploads/${id}/${String(body.name)}` },
            attachment: { id, name: body.name, url: `/api/attachments.redirect?id=${id}`, contentType: body.contentType, size: body.size },
          },
        })
      }
    }
    return json(404, { ok: false, error: 'not_found', message: `no route ${path}` })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  return { url, calls, uploads, docs, collection, close: () => new Promise<void>((r) => server.close(() => r())) }
}
