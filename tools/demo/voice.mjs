// Narration: each line of narration.tsv read aloud by ElevenLabs (Eleven v4 Turbo, voice George) through OpenRouter's
// speech API -> WORK/voice/sN.mp3. Needs OPENROUTER_API_KEY. Only the demo video uses a voice; manual-kit itself has none.
// Usage: node voice.mjs [scene numbers...]   (no numbers: every scene)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { HERE, WORK } from './paths.mjs'
const key = process.env.OPENROUTER_API_KEY
if (!key) throw new Error('set OPENROUTER_API_KEY')
const MODEL = process.env.DEMO_TTS_MODEL ?? 'elevenlabs/eleven-v4-turbo'
const VOICE = process.env.DEMO_TTS_VOICE ?? 'George'
mkdirSync(join(WORK, 'voice'), { recursive: true })
const lines = readFileSync(join(HERE, 'narration.tsv'), 'utf8').trim().split('\n').map((l) => l.split('\t'))
const only = process.argv.slice(2)
for (const [n, text] of lines) {
  if (only.length && !only.includes(n)) continue
  const res = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: text, voice: VOICE, response_format: 'mp3' }),
  })
  if (!res.ok) throw new Error(`scene ${n}: ${res.status} ${await res.text()}`)
  writeFileSync(join(WORK, 'voice', `s${n}.mp3`), Buffer.from(await res.arrayBuffer()))
  console.log(`s${n}.mp3`, text.length, 'characters')
}
