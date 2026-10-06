import { useEffect, useRef, useState } from 'react'
import type { Tempo } from './musicxml'
import type { Phrase } from './phrases'
import { Player } from './player'
import { bumpStreak, makeLesson, today, yesterday, type Marks, type Question, type Streak } from './quiz'
import { load, save } from './storage'

// 仿 Duolingo：一次一題、自動對答案、答錯的題目排到最後再考一次
type Props = { lines: string[]; storageKey: string; phrases?: Phrase[]; tempos?: Tempo[] }

export function Lesson({ lines, storageKey, phrases, tempos = [] }: Props) {
  const player = useRef(new Player())
  const [queue, setQueue] = useState<Question[] | null>(null)
  const [all, setAll] = useState<Question[]>([])
  const [pick, setPick] = useState<string | null>(null)
  const [missed, setMissed] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<{ lines: number; perfect: number; streak: number } | null>(null)

  const q = queue?.[0]
  const listen = () => {
    if (q?.melody) player.current.play([{ notes: q.melody, gain: 0.3 }], { tempos, speed: 1, from: q.melody[0].start, to: q.melody.at(-1)!.start + q.melody.at(-1)!.dur })
  }
  // 換到旋律題自動播一次；離開時停止
  useEffect(() => {
    listen()
    return () => player.current.stop()
  }, [q])

  const start = () => {
    const qs = makeLesson(lines, load<Marks>(storageKey, {}), Math.random, phrases)
    setQueue(qs)
    setAll(qs)
    setPick(null)
    setMissed(new Set())
    setResult(null)
  }

  if (!queue)
    return (
      <section className="lesson-start">
        <p className="muted">每課 5 句、約 10–15 題，忘記的句子會優先出現。</p>
        <button className="play" onClick={start}>開始闖關</button>
      </section>
    )

  if (!all.length) return <p className="muted">歌詞太少，沒辦法出題（至少要 2 句不同的歌詞）。</p>

  if (result)
    return (
      <section className="lesson-done">
        <div className="big">🎉</div>
        <h2>完成！</h2>
        <p>
          {result.perfect} / {result.lines} 句一次就答對
        </p>
        <p className="streak">🔥 連續 {result.streak} 天</p>
        <button className="play" onClick={start}>再一課</button>
      </section>
    )

  if (!q) return null
  const total = all.length
  const right = pick === q.answer
  const next = () => {
    const rest = right ? queue.slice(1) : [...queue.slice(1), q]
    const miss = right ? missed : new Set(missed).add(q.line)
    setPick(null)
    setMissed(miss)
    setQueue(rest)
    if (rest.length) return
    // 結果寫回歌詞分頁的「記得／忘了」，所以「只練忘記的」也看得到
    const done = new Set(all.map((x) => x.line))
    const marks = load<Marks>(storageKey, {})
    for (const l of done) marks[l] = miss.has(l) ? 'miss' : 'ok'
    save(storageKey, marks)
    const streak = bumpStreak(load<Streak>('streak', { day: '', n: 0 }), today(), yesterday())
    save('streak', streak)
    setResult({ lines: done.size, perfect: [...done].filter((l) => !miss.has(l)).length, streak: streak.n })
  }

  return (
    <section className="lesson">
      <div className="progress" role="progressbar" aria-valuenow={total - queue.length} aria-valuemax={total}>
        <div style={{ width: `${((total - queue.length) / total) * 100}%` }} />
      </div>
      <p className="muted">{q.ask}</p>
      {q.melody ? (
        <button className="listen" onClick={listen}>
          🔊 再聽一次
        </button>
      ) : (
        <p className="prompt">{q.prompt}</p>
      )}
      <div className="options">
        {q.options.map((o) => (
          <button
            key={o}
            disabled={pick !== null}
            className={pick === null ? '' : o === q.answer ? 'right' : o === pick ? 'wrong' : ''}
            onClick={() => setPick(o)}
          >
            {o}
          </button>
        ))}
      </div>
      {pick !== null && (
        <div className={`feedback ${right ? 'right' : 'wrong'}`}>
          <strong>{right ? '答對了！' : `正確答案：${q.answer}`}</strong>
          {!right && <span>這題等一下會再出現</span>}
          <button onClick={next}>繼續</button>
        </div>
      )}
    </section>
  )
}
