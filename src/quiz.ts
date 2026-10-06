import type { Note } from './musicxml'
import { CJK, type Phrase } from './phrases'

export type Question = { line: string; prompt: string; ask: string; answer: string; options: string[]; melody?: Note[] }
export type Marks = Record<string, 'ok' | 'miss'>
export type Streak = { day: string; n: number }
// 間隔重複（Leitner 盒子）：一次就答對的句子往下一盒，間隔加倍；答錯回第 0 盒，隔天再考
export type Card = { box: number; due: string }
export type Srs = Record<string, Card>
const INTERVALS = [1, 2, 4, 8, 16, 32] // 天

const LINES_PER_LESSON = 5

export function shuffle<T>(a: T[], rnd = Math.random): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

const pickOptions = (answer: string, pool: string[], rnd: () => number) => {
  const wrong = shuffle([...new Set(pool)].filter((p) => p !== answer), rnd).slice(0, 3)
  return wrong.length ? shuffle([answer, ...wrong], rnd) : null
}

// 拼音文字按空白切詞，中文每兩個字一塊；保留空白方便組回原句
export const pieces = (line: string) => line.split(/(\s+)/).flatMap((w) => (CJK.test(w) ? (w.match(/.{1,2}/gu) ?? []) : [w]))
const isWord = (p: string) => /\S/.test(p)

const tune = (p: Phrase) => p.notes.map((n) => `${n.midi}:${n.dur}`).join()

export function review(card: Card | undefined, right: boolean, day: string): Card {
  const box = right ? Math.min((card?.box ?? -1) + 1, INTERVALS.length - 1) : 0
  return { box, due: addDays(day, INTERVALS[box]) }
}
export const dueCount = (srs: Srs, day = today()) => Object.values(srs).filter((c) => c.due <= day).length

// 每句出兩題：「下一句是？」和填空；有樂譜的話再加一題聽旋律選句。
// 選句順序：到期該複習的 → 沒練過的（照歌曲順序）→ 還沒到期的（越早到期越前面）。
// 舊資料只有「記得／忘了」沒有複習日期時，忘了的當作到期。
export function makeLesson(lines: string[], marks: Marks, rnd = Math.random, phrases: Phrase[] = [], srs: Srs = {}, day = today()): Question[] {
  const rank = (l: string) => (srs[l] ? (srs[l].due <= day ? 0 : 2) : marks[l] === 'miss' ? 0 : marks[l] === 'ok' ? 2 : 1)
  const due = (l: string) => srs[l]?.due ?? ''
  const picked = [...new Set(lines)]
    .sort((a, b) => rank(a) - rank(b) || due(a).localeCompare(due(b)) || lines.indexOf(a) - lines.indexOf(b))
    .slice(0, LINES_PER_LESSON)
  const allPieces = lines.flatMap(pieces).filter(isWord)
  const qs: Question[] = []
  for (const line of picked) {
    const i = lines.indexOf(line)
    const prev = i > 0 ? lines[i - 1] : null
    // 重複的歌詞（副歌）後面可能接不同句，那些都算對，不能拿來當錯誤選項
    const alsoRight = new Set(lines.filter((_, j) => (j > 0 ? lines[j - 1] : null) === prev))
    const next = pickOptions(line, lines.filter((l) => !alsoRight.has(l)), rnd)
    if (next) qs.push({ line, prompt: prev ?? '（歌曲開頭）', ask: prev ? '下一句是？' : '第一句是？', answer: line, options: next })

    const ph = phrases.find((p) => p.text === line)
    if (ph) {
      // 旋律一模一樣的句子（例如第二段歌詞）聽不出差別，不能當錯誤選項
      const same = new Set(phrases.filter((p) => tune(p) === tune(ph)).map((p) => p.text))
      const opts = pickOptions(line, lines.filter((l) => !same.has(l)), rnd)
      if (opts) qs.push({ line, prompt: '🎵', ask: '聽旋律，這是哪一句？', answer: line, options: opts, melody: ph.notes })
    }

    const ps = pieces(line)
    const words = ps.map((p, k) => k).filter((k) => isWord(ps[k]))
    if (words.length < 2) continue
    const k = words[Math.floor(rnd() * words.length)]
    const blank = pickOptions(ps[k], allPieces, rnd)
    if (blank) qs.push({ line, prompt: ps.map((p, j) => (j === k ? '＿'.repeat(Array.from(p).length) : p)).join(''), ask: '空格裡是？', answer: ps[k], options: blank })
  }
  return shuffle(qs, rnd)
}

export function bumpStreak(s: Streak, today: string, yesterday: string): Streak {
  if (s.day === today) return s
  return { day: today, n: s.day === yesterday ? s.n + 1 : 1 }
}

const ymd = (d: Date) => d.toLocaleDateString('sv') // 本地時區的 YYYY-MM-DD
export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00`)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
export const today = () => ymd(new Date())
export const yesterday = () => addDays(today(), -1)
export const liveStreak = (s: Streak) => (s.day === today() || s.day === yesterday() ? s.n : 0)
