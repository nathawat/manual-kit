// finalize: let a real word processor lay the DOCX out once, so the contents and figure/table lists carry
// page numbers when the client opens the file: Microsoft Word on macOS (AppleScript) or LibreOffice (headless, UNO).
import { execFile, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, zipSync } from 'fflate'
import { ASSETS } from '../paths.ts'
import { UsageError } from '../sign.ts'
import { all, parsePart, writePart } from './ooxml.ts'

export type FinalizeMode = 'auto' | 'word' | 'libreoffice' | 'none'

export const WORD_APP = '/Applications/Microsoft Word.app'

export interface Probe {
  platform: string
  hasWord: () => boolean
  /** Path of LibreOffice's soffice, or null. */
  soffice: () => string | null
}

const LIBREOFFICE_APP = '/Applications/LibreOffice.app/Contents/MacOS/soffice'
/** soffice from MANUAL_KIT_SOFFICE, PATH (soffice or libreoffice) or the macOS app. */
export function findSoffice(): string | null {
  const fromEnv = process.env.MANUAL_KIT_SOFFICE
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null
  for (const d of (process.env.PATH ?? '').split(':').filter(Boolean))
    for (const name of ['soffice', 'libreoffice']) if (existsSync(join(d, name))) return join(d, name)
  return existsSync(LIBREOFFICE_APP) ? LIBREOFFICE_APP : null
}

export const systemProbe: Probe = {
  platform: process.platform,
  hasWord: () => existsSync(WORD_APP),
  soffice: findSoffice,
}

export type Finalizer = 'word' | 'libreoffice' | 'none'

/**
 * auto = LibreOffice when installed, else none. Microsoft Word only when asked for by name (`--finalize word`):
 * driving Word through AppleScript has hung on a dialog before, so it is never picked on its own.
 */
export function chooseFinalizer(mode: FinalizeMode, probe: Probe = systemProbe): Finalizer {
  const word = probe.platform === 'darwin' && probe.hasWord()
  switch (mode) {
    case 'none':
      return 'none'
    case 'auto':
      return probe.soffice() ? 'libreoffice' : 'none'
    case 'word':
      if (!word) throw new UsageError('--finalize word needs Microsoft Word on macOS (/Applications/Microsoft Word.app)')
      return 'word'
    case 'libreoffice':
      if (!probe.soffice()) throw new UsageError('--finalize libreoffice needs LibreOffice (soffice) on PATH, in /Applications/LibreOffice.app, or in MANUAL_KIT_SOFFICE')
      return 'libreoffice'
  }
}

/** One line saying which path the build takes and why, e.g. `finalize: libreoffice (auto; soffice /usr/bin/soffice)`. */
export function describeFinalizer(finalizer: Finalizer, mode: FinalizeMode, from: 'cli' | 'config', probe: Probe = systemProbe): string {
  const why = from === 'cli' ? `--finalize ${mode}` : `config docx.finalize: ${mode}`
  const detail =
    finalizer === 'libreoffice'
      ? `; soffice ${probe.soffice()}`
      : finalizer === 'word'
        ? `; ${WORD_APP}`
        : mode === 'auto'
          ? '; no LibreOffice found (Microsoft Word is used only with --finalize word)'
          : ''
  return `finalize: ${finalizer} (${why}${detail})`
}

/**
 * What a build could not check, by finalizer. Printed with every DOCX build so nobody assumes more was verified.
 */
export function notVerified(finalizer: Finalizer): string[] {
  const breaks = 'page breaks, figure placement and Thai line breaks as Microsoft Word lays them out (the PDF build is laid out separately, by Chromium)'
  switch (finalizer) {
    case 'word':
      return []
    case 'libreoffice':
      return [
        `${breaks}; LibreOffice laid the file out, and Microsoft Word may move a line or a figure, so a list entry can be off by a page`,
        'that the file looks the same in Microsoft Word after LibreOffice saved it (open it in Word once before delivery)',
      ]
    case 'none':
      return [
        'page numbers in the contents and figure/table lists (no word processor ran; Word fills them when the reader agrees to update fields on opening)',
        breaks,
      ]
  }
}

/** execFile with a hard deadline: a killed osascript can hang while exiting, so do not wait for its close event. */
const run = (cmd: string, args: string[], timeout: number) =>
  new Promise<{ ok: boolean; out: string }>((resolve) => {
    const child = execFile(cmd, args, { timeout, encoding: 'utf8' }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: (stdout + stderr).trim() || (err?.message ?? '') }),
    )
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ ok: false, out: `timed out after ${Math.round(timeout / 1000)}s (a dialog may be open)` })
    }, timeout + 5_000)
    timer.unref()
  })

/** Copy for Word without the update-on-open flag (it makes Word ask a question, which blocks automation). */
function quietCopy(src: string, dest: string) {
  const files = unzipSync(new Uint8Array(readFileSync(src)))
  const settings = parsePart(files, 'word/settings.xml')
  if (settings) {
    for (const u of all(settings, 'updateFields')) u.parentNode!.removeChild(u)
    writePart(files, 'word/settings.xml', settings)
  }
  writeFileSync(dest, zipSync(files))
}

/**
 * Open the DOCX in Microsoft Word, update every table of contents / figure list, save it back as DOCX and
 * also export a PDF of Word's layout (for review). Files go through Word's own container folder, so the
 * sandbox never asks for file access. Returns an error message instead of throwing.
 */
export async function finalizeWithWord(docx: string, pdfOut: string, timeoutMs = 180_000): Promise<{ ok: boolean; message: string }> {
  const work = join(homedir(), 'Library/Containers/com.microsoft.Word/Data/manual-kit')
  mkdirSync(work, { recursive: true })
  const name = `mk-${process.pid}-${Date.now()}-${basename(docx)}`
  const input = join(work, name)
  const output = join(work, `out-${name}`)
  const pdf = join(work, `${name}.pdf`)
  quietCopy(docx, input)
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const script = `
with timeout of ${Math.round(timeoutMs / 1000) - 10} seconds
  tell application "Microsoft Word"
    set display alerts to alerts none
    open ((POSIX file "${esc(input)}") as alias)
    set tries to 0
    repeat until (exists document "${esc(name)}") or tries > 60
      delay 0.5
      set tries to tries + 1
    end repeat
    set d to document "${esc(name)}"
    repeat with i from 1 to (count of tables of contents of d)
      update (table of contents i of d)
    end repeat
    repeat with i from 1 to (count of tables of figures of d)
      update (table of figures i of d)
    end repeat
    save as d file name "${esc(pdf)}" file format format PDF
    set d to document 1 whose full name contains "${esc(name)}"
    save as d file name "${esc(output)}" file format format document
    close (document 1 whose full name contains "${esc(`out-${name}`)}") saving no
  end tell
end timeout`
  const r = await run('osascript', ['-e', script], timeoutMs)
  try {
    if (!r.ok || !existsSync(output)) return { ok: false, message: r.out || 'Word did not produce the file' }
    copyFileSync(output, docx)
    if (existsSync(pdf)) copyFileSync(pdf, pdfOut)
    return { ok: true, message: 'ok' }
  } finally {
    for (const f of [input, output, pdf]) rmSync(f, { force: true })
  }
}

/** LibreOffice's Python (it has the uno module): MANUAL_KIT_SOFFICE_PYTHON, next to soffice, or a python3 that imports uno. */
export function findUnoPython(soffice: string): string | null {
  const fromEnv = process.env.MANUAL_KIT_SOFFICE_PYTHON
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null
  let dir = dirname(soffice)
  try {
    dir = dirname(realpathSync(soffice))
  } catch {
    // keep the given path
  }
  for (const c of [join(dir, 'python'), join(dir, '..', 'Resources', 'python'), join(dir, 'python.exe')]) if (existsSync(c)) return c
  const r = spawnSync('python3', ['-c', 'import uno'], { stdio: 'ignore' })
  return r.status === 0 ? 'python3' : null
}

const UNO_SCRIPT = fileURLToPath(new URL('libreoffice/finalize.py', ASSETS))

/**
 * Lay the DOCX out with a private headless LibreOffice, update every index and field, save it back as DOCX and
 * export LibreOffice's PDF (for review). Uses its own profile folder, so a LibreOffice the user has open is untouched.
 */
export async function finalizeWithLibreOffice(docx: string, pdfOut: string, soffice: string, timeoutMs = 180_000): Promise<{ ok: boolean; message: string; indexes: number }> {
  const python = findUnoPython(soffice)
  if (!python) return { ok: false, message: "LibreOffice's Python with the uno module was not found (Debian/Ubuntu: apt install python3-uno)", indexes: 0 }
  const work = mkdtempSync(join(tmpdir(), 'manual-kit-lo-'))
  const input = join(work, 'in.docx')
  const output = join(work, 'out.docx')
  const pdf = join(work, 'out.pdf')
  try {
    quietCopy(docx, input)
    const r = await run(python, [UNO_SCRIPT, soffice, input, output, pdf, join(work, 'profile')], timeoutMs)
    if (!r.ok || !existsSync(output)) return { ok: false, message: r.out || 'LibreOffice did not produce the file', indexes: 0 }
    copyFileSync(output, docx)
    if (existsSync(pdf)) copyFileSync(pdf, pdfOut)
    return { ok: true, message: 'ok', indexes: Number(/indexes=(\d+)/.exec(r.out)?.[1] ?? 0) }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
