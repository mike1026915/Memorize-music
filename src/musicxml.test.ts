import { describe, expect, it } from 'vitest'
import { parseMusicXML } from './musicxml'
import { hint, lyricText, splitPhrases } from './phrases'
import { beatToSec, secToBeat } from './player'

const doc = (measures: string, extra = '') => `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Bass</part-name></score-part></part-list>
  <part id="P1">${measures}</part>${extra}
</score-partwise>`

const n = (step: string, oct: number, dur: number, o: { voice?: number; lyric?: string; syl?: string; tie?: string; chord?: boolean } = {}) =>
  `<note>${o.chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${oct}</octave></pitch><duration>${dur}</duration>` +
  (o.tie ? `<tie type="${o.tie}"/>` : '') +
  `<voice>${o.voice ?? 1}</voice>` +
  (o.lyric ? `<lyric number="1"><syllabic>${o.syl ?? 'single'}</syllabic><text>${o.lyric}</text></lyric>` : '') +
  `</note>`
const r = (dur: number, voice = 1) => `<note><rest/><duration>${dur}</duration><voice>${voice}</voice></note>`
const attrs = `<attributes><divisions>1</divisions></attributes>`
const m = (num: number, body: string, bar = '') => `<measure number="${num}">${num === 1 ? attrs : ''}${body}${bar}</measure>`
const midis = (s: string, voice = '1') => parseMusicXML(s).parts[0].voices[voice].map((x) => x.midi)

describe('parseMusicXML', () => {
  it('依 backup 拆開同一譜表上的兩個 voice', () => {
    const x = doc(m(1, n('E', 3, 2, { lyric: '上' }) + n('G', 3, 2) + '<backup><duration>4</duration></backup>' + n('C', 3, 4, { voice: 2 })))
    const v = parseMusicXML(x).parts[0].voices
    expect(v['1'].map((x) => [x.start, x.midi, x.lyric])).toEqual([[0, 52, '上'], [2, 55, undefined]])
    expect(v['2'].map((x) => [x.start, x.dur, x.midi])).toEqual([[0, 4, 48]])
  })

  it('合併連結線，歌詞只留第一個音', () => {
    const x = doc(m(1, n('C', 3, 2) + n('D', 3, 2, { tie: 'start', lyric: '長' })) + m(2, n('D', 3, 2, { tie: 'stop' }) + r(2)))
    const v = parseMusicXML(x).parts[0].voices['1']
    expect(v.map((x) => [x.start, x.dur, x.midi, x.lyric])).toEqual([[0, 2, 48, undefined], [2, 4, 50, '長'], [6, 2, null, undefined]])
  })

  it('和弦：預設取最高音，-low 取最低音', () => {
    const x = doc(m(1, n('C', 3, 4) + n('E', 3, 4, { chord: true })))
    const s = parseMusicXML(x)
    expect(midis(x)).toEqual([52])
    expect(midis(x, '1-low')).toEqual([48])
    expect(s.warnings.join()).toContain('和弦')
  })

  it('展開反覆記號與一房/二房', () => {
    const fwd = '<barline location="left"><repeat direction="forward"/></barline>'
    const e1 = '<barline location="left"><ending number="1" type="start"/></barline>'
    const e1end = '<barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>'
    const e2 = '<barline location="left"><ending number="2" type="start"/></barline>'
    const e2end = '<barline location="right"><ending number="2" type="discontinue"/></barline>'
    const x = doc(
      m(1, n('C', 3, 4)) +
        `<measure number="2">${fwd}${n('D', 3, 4)}</measure>` +
        `<measure number="3">${e1}${n('E', 3, 4)}${e1end}</measure>` +
        `<measure number="4">${e2}${n('F', 3, 4)}${e2end}</measure>` +
        m(5, n('G', 3, 4)),
    )
    const v = parseMusicXML(x).parts[0].voices['1']
    expect(v.map((x) => x.measure)).toEqual(['1', '2', '3', '2', '4', '5'])
    expect(v.map((x) => x.start)).toEqual([0, 4, 8, 12, 16, 20])
  })

  it('套用 transpose 的八度移調', () => {
    const x = doc(`<measure number="1"><attributes><divisions>1</divisions><transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose></attributes>${n('C', 4, 4)}</measure>`)
    expect(midis(x)).toEqual([48])
  })

  it('讀取速度，格式錯誤時丟出錯誤', () => {
    const x = doc(`<measure number="1">${attrs}<direction><sound tempo="72"/></direction>${n('C', 3, 4)}</measure>`)
    expect(parseMusicXML(x).tempos).toEqual([{ beat: 0, bpm: 72 }])
    expect(() => parseMusicXML('<oops')).toThrow()
  })
})

describe('速度變化', () => {
  it('解析各小節的速度標記，並在拍與秒之間換算', () => {
    const t = (bpm: number) => `<direction><sound tempo="${bpm}"/></direction>`
    const x = doc(m(1, t(60) + n('C', 3, 4)) + m(2, t(120) + n('D', 3, 4)) + m(3, t(120) + n('E', 3, 4)))
    const tempos = parseMusicXML(x).tempos
    expect(tempos).toEqual([{ beat: 0, bpm: 60 }, { beat: 4, bpm: 120 }])
    expect(beatToSec(tempos, 4)).toBe(4)
    expect(beatToSec(tempos, 8)).toBe(6)
    expect(beatToSec(tempos, -2)).toBe(-2)
    for (const b of [-1, 0, 3, 4, 6.5]) expect(secToBeat(tempos, beatToSec(tempos, b))).toBeCloseTo(b)
  })
})

describe('phrases', () => {
  it('遇到休止符斷句，中文字直接相連、拼音文字依 syllabic 連接', () => {
    const x = doc(
      m(1, n('C', 3, 1, { lyric: '每' }) + n('D', 3, 1, { lyric: '天' }) + r(1) + n('E', 3, 1, { lyric: 'Glo', syl: 'begin' })) +
        m(2, n('F', 3, 1, { lyric: 'ri', syl: 'middle' }) + n('G', 3, 1, { lyric: 'a', syl: 'end' }) + n('A', 3, 1, { lyric: 'in' }) + n('B', 3, 1, { lyric: 'ex' })),
    )
    const p = splitPhrases(parseMusicXML(x).parts[0].voices['1'])
    expect(p.map((x) => [x.start, x.end, x.text])).toEqual([[0, 2, '每天'], [3, 8, 'Gloria in ex']])
  })

  it('lyricText 忽略沒有歌詞的延長音', () => {
    expect(lyricText([{ start: 0, dur: 1, midi: 48, lyric: '啊', measure: '1' }, { start: 1, dur: 1, midi: 50, measure: '1' }])).toBe('啊')
  })

  it('hint 只露出每個詞的第一個字', () => {
    expect(hint('茉莉花開')).toBe('茉○○○')
    expect(hint('Gloria in excelsis!')).toBe('G_____ i_ e_______!')
  })
})

describe('MuseScore 實際匯出的示範曲', () => {
  it('Bass 1 依反覆順序斷句、Tenor 有正確八度', async () => {
    const { readFileSync } = await import('node:fs')
    const s = parseMusicXML(readFileSync('public/songs/demo/score.musicxml', 'utf8'))
    const bass = s.parts.find((p) => p.id === 'P2')!
    expect(s.tempos).toEqual([{ beat: 0, bpm: 84 }])
    expect(splitPhrases(bass.voices['1']).map((p) => p.text)).toEqual(['每天練習背旋律再唱', '背旋律一次'])
    expect(splitPhrases(bass.voices['2']).map((p) => p.text)).toEqual(['每天練習背譜再唱', '背譜一次'])
    expect(s.parts[0].voices['1'].find((n) => n.midi !== null)!.midi).toBe(52) // E3
  })
})

describe('斷句規則', () => {
  const note = (start: number, dur: number, lyric: string) => ({ start, dur, midi: 48, lyric, measure: '1' })
  it('斷奏的短休止不斷句，滿 4 拍後的短休止才斷', () => {
    const p = splitPhrases([note(0, 0.5, '恰'), note(1, 0.5, '恰'), note(2, 0.5, '恰'), note(3, 2, '啊'), note(5.5, 1, '再'), note(8, 1, '來')])
    expect(p.map((x) => x.text)).toEqual(['恰恰恰啊', '再', '來'])
  })
})
