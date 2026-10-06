import type { Note, Tempo } from './musicxml'

export type Track = { notes: Note[]; gain: number; wave?: OscillatorType }
export type PlayOptions = { tempos: Tempo[]; speed: number; from: number; to: number; countIn?: number; click?: boolean; onEnd?: () => void }

// 拍 ↔ 秒（從第 0 拍起算，依速度表分段計算；負的拍數用第一個速度）
export function beatToSec(tempos: Tempo[], beat: number): number {
  let sec = 0
  let b = 0
  let bpm = tempos[0]?.bpm ?? 90
  for (const t of tempos) {
    if (t.beat >= beat) break
    sec += ((t.beat - b) * 60) / bpm
    b = t.beat
    bpm = t.bpm
  }
  return sec + ((beat - b) * 60) / bpm
}

export function secToBeat(tempos: Tempo[], sec: number): number {
  let s = 0
  let b = 0
  let bpm = tempos[0]?.bpm ?? 90
  for (const t of tempos) {
    const next = s + ((t.beat - b) * 60) / bpm
    if (next > sec) break
    s = next
    b = t.beat
    bpm = t.bpm
  }
  return b + ((sec - s) * bpm) / 60
}

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

// Web Audio 合成器：一次排好所有音符的時間，畫面用 position() 讀目前拍數
export class Player {
  private ctx?: AudioContext
  private nodes: OscillatorNode[] = []
  private timer?: ReturnType<typeof setTimeout>
  private t0 = 0
  private tempos: Tempo[] = []
  private speed = 1
  private from = 0
  private playing = false

  play(tracks: Track[], o: PlayOptions) {
    this.stop()
    // iOS 必須在使用者點擊後才建立/恢復 AudioContext
    const ctx = (this.ctx ??= new AudioContext())
    void ctx.resume()
    this.tempos = o.tempos
    this.speed = o.speed
    this.from = o.from
    const countIn = o.countIn ?? 0
    const spb = (beatToSec(o.tempos, o.from + 1) - beatToSec(o.tempos, o.from)) / o.speed
    this.t0 = ctx.currentTime + 0.1 + countIn * spb
    for (let k = 1; k <= countIn; k++) this.tone(ctx, 1760, this.t0 - k * spb, 0.05, 0.2)
    if (o.click) for (let b = Math.ceil(o.from); b < o.to; b++) this.tone(ctx, 1320, this.at(b), 0.04, 0.12)
    for (const tr of tracks)
      for (const n of tr.notes) {
        if (n.midi === null || n.start + n.dur <= o.from || n.start >= o.to) continue
        const s = Math.max(n.start, o.from)
        const e = Math.min(n.start + n.dur, o.to)
        this.tone(ctx, freq(n.midi), this.at(s), this.at(e) - this.at(s), tr.gain, tr.wave)
      }
    this.playing = true
    this.timer = setTimeout(() => {
      this.playing = false
      this.nodes = []
      o.onEnd?.()
    }, (this.at(o.to) - ctx.currentTime) * 1000)
  }

  stop() {
    clearTimeout(this.timer)
    for (const n of this.nodes) n.stop()
    this.nodes = []
    this.playing = false
  }

  // 目前播到第幾拍；預備拍期間為負的相對值，沒在播放回傳 null
  position(): number | null {
    if (!this.playing || !this.ctx) return null
    return secToBeat(this.tempos, beatToSec(this.tempos, this.from) + (this.ctx.currentTime - this.t0) * this.speed)
  }

  private at(beat: number) {
    return this.t0 + (beatToSec(this.tempos, beat) - beatToSec(this.tempos, this.from)) / this.speed
  }

  private tone(ctx: AudioContext, f: number, t: number, d: number, g: number, wave: OscillatorType = 'triangle') {
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()
    osc.type = wave
    osc.frequency.value = f
    const attack = Math.min(0.02, d / 3)
    const release = Math.min(0.05, d / 3)
    amp.gain.setValueAtTime(0, t)
    amp.gain.linearRampToValueAtTime(g, t + attack)
    amp.gain.setValueAtTime(g, t + d - release)
    amp.gain.linearRampToValueAtTime(0, t + d)
    osc.connect(amp).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + d + 0.01)
    this.nodes.push(osc)
  }
}
