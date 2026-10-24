import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { startPreview } from '../src/preview.ts'

describe('preview server', () => {
  it('serves dist on 127.0.0.1 with types, directory index, byte ranges, and nothing outside the folder', async () => {
    const base = mkdtempSync(join(tmpdir(), 'mk-preview-'))
    const dir = join(base, 'dist')
    mkdirSync(join(dir, 'web/user-guide/th'), { recursive: true })
    writeFileSync(join(dir, 'web/index.html'), '<h1>ok</h1>')
    writeFileSync(join(dir, 'web/clip.mp4'), Buffer.from('0123456789'))
    writeFileSync(join(base, 'secret.txt'), 'no')
    const p = await startPreview(dir)
    try {
      expect(p.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
      const index = await fetch(`${p.url}web/`)
      expect(index.status).toBe(200)
      expect(index.headers.get('content-type')).toContain('text/html')
      expect(await index.text()).toBe('<h1>ok</h1>')
      const part = await fetch(`${p.url}web/clip.mp4`, { headers: { range: 'bytes=2-5' } })
      expect(part.status).toBe(206)
      expect(part.headers.get('content-range')).toBe('bytes 2-5/10')
      expect(await part.text()).toBe('2345')
      expect((await fetch(`${p.url}web/%2e%2e/%2e%2e/secret.txt`)).status).toBeGreaterThanOrEqual(403)
      expect((await fetch(`${p.url}nope.html`)).status).toBe(404)
    } finally {
      await p.close()
    }
  })
})
