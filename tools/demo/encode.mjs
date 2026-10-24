// Frames + timeline -> MP4 (H.264/AAC, 30 fps): the narration of each scene at its start, a soft pad (compose.py)
// under it, a WebVTT of the captions and a poster. Usage: node encode.mjs [out.mp4]
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { HERE, WORK } from './paths.mjs'
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
const out = resolve(process.argv[2] ?? join(HERE, '../../docs/media/manual-kit-demo.mp4'))
mkdirSync(dirname(out), { recursive: true })
process.chdir(WORK)
const { frames, cues, total } = JSON.parse(readFileSync('timeline.json', 'utf8'))
const lines = frames.map((f, i) => `file 'frames/${f.name}'\nduration ${(((frames[i + 1]?.t ?? total) - f.t) / 1000).toFixed(4)}`)
lines.push(`file 'frames/${frames.at(-1).name}'`)
writeFileSync('frames.txt', lines.join('\n') + '\n')
const secs = total / 1000
execFileSync('python3', [join(HERE, 'compose.py'), String(Math.ceil(secs) + 1), 'music.wav'], { stdio: 'inherit' })
// narration: each scene's file delayed to its start; the music is quiet and ducks further while the voice speaks
const voices = cues.map((c) => ['-i', `voice/s${c.n}.mp3`]).flat()
const delayed = cues.map((c, i) => `[${i + 2}:a]aresample=48000,adelay=${Math.round(c.voice)}:all=1[v${i}]`).join(';')
const mix = `${delayed};${cues.map((_, i) => `[v${i}]`).join('')}amix=inputs=${cues.length}:normalize=0,asplit=2[voice][key];[1:a]aresample=48000,volume=0.12[music];[music][key]sidechaincompress=threshold=0.015:ratio=6:attack=30:release=700[bed];[voice][bed]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]`
execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'frames.txt', '-i', 'music.wav', ...voices,
  '-filter_complex', `[0:v]fps=30,format=yuv420p,fade=t=in:st=0:d=0.5,fade=t=out:st=${(secs - 0.9).toFixed(2)}:d=0.9[v];${mix}`,
  '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
  '-t', secs.toFixed(3), '-movflags', '+faststart', '-map_metadata', '-1', out], { stdio: 'inherit' })
const ts = (ms) => { const s = ms / 1000; return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${(s % 60).toFixed(3).padStart(6, '0')}` }
writeFileSync(out.replace(/\.mp4$/, '.th.vtt'), `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${ts(c.voice)} --> ${ts(c.end)}\n${c.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}\n`).join('\n')}`)
// poster: the title scene once its animation has settled
execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '3', '-i', out, '-frames:v', '1', '-q:v', '3', out.replace(/\.mp4$/, '-poster.jpg')], { stdio: 'inherit' })
console.log('ok', secs, out)
