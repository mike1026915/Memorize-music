import { describe, expect, it } from 'vitest'
import type { Note } from './musicxml'
import type { Phrase } from './phrases'
import { addDays, bumpStreak, makeLesson, pieces, review } from './quiz'

describe('lesson', () => {
  const lines = ['我愛你', '你愛我', '副歌來了', '我愛你', '再見了朋友', 'hello my friend']

  it('切塊：中文兩字一塊、英文按詞', () => {
    expect(pieces('再見了朋友').join('|')).toBe('再見|了朋|友')
    expect(pieces('hello my friend').filter((p) => p.trim())).toEqual(['hello', 'my', 'friend'])
  })

  it('每題答案都在選項裡、選項不重複，且重複歌詞後面接的句子不會被當錯誤選項', () => {
    for (let seed = 0; seed < 50; seed++) {
      const qs = makeLesson(lines, {})
      for (const q of qs) {
        expect(q.options).toContain(q.answer)
        expect(new Set(q.options).size).toBe(q.options.length)
        if (q.prompt === '我愛你') expect(q.options.filter((o) => o === '你愛我' || o === '再見了朋友')).toEqual([q.answer])
      }
    }
  })

  it('忘記的句子優先出題', () => {
    const qs = makeLesson(lines, { 'hello my friend': 'miss', 我愛你: 'ok', 你愛我: 'ok' })
    expect(new Set(qs.map((q) => q.line))).toEqual(new Set(['hello my friend', '副歌來了', '再見了朋友', '我愛你', '你愛我']))
    expect(makeLesson(['只有一句'], {}).some((q) => q.ask === '第一句是？')).toBe(false)
  })

  it('聽旋律選句：旋律一樣的句子不當錯誤選項', () => {
    const ph = (text: string, midis: number[]): Phrase => ({ text, start: 0, end: 1, notes: midis.map((midi, i) => ({ midi, start: i, dur: 1 }) as Note) })
    const phrases = [ph('第一段歌詞', [60, 62]), ph('第二段歌詞', [60, 62]), ph('副歌高音', [67, 69])]
    const lines = phrases.map((p) => p.text)
    for (let i = 0; i < 20; i++) {
      const q = makeLesson(lines, {}, Math.random, phrases).find((q) => q.melody && q.answer === '第一段歌詞')!
      expect(q.options.sort()).toEqual(['副歌高音', '第一段歌詞'])
    }
  })

  it('間隔重複：答對間隔加倍、答錯隔天，到期的句子優先出題', () => {
    const c1 = review(undefined, true, '2026-10-06')
    expect(c1).toEqual({ box: 0, due: '2026-10-07' })
    const c2 = review(c1, true, '2026-10-07')
    expect(c2).toEqual({ box: 1, due: '2026-10-09' })
    expect(review(review(c2, true, '2026-10-09'), true, '2026-10-13').due).toBe('2026-10-21')
    expect(review(c2, false, '2026-10-09')).toEqual({ box: 0, due: '2026-10-10' })
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')

    const many = ['一一', '二二', '三三', '四四', '五五', '六六', '七七']
    const srs = { 一一: { box: 2, due: '2026-10-20' }, 七七: { box: 0, due: '2026-10-06' } }
    const picked = new Set(makeLesson(many, {}, Math.random, [], srs, '2026-10-06').map((q) => q.line))
    expect(picked).toEqual(new Set(['七七', '二二', '三三', '四四', '五五']))
  })

  it('連續天數', () => {
    expect(bumpStreak({ day: '2026-10-05', n: 3 }, '2026-10-06', '2026-10-05')).toEqual({ day: '2026-10-06', n: 4 })
    expect(bumpStreak({ day: '2026-10-06', n: 4 }, '2026-10-06', '2026-10-05').n).toBe(4)
    expect(bumpStreak({ day: '2026-10-01', n: 9 }, '2026-10-06', '2026-10-05').n).toBe(1)
  })
})
