import type { Note } from './musicxml'

export type Phrase = { start: number; end: number; notes: Note[]; text: string }

const CJK = /[㐀-鿿豈-﫿]/

// 休止 ≥ 1 拍就斷句；短休止（例如斷奏的八分休止符）只在這句已經唱滿 4 拍時才斷。
// ponytail: 規則很陽春，斷得不好再到 song.json 加手動斷句
export function splitPhrases(notes: Note[]): Phrase[] {
  const out: Phrase[] = []
  let cur: Note[] = []
  const flush = () => {
    if (!cur.length) return
    const last = cur[cur.length - 1]
    out.push({ start: cur[0].start, end: last.start + last.dur, notes: cur, text: lyricText(cur) })
    cur = []
  }
  for (const n of notes) {
    if (n.midi === null) continue
    const last = cur[cur.length - 1]
    const gap = last ? n.start - (last.start + last.dur) : 0
    if (gap >= 1 - 1e-6 || (gap > 1e-6 && last.start + last.dur - cur[0].start >= 4)) flush()
    cur.push(n)
  }
  flush()
  return out
}

export function lyricText(notes: Note[]): string {
  let s = ''
  for (const n of notes) {
    if (!n.lyric) continue
    const glue = n.syllabic === 'begin' || n.syllabic === 'middle'
    s += n.lyric + (glue ? '' : ' ')
  }
  // 中文字之間不留空白
  return s.trim().replace(/\s+/g, (sp, i: number, all: string) => (CJK.test(all[i - 1]) && CJK.test(all[i + sp.length]) ? '' : ' '))
}

// 提示：每個詞只露出第一個字/字母，其餘遮住（中文用 ○、拼音文字用 _）
export function hint(line: string): string {
  return line
    .split(/(\s+)/)
    .map((w) => {
      let first = true
      return Array.from(w)
        .map((c) => {
          if (!/\p{L}/u.test(c)) return c
          if (first) {
            first = false
            return c
          }
          return CJK.test(c) ? '○' : '_'
        })
        .join('')
    })
    .join('')
}
