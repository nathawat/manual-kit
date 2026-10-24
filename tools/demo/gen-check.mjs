// Scene "check": docs/manual/terminal/check-drift.txt (manual-kit check on the example class system) as a terminal -> WORK/site/check.html
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO, WORK } from './paths.mjs'
mkdirSync(join(WORK, 'site'), { recursive: true })
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const lines = readFileSync(join(REPO, 'docs/manual/terminal/check-drift.txt'), 'utf8').trimEnd().split('\n').filter(l => !l.startsWith('$'))
const body = lines.map(l => { const cls = l.startsWith('error') ? 'e' : l.startsWith('warning') ? 'w' : 's'; return `<div class="l ${cls}">${esc(l).replace(/^(error|warning)/, '<b>$1</b>')}</div>` }).join('')
writeFileSync(join(WORK, 'site/check.html'), `<!doctype html><html lang="th"><head><meta charset="utf-8"><link rel="stylesheet" href="/common.css"><style>
body { background: #e9edf4; display: grid; place-items: center; }
.win { width: 1230px; height: 600px; background: #11161f; border-radius: 12px; overflow: hidden; position: relative; box-shadow: 0 20px 50px rgba(15,27,45,.35); }
.bar { height: 34px; background: #1c2330; display: flex; align-items: center; padding: 0 14px; gap: 8px; color: #8b97ab; font: 13px Menlo, monospace; }
.bar i { width: 11px; height: 11px; border-radius: 50%; background: #ff5f57 } .bar i:nth-child(2) { background: #febc2e } .bar i:nth-child(3) { background: #28c840 }
.body { padding: 22px 26px; font: 17px/1.6 Menlo, 'Plex', monospace; color: #cfd8e6; }
.cmd { color: #fff; margin-bottom: 10px; font-size: 19px; } .cmd span { color: #f6a77f }
.l { opacity: 0; transition: opacity .2s; white-space: pre-wrap; padding-left: 9ch; text-indent: -9ch; } .l.on { opacity: 1 }
.l.e b { color: #ff7b72; font-weight: 600 } .l.w b { color: #e3b341; font-weight: 600 } .l.s { color: #fff; font-weight: 600 }
.next { position: absolute; left: 50%; bottom: 26px; transform: translate(-50%, 20px); opacity: 0; transition: all .5s; background: #fff; color: var(--ink); border-radius: 12px; padding: 14px 26px; box-shadow: 0 12px 40px rgba(0,0,0,.5); font: 600 22px 'Plex'; white-space: nowrap; border-left: 6px solid #d9480f; }
.next.on { opacity: 1; transform: translate(-50%, 0); } .next code { font: 600 20px Menlo, monospace; color: var(--brand); background: #eef2fb; padding: 2px 8px; border-radius: 6px; }
</style></head><body><div class="win"><div class="bar"><i></i><i></i><i></i><span style="margin-left:10px">ตัวอย่าง: ระบบจัดชั้นเรียน (ข้อมูลสมมติ)</span></div>
<div class="body"><div class="cmd"><span>$</span> manual-kit check</div>${body}</div>
<div class="next" id="next">ระบบเปลี่ยน: <code>/manual update</code> แก้เฉพาะหน้าที่กระทบ</div></div>
<script>const ls = [...document.querySelectorAll('.l')]; ls.forEach((l, i) => setTimeout(() => l.classList.add('on'), 300 + i * 140)); window.step2 = () => document.getElementById('next').classList.add('on')</script>
</body></html>`)
