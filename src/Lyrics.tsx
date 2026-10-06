import { useState } from 'react'
import { hint } from './phrases'
import { load, save } from './storage'

type Level = 'show' | 'hint' | 'hide'
type Marks = Record<string, 'ok' | 'miss'>

export function Lyrics({ lines, storageKey }: { lines: string[]; storageKey: string }) {
  const [level, setLevel] = useState<Level>('hint')
  const [onlyMiss, setOnlyMiss] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const [marks, setMarks] = useState<Marks>(() => load(storageKey, {}))

  if (!lines.length) return <p className="muted">沒有歌詞。</p>

  const mark = (line: string, m: 'ok' | 'miss') => {
    const next = { ...marks, [line]: m }
    setMarks(next)
    save(storageKey, next)
    setOpen(null)
  }
  const reset = () => {
    setMarks({})
    save(storageKey, {})
  }
  const shown = lines.map((l, i) => [l, i] as const).filter(([l]) => !onlyMiss || marks[l] === 'miss')
  const ok = lines.filter((l) => marks[l] === 'ok').length

  return (
    <section>
      <div className="controls">
        {(['show', 'hint', 'hide'] as Level[]).map((l) => (
          <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>
            {{ show: '全顯示', hint: '提示', hide: '全遮蓋' }[l]}
          </button>
        ))}
        <label>
          <input type="checkbox" checked={onlyMiss} onChange={(e) => setOnlyMiss(e.target.checked)} /> 只練忘記的
        </label>
      </div>
      <p className="muted">
        記得 {ok} / {lines.length} 句 · <button className="link" onClick={reset}>重設</button>
      </p>
      <ol className="lines">
        {shown.map(([line, i]) => {
          const revealed = level === 'show' || open === i
          return (
            <li key={i} className={marks[line] ?? ''}>
              <button className="line" onClick={() => setOpen(open === i ? null : i)} aria-expanded={revealed}>
                <span className="num">{i + 1}</span>
                {revealed ? line : level === 'hint' ? hint(line) : '＿＿＿（點我看答案）'}
              </button>
              {level !== 'show' && open === i && (
                <span className="grade">
                  <button onClick={() => mark(line, 'ok')}>記得 ✓</button>
                  <button onClick={() => mark(line, 'miss')}>忘了 ✗</button>
                </span>
              )}
            </li>
          )
        })}
      </ol>
      {onlyMiss && !shown.length && <p className="muted">沒有標記為忘記的句子 🎉</p>}
    </section>
  )
}
