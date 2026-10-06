// 把 public/songs/*/*.mscz 轉成 .musicxml（只轉有變動的），並重新產生 public/songs/index.json
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'public/songs'
const MSCORE = process.env.MSCORE ?? '/Applications/MuseScore 4.app/Contents/MacOS/mscore'

const index = []
for (const id of readdirSync(DIR).filter((d) => statSync(join(DIR, d)).isDirectory()).sort()) {
  const dir = join(DIR, id)
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.mscz'))) {
    const src = join(dir, f)
    const out = src.replace(/\.mscz$/, '.musicxml')
    if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) continue
    console.log(`轉檔 ${src}`)
    execFileSync(MSCORE, ['-o', out, src], { stdio: 'inherit' })
  }

  const metaPath = join(dir, 'song.json')
  if (!existsSync(metaPath)) {
    console.warn(`略過 ${id}：沒有 song.json`)
    continue
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
  index.push({
    id,
    title: meta.title ?? id,
    hasScore: !!meta.score,
    voices: [...new Set([...Object.keys(meta.parts ?? {}), ...Object.keys(meta.lyrics ?? {})])],
  })

  // 印出樂譜裡的 part 與 voice，方便填寫 song.json 的 parts
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.musicxml'))) {
    const xml = readFileSync(join(dir, f), 'utf8')
    const names = Object.fromEntries([...xml.matchAll(/<score-part id="([^"]+)">[\s\S]*?<part-name[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]))
    console.log(`${id}/${f}`)
    for (const [, pid, body] of xml.matchAll(/<part id="([^"]+)">([\s\S]*?)<\/part>/g)) {
      const voices = [...new Set([...body.matchAll(/<voice>([^<]+)</g)].map((v) => v[1]))]
      console.log(`  part "${pid}"（${names[pid] ?? '?'}）voice: ${voices.join(', ')}`)
    }
  }
}
writeFileSync(join(DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n')
console.log(`已更新 ${DIR}/index.json（${index.length} 首）`)
