# Demo video (docs/media/manual-kit-demo.mp4)

Scripts that make the 1:25 demo video at the top of the README. The video is a screen recording of HTML scenes (title,
command, spec, PDF, Word, the manual web site, phone, `check`, install) with Thai narration, the same text as captions
in a band at the bottom, and a soft generated pad under the voice. Every scene shows manual-kit's own manual
(`docs/manual`), except `check`, which shows `docs/manual/terminal/check-drift.txt` (an example class system).

The narration is the only part that uses a paid service: ElevenLabs (Eleven v4 Turbo, voice George) through
OpenRouter's speech API, about 700 characters, under 0.03 USD a take. manual-kit itself has no AI or API key.

| File | Does |
|---|---|
| `narration.tsv` | scene number and narration line. English words stay in English (the voice reads them in English); captions show the typed form (`/manual`, `manual-kit`) |
| `voice.mjs` | narration lines -> `WORK/voice/sN.mp3` (needs `OPENROUTER_API_KEY`) |
| `pages.mjs` | PDF pages of `docs/manual/dist/user-guide.th.pdf` and Word pages (`DEMO_WORD_PDF`) -> `WORK/site/img` |
| `gen-spec.mjs`, `gen-check.mjs` | scenes "spec" (`docs/manual/manual-spec.md`) and "check" -> `WORK/site` |
| `site/` | committed scenes: `stage.html` (1280x720: iframe, caption band, cursor), `title`, `term`, `pdf`, `word`, `end` |
| `serve.mjs` | serves the scenes on 127.0.0.1, `/fonts` from `assets/fonts`, `/web` from `docs/manual/dist/web` |
| `record.mjs` | plays the scenes, each at least as long as its narration, and screenshots the stage (~32 fps) -> `WORK/frames`, `WORK/timeline.json` |
| `compose.py` | the background pad (slow chords, a few bell notes, no drums) |
| `encode.mjs` | frames + narration + pad (ducked under the voice) -> MP4 (H.264/AAC 30 fps), `.th.vtt`, `-poster.jpg` |

## Rebuild

Needs `pnpm install` in the repo, ffmpeg, poppler (`pdftoppm`), python3, a built manual (`manual-kit -m docs/manual
build`), and a PDF of `docs/manual/dist/user-guide.th.docx` saved by Microsoft Word (open it, let Word update the
fields, File > Save As > PDF).

```bash
export DEMO_WORK=/path/to/scratch                    # default: $TMPDIR/mk-demo (~250 MB of frames)
export OPENROUTER_API_KEY=...                        # narration only
node tools/demo/voice.mjs                            # or: node tools/demo/voice.mjs 3 8   (scenes 3 and 8 again)
DEMO_WORD_PDF=/path/to/word.pdf node tools/demo/pages.mjs
node tools/demo/gen-spec.mjs && node tools/demo/gen-check.mjs
node tools/demo/serve.mjs &                          # port 8765 (DEMO_PORT); stop it afterwards
node tools/demo/record.mjs                           # ~85 s; DEMO_SHOTS=1 takes one screenshot per scene instead
node tools/demo/encode.mjs                           # -> docs/media/manual-kit-demo.mp4 (+ .th.vtt, -poster.jpg)
```

Scene timing follows the narration: change a line in `narration.tsv`, run `voice.mjs` for that scene, then record and
encode again. `record.mjs` opens web pages by what they show (the search word "ติดตั้ง", the first result, the first
step's enlarge button); change those lines if the manual's pages change.
