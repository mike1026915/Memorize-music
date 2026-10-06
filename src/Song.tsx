import { useEffect, useState } from 'react'
import { parseMusicXML, type Note, type Score } from './musicxml'
import { splitPhrases } from './phrases'
import { Lyrics } from './Lyrics'
import { Practice } from './Practice'

export type PartRef = { part: string; voice: number | string }
type SongMeta = {
  title?: string
  score?: string
  pdf?: string
  parts?: Record<string, PartRef>
  accompaniment?: PartRef[] // 合唱模式一起播放、但不能選來練的聲部（例如鋼琴）
  audio?: Record<string, string>
  lyrics?: Record<string, string>
}

export const notesOf = (score: Score, ref: PartRef): Note[] | undefined =>
  score.parts.find((p) => p.id === ref.part)?.voices[String(ref.voice)]

type Tab = 'lyrics' | 'melody' | 'choir'
const TABS: [Tab, string][] = [
  ['lyrics', '歌詞'],
  ['melody', '旋律'],
  ['choir', '合唱/進拍'],
]

export function Song({ id, voice }: { id: string; voice: string }) {
  const base = `/songs/${encodeURIComponent(id)}/`
  const [meta, setMeta] = useState<SongMeta | null>(null)
  const [score, setScore] = useState<Score | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('lyrics')

  useEffect(() => {
    fetch(base + 'song.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`找不到這首歌（HTTP ${r.status}）`))))
      .then(async (m: SongMeta) => {
        setMeta(m)
        if (!m.score) return
        try {
          const r = await fetch(base + m.score)
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          setScore(parseMusicXML(await r.text()))
        } catch (e) {
          setError(`樂譜讀取失敗，只能練歌詞和音檔：${(e as Error).message}`)
        }
      })
      .catch((e) => setError(e.message))
  }, [base])

  if (!meta) return error ? <p className="error">{error}</p> : <p className="muted">載入中…</p>

  const ref = meta.parts?.[voice]
  const mine = score && ref ? notesOf(score, ref) : undefined
  const phrases = mine ? splitPhrases(mine) : []
  const lines = mine ? phrases.map((p) => p.text).filter(Boolean) : (meta.lyrics?.[voice] ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  const tabs = TABS.filter(([t]) => t === 'lyrics' || mine)
  const audio = Object.entries(meta.audio ?? {}).sort(([a], [b]) => Number(b === voice) - Number(a === voice))

  return (
    <article>
      <h1>{meta.title ?? id}</h1>
      {error && <p className="error">{error}</p>}
      {score?.warnings
        .filter((w) => !w.includes('有和弦') || (ref && w.startsWith(`「${score.parts.find((p) => p.id === ref.part)?.name}」voice ${ref.voice} `)))
        .map((w) => (
        <p key={w} className="warn">
          ⚠️ {w}
        </p>
      ))}
      {score && ref && !mine && (
        <p className="error">
          song.json 裡 {voice} 對應到 part「{ref.part}」voice「{ref.voice}」，但樂譜裡找不到。
        </p>
      )}
      {!ref && !meta.lyrics?.[voice] && <p className="error">這首歌沒有設定 {voice} 聲部。</p>}
      {score && (!ref || !mine) && (
        <details>
          <summary>樂譜裡有的聲部（設定 song.json 用）</summary>
          <ul>
            {score.parts.map((p) => (
              <li key={p.id}>
                {p.id}「{p.name}」：voice {Object.keys(p.voices).join('、')}
              </li>
            ))}
          </ul>
        </details>
      )}

      {tabs.length > 1 && (
        <nav className="tabs">
          {tabs.map(([t, label]) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </nav>
      )}

      {tab === 'lyrics' && <Lyrics storageKey={`lyrics:${id}:${voice}`} lines={lines} />}
      {tab !== 'lyrics' && score && mine && (
        <Practice
          key={tab}
          mode={tab}
          tempos={score.tempos}
          mine={mine}
          phrases={phrases}
          others={Object.entries(meta.parts ?? {})
            .filter(([v, r]) => v !== voice && !(r.part === ref!.part && String(r.voice) === String(ref!.voice)))
            .map(([, r]) => r)
            .concat(meta.accompaniment ?? [])
            .map((r) => notesOf(score, r))
            .filter((n): n is Note[] => !!n)}
        />
      )}

      {(audio.length > 0 || meta.pdf) && (
        <section className="media">
          {audio.map(([name, file]) => (
            <label key={name}>
              {name}
              <audio controls preload="none" src={base + file} />
            </label>
          ))}
          {meta.pdf && (
            <a href={base + meta.pdf} target="_blank" rel="noreferrer">
              📄 開啟 PDF 樂譜
            </a>
          )}
        </section>
      )}
    </article>
  )
}
