// Size and length of a video file (ffprobe, next to ffmpeg).
import { execFileSync } from 'node:child_process'
import { UsageError } from '../sign.ts'

const FFPROBE = process.env.FFPROBE ?? 'ffprobe'

export function probeVideo(file: string): { width: number; height: number; ms: number } {
  let out: string
  try {
    out = execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], { encoding: 'utf8' })
  } catch (e) {
    throw new UsageError(`ffprobe could not read ${file} (install ffmpeg, or set FFPROBE): ${(e as Error).message.split('\n')[0]}`)
  }
  const j = JSON.parse(out) as { streams?: { width: number; height: number }[]; format?: { duration?: string } }
  const s = j.streams?.[0]
  if (!s) throw new UsageError(`${file} has no video stream`)
  return { width: s.width, height: s.height, ms: Math.round(Number(j.format?.duration ?? 0) * 1000) }
}

/** Whether a video file has a sound track. */
export function hasAudio(file: string): boolean {
  const out = execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file], { encoding: 'utf8' })
  return out.trim() !== ''
}
