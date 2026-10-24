import { execFileSync } from 'node:child_process'

/** Text of a PDF with pages separated by form feeds (poppler's pdftotext). */
export function pdfText(file: string): string {
  return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' })
}
export const pdfPages = (file: string) => pdfText(file).split('\f').filter((p) => p.trim()).length
