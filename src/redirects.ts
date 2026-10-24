// Redirects checked hop by hop: the browser never routes the hops of a redirect it follows itself, so a request that
// passed a host filter could still end on a host the filter refuses. capture and snap fetch through here instead.
import type { APIRequestContext, APIResponse, BrowserContext, Route } from 'playwright'
import { bare } from './capture-failure.ts'

const REDIRECTS = new Set([301, 302, 303, 307, 308])
/** As Chromium: more redirects than this is a loop. */
const MAX_REDIRECTS = 20

type Followed = { response: APIResponse; url: string } | { refused: string; from: string }

/**
 * The response to a routed request, with its redirects followed here one hop at a time so each Location is checked
 * before it is asked for. Cookies set on the way land in the context, as they would in the browser.
 */
async function follow(route: Route, api: APIRequestContext, ok: (url: string) => boolean): Promise<Followed> {
  const req = route.request()
  let url = req.url()
  let method = req.method()
  let response = await route.fetch({ maxRedirects: 0, timeout: 0 })
  for (let hops = 0; REDIRECTS.has(response.status()) && response.headers().location !== undefined; hops++) {
    if (hops === MAX_REDIRECTS) throw new Error(`more than ${MAX_REDIRECTS} redirects from ${bare(req.url())}`)
    const next = new URL(response.headers().location!, url).href
    if (!ok(next)) return { refused: next, from: url }
    const status = response.status()
    // as browsers do: a 303, or a 301/302 after a POST, goes on as a GET without the body
    const dropBody = (status === 303 && method !== 'HEAD') || ((status === 301 || status === 302) && method === 'POST')
    if (dropBody) method = 'GET'
    const headers = Object.fromEntries(Object.entries(req.headers()).filter(([k]) => k !== 'cookie' && !(dropBody && k.startsWith('content-'))))
    const body = dropBody ? undefined : (req.postDataBuffer() ?? undefined)
    url = next
    response = await api.fetch(url, { method, headers, maxRedirects: 0, timeout: 0, ...(body ? { data: body } : {}) })
  }
  return { response, url }
}

/** The network error a failed fetch would have given the browser. */
const netError = (e: unknown) => {
  const m = String(e)
  return /ECONNREFUSED/.test(m) ? 'connectionrefused' : /ENOTFOUND|EAI_AGAIN/.test(m) ? 'namenotresolved' : 'failed'
}

/** A page that sends the browser on to where its redirects ended, in place of itself in the history. */
const forward = (url: string) => `<!doctype html><script>location.replace(${JSON.stringify(url).replace(/</g, '\\u003c')})</script>`

/**
 * Answers a context's routed requests with their redirects followed in Node, each hop checked by `ok` first. A hop
 * `ok` refuses is passed to `refuse` and the request aborted. A navigation that ended elsewhere sends the browser
 * on there, so the page's URL is where it really is.
 */
export function checkedFetch(context: BrowserContext) {
  /** Where navigations whose redirects were followed ended, until the browser is sent on to them. */
  const arrived = new Map<string, APIResponse>()
  return async (route: Route, ok: (url: string) => boolean, refuse: (url: string, from: string) => void) => {
    const req = route.request()
    const done = req.isNavigationRequest() ? arrived.get(req.url()) : undefined
    if (done) {
      arrived.delete(req.url())
      return route.fulfill({ response: done })
    }
    try {
      const r = await follow(route, context.request, ok)
      if ('refused' in r) {
        refuse(r.refused, r.from)
        return await route.abort('blockedbyclient')
      }
      if (r.url === req.url() || !req.isNavigationRequest()) return await route.fulfill({ response: r.response })
      arrived.set(r.url, r.response)
      return await route.fulfill({ contentType: 'text/html', body: forward(r.url) })
    } catch (e) {
      // the context may be closing; nothing is waiting for this request then
      return route.abort(netError(e)).catch(() => {})
    }
  }
}
