import { useEffect, useRef, useState } from 'react'
import type { Note, Tempo } from './musicxml'
import type { Phrase } from './phrases'
import { Player, type Track } from './player'

type Props = { mode: 'melody' | 'choir'; tempos: Tempo[]; mine: Note[]; others: Note[][]; phrases: Phrase[] }

const COUNT_IN = 4 // ponytail: 固定 4 拍預備，需要時改讀拍號

export function Practice({ mode, tempos, mine, others, phrases }: Props) {
  const player = useRef(new Player())
  const round = useRef(0)
  const [speed, setSpeed] = useState(100)
  const [from, setFrom] = useState(0)
  const [to, setTo] = useState(Math.max(0, phrases.length - 1))
  const [loop, setLoop] = useState(false)
  const [follow, setFollow] = useState(false)
  const [withSelf, setWithSelf] = useState(false)
  const [hidePitch, setHidePitch] = useState(false)
  const [hideLyrics, setHideLyrics] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [singing, setSinging] = useState(false)
  const [pos, setPos] = useState<number | null>(null)

  useEffect(() => () => player.current.stop(), [])
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      setPos(player.current.position())
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [playing])

  if (!phrases.length) return <p className="muted">這個聲部沒有音符。</p>

  // 合唱模式從上一句結束後開始，讓你聽到進拍前其他聲部唱什麼
  const start = mode === 'choir' ? (from > 0 ? phrases[from - 1].end : 0) : phrases[from].start
  const end = phrases[Math.max(from, to)].end

  const run = () => {
    const rest = follow && round.current % 2 === 1 // 跟唱：單數輪靜音自己的聲部
    const tracks: Track[] =
      mode === 'melody'
        ? rest ? [] : [{ notes: mine, gain: 0.3 }]
        : withSelf
          ? // 自己的聲部用方波、其他聲部壓小聲，才聽得出來
            [...others.map((notes) => ({ notes, gain: 0.05 })), { notes: mine, gain: 0.2, wave: 'square' as const }]
          : others.map((notes) => ({ notes, gain: 0.12 }))
    setSinging(rest)
    player.current.play(tracks, {
      tempos,
      speed: speed / 100,
      from: start,
      to: end,
      countIn: round.current === 0 ? COUNT_IN : 0,
      click: rest,
      onEnd: () => {
        if (loop || (follow && round.current % 2 === 0)) {
          round.current++
          run()
        } else stop()
      },
    })
    setPlaying(true)
  }
  const play = () => {
    round.current = 0
    run()
  }
  const stop = () => {
    player.current.stop()
    setPlaying(false)
    setSinging(false)
    setPos(null)
  }

  // 合唱模式：離自己下一句進拍還有幾拍
  const cur = pos ?? -Infinity
  const inPhrase = phrases.find((p) => p.start <= cur && cur < p.end)
  const next = phrases.find((p) => p.start > cur)
  const countdown = playing && !inPhrase && next && next.start - cur <= 4 ? Math.ceil(next.start - cur) : null

  return (
    <section>
      <div className="controls">
        <label>
          從第
          <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {phrases.map((p, i) => (
              <option key={i} value={i}>
                {i + 1} {p.text.slice(0, 8)}
              </option>
            ))}
          </select>
          句
        </label>
        <label>
          到第
          <select value={Math.max(from, to)} onChange={(e) => setTo(Number(e.target.value))}>
            {phrases.map((p, i) =>
              i < from ? null : (
                <option key={i} value={i}>
                  {i + 1} {p.text.slice(0, 8)}
                </option>
              ),
            )}
          </select>
          句
        </label>
      </div>
      <div className="controls">
        <label className="grow">
          速度 {speed}%
          <input type="range" min={50} max={120} step={5} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
        </label>
      </div>
      <div className="controls">
        <label>
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> 循環
        </label>
        {mode === 'melody' ? (
          <>
            <label>
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> 跟唱
            </label>
            <label>
              <input type="checkbox" checked={hidePitch} onChange={(e) => setHidePitch(e.target.checked)} /> 隱藏音高
            </label>
            <label>
              <input type="checkbox" checked={hideLyrics} onChange={(e) => setHideLyrics(e.target.checked)} /> 隱藏歌詞
            </label>
          </>
        ) : (
          <label>
            <input type="checkbox" checked={withSelf} onChange={(e) => setWithSelf(e.target.checked)} /> 也播自己的聲部
          </label>
        )}
      </div>
      <p className="hint-text">設定會在下次按播放時生效。</p>

      <button className="play" onClick={playing ? stop : play}>
        {playing ? '■ 停止' : '▶ 播放'}
      </button>

      {mode === 'melody' && singing && <p className="status">🎤 換你唱！</p>}
      {mode === 'choir' && (
        <div className="cue">
          <div className="countdown">{countdown ?? (inPhrase ? '🎤' : '')}</div>
          <div className="now">{inPhrase?.text || (playing ? '（休息）' : '')}</div>
          <div className="muted">{next && `下一句：${next.text}`}</div>
        </div>
      )}

      <Roll notes={mine} pos={pos} focus={start} hidePitch={mode === 'melody' && hidePitch} hideLyrics={mode === 'melody' && hideLyrics} />
    </section>
  )
}

const PX = 36 // 每拍寬度
const ROW = 7 // 每半音高度

function Roll({ notes, pos, focus, hidePitch, hideLyrics }: { notes: Note[]; pos: number | null; focus: number; hidePitch: boolean; hideLyrics: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const pitched = notes.filter((n) => n.midi !== null)
  const hi = Math.max(...pitched.map((n) => n.midi!))
  const lo = Math.min(...pitched.map((n) => n.midi!))
  const rollH = hidePitch ? 16 : (hi - lo + 1) * ROW
  const width = Math.max(...notes.map((n) => n.start + n.dur)) * PX + 20
  const height = rollH + 30
  const center = pos ?? focus

  useEffect(() => {
    if (box.current) box.current.scrollLeft = center * PX - box.current.clientWidth / 3
  }, [Math.floor(center)])

  return (
    <div className="roll" ref={box}>
      <svg width={width} height={height}>
        {pitched.map((n, i) => {
          const on = pos !== null && n.start <= pos && pos < n.start + n.dur
          const y = hidePitch ? 0 : (hi - n.midi!) * ROW
          return (
            <g key={i}>
              <rect className={on ? 'note on' : 'note'} x={n.start * PX + 1} y={y + 2} width={Math.max(2, n.dur * PX - 2)} height={hidePitch ? 14 : ROW + 3} rx={3} />
              {!hideLyrics && n.lyric && (
                <text className={on ? 'lyric on' : 'lyric'} x={n.start * PX + 2} y={height - 8}>
                  {n.lyric}
                </text>
              )}
            </g>
          )
        })}
        {pos !== null && <line className="head" x1={pos * PX} x2={pos * PX} y1={0} y2={height} />}
      </svg>
    </div>
  )
}
