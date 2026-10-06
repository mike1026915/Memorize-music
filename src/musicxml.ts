// MusicXML (score-partwise) → 每個 part、每個 voice 的音符列表。時間單位：四分音符。
export type Note = {
  start: number
  dur: number
  midi: number | null // null = 休止符
  lyric?: string
  syllabic?: string
  measure: string
}
export type Part = { id: string; name: string; voices: Record<string, Note[]> }
export type Tempo = { beat: number; bpm: number }
export type Score = { tempos: Tempo[]; parts: Part[]; warnings: string[] }

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const EPS = 1e-6

const kids = (el: Element, tag: string) => Array.from(el.children).filter((c) => c.tagName === tag)
const kid = (el: Element, tag: string): Element | undefined => kids(el, tag)[0]
const num = (el: Element, tag: string, d = 0) => {
  const k = kid(el, tag)
  return k ? Number(k.textContent) : d
}

export function parseMusicXML(text: string): Score {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('MusicXML 格式錯誤')
  const root = doc.documentElement
  if (root.tagName !== 'score-partwise') throw new Error('只支援 score-partwise 格式的 MusicXML')

  const warnings: string[] = []
  const names = new Map<string, string>()
  for (const sp of Array.from(root.getElementsByTagName('score-part'))) {
    const id = sp.getAttribute('id') ?? ''
    names.set(id, kid(sp, 'part-name')?.textContent?.trim() || id)
  }
  const partEls = kids(root, 'part')
  if (!partEls.length) throw new Error('MusicXML 裡沒有任何聲部')
  if (root.querySelector('sound[dalsegno], sound[dacapo], sound[tocoda], sound[coda], sound[segno]'))
    warnings.push('偵測到 D.S./D.C./Coda，目前依譜面順序播放，不會跳段')

  const order = playOrder(kids(partEls[0], 'measure'))
  const byBeat = new Map<number, number>()
  const parts = partEls.map((p) => {
    const id = p.getAttribute('id') ?? ''
    const name = names.get(id) ?? id
    const { voices, tempos } = parsePart(p, name, order, warnings)
    for (const t of tempos) byBeat.set(t.beat, t.bpm)
    return { id, name, voices }
  })
  // 速度標記可能分散在不同聲部，合併後依拍數排序，去掉重複的速度
  const tempos: Tempo[] = []
  for (const [beat, bpm] of [...byBeat].sort((a, b) => a[0] - b[0])) if (tempos.at(-1)?.bpm !== bpm) tempos.push({ beat, bpm })
  if (!tempos.length || tempos[0].beat > 0) tempos.unshift({ beat: 0, bpm: tempos[0]?.bpm ?? metronome(root) })
  return { tempos, parts, warnings: [...new Set(warnings)] }
}

// 展開反覆記號與一房/二房，回傳實際演奏的小節索引順序
export function playOrder(measures: Element[]): number[] {
  const order: number[] = []
  const taken = new Map<number, number>()
  const barlines = (i: number) => kids(measures[i], 'barline')
  const endingType = (b: Element) => kid(b, 'ending')?.getAttribute('type') ?? ''
  let start = 0
  let pass = 1
  for (let i = 0; i < measures.length; ) {
    const bars = barlines(i)
    if (i !== start && bars.some((b) => kid(b, 'repeat')?.getAttribute('direction') === 'forward')) {
      start = i
      pass = 1
    }
    const ending = bars.map((b) => kid(b, 'ending')).find((e) => e?.getAttribute('type') === 'start')
    if (ending) {
      const nums = (ending.getAttribute('number') ?? '1').split(/[,\s]+/).filter(Boolean).map(Number)
      if (!nums.includes(pass)) {
        let j = i
        while (j < measures.length - 1 && !barlines(j).some((b) => ['stop', 'discontinue'].includes(endingType(b)))) j++
        i = j + 1
        continue
      }
    }
    order.push(i)
    const back = bars.map((b) => kid(b, 'repeat')).find((r) => r?.getAttribute('direction') === 'backward')
    if (back) {
      const times = Number(back.getAttribute('times') ?? 2)
      const t = taken.get(i) ?? 0
      if (t < times - 1) {
        taken.set(i, t + 1)
        pass++
        i = start
        continue
      }
      start = i + 1
      pass = 1
    } else if (bars.some((b) => ['stop', 'discontinue'].includes(endingType(b)))) {
      // 最後一房結束，回到一般狀態
      start = i + 1
      pass = 1
    }
    i++
  }
  return order
}

type Ev = { voice: string; start: number; dur: number; midi: number | null; chord: boolean; tieStop: boolean; lyric?: string; syllabic?: string }
type Slot = Note & { midis: number[] }

function parsePart(p: Element, name: string, order: number[], warnings: string[]): { voices: Record<string, Note[]>; tempos: Tempo[] } {
  let divisions = 1
  let transpose = 0
  // 第一輪：依文件順序讀每個小節（attributes 是有狀態的）
  const local = kids(p, 'measure').map((m, idx) => {
    const evs: Ev[] = []
    const tempos: { pos: number; bpm: number }[] = []
    let pos = 0
    let len = 0
    let lastStart = 0
    for (const el of Array.from(m.children)) {
      if (el.tagName === 'attributes') {
        divisions = num(el, 'divisions', divisions)
        const t = kid(el, 'transpose')
        if (t) transpose = num(t, 'chromatic') + 12 * num(t, 'octave-change')
      } else if (el.tagName === 'direction' || el.tagName === 'sound') {
        const snd = el.tagName === 'sound' ? el : kid(el, 'sound')
        const bpm = Number(snd?.getAttribute('tempo'))
        if (bpm > 0) tempos.push({ pos, bpm })
      } else if (el.tagName === 'backup') pos -= num(el, 'duration') / divisions
      else if (el.tagName === 'forward') pos += num(el, 'duration') / divisions
      else if (el.tagName === 'note') {
        if (kid(el, 'grace') || kid(el, 'cue')) continue
        const dur = num(el, 'duration') / divisions
        const chord = !!kid(el, 'chord')
        const pitch = kid(el, 'pitch')
        const midi = pitch
          ? (num(pitch, 'octave') + 1) * 12 + (STEP[kid(pitch, 'step')?.textContent?.trim() ?? 'C'] ?? 0) + num(pitch, 'alter') + transpose
          : null
        const lyrics = kids(el, 'lyric')
        const lyr = lyrics.find((l) => (l.getAttribute('number') ?? '1') === '1') ?? lyrics[0]
        evs.push({
          voice: kid(el, 'voice')?.textContent?.trim() || '1',
          start: chord ? lastStart : pos,
          dur,
          midi,
          chord,
          tieStop: kids(el, 'tie').some((t) => t.getAttribute('type') === 'stop'),
          lyric: lyr ? kids(lyr, 'text').map((t) => t.textContent ?? '').join('') || undefined : undefined,
          syllabic: lyr ? kid(lyr, 'syllabic')?.textContent?.trim() : undefined,
        })
        if (!chord) {
          lastStart = pos
          pos += dur
        }
      }
      len = Math.max(len, pos)
    }
    return { evs, tempos, len, number: m.getAttribute('number') ?? String(idx + 1) }
  })

  // 第二輪：照演奏順序排成絕對時間，合併連結線，和弦先收集所有音高
  const slots: Record<string, Slot[]> = {}
  const merged: Record<string, boolean> = {}
  const tempos: Tempo[] = []
  let offset = 0
  for (const i of order) {
    const { evs, len, number } = local[i]
    for (const t of local[i].tempos) tempos.push({ beat: offset + t.pos, bpm: t.bpm })
    for (const e of evs) {
      const list = (slots[e.voice] ??= [])
      const start = offset + e.start
      const prev = list[list.length - 1]
      if (e.chord) {
        if (prev && !merged[e.voice] && Math.abs(prev.start - start) < EPS && e.midi !== null) prev.midis.push(e.midi)
        continue
      }
      if (e.tieStop && prev && e.midi !== null && prev.midis.includes(e.midi) && Math.abs(prev.start + prev.dur - start) < EPS) {
        prev.dur += e.dur
        merged[e.voice] = true
        continue
      }
      merged[e.voice] = false
      list.push({ start, dur: e.dur, midi: e.midi, lyric: e.lyric, syllabic: e.syllabic, measure: number, midis: e.midi === null ? [] : [e.midi] })
    }
    offset += len
  }

  // 和弦：voice 取最高音，另外產生「<voice>-low」取最低音（例如 Bass 1/2 寫在同一個 voice 的和弦）
  const voices: Record<string, Note[]> = {}
  for (const [v, list] of Object.entries(slots)) {
    const pick = (f: (...n: number[]) => number) =>
      list.map(({ midis, ...n }) => ({ ...n, midi: midis.length ? f(...midis) : null }))
    voices[v] = pick(Math.max)
    if (list.some((s) => s.midis.length > 1)) {
      voices[`${v}-low`] = pick(Math.min)
      warnings.push(`「${name}」voice ${v} 有和弦：「${v}」取最高音，「${v}-low」取最低音`)
    }
  }
  return { voices, tempos }
}

// 沒有 <sound tempo> 時，退回讀 <metronome>
function metronome(root: Element): number {
  const m = root.querySelector('metronome')
  if (!m) return 90
  const unit: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5 }
  const beat = (unit[kid(m, 'beat-unit')?.textContent?.trim() ?? 'quarter'] ?? 1) * (kid(m, 'beat-unit-dot') ? 1.5 : 1)
  return num(m, 'per-minute', 90) * beat
}
