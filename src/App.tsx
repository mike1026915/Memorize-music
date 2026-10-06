import { useEffect, useState } from 'react'
import { load, save } from './storage'
import { Song } from './Song'
import { liveStreak, type Streak } from './quiz'

export type SongEntry = { id: string; title: string; hasScore: boolean; voices: string[] }

const route = () => decodeURIComponent(location.hash.match(/^#\/song\/(.+)$/)?.[1] ?? '')

export function App() {
  const [songId, setSongId] = useState(route)
  const [songs, setSongs] = useState<SongEntry[] | null>(null)
  const [error, setError] = useState('')
  const [voice, setVoice] = useState(() => load('voice', 'Bass 1'))

  useEffect(() => {
    const onHash = () => setSongId(route())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    fetch('/songs/index.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setSongs)
      .catch((e) => setError(`讀取歌單失敗：${e.message}`))
  }, [])

  const voices = [...new Set([voice, ...(songs ?? []).flatMap((s) => s.voices)])].sort()
  const pickVoice = (v: string) => {
    setVoice(v)
    save('voice', v)
  }

  return (
    <>
      <header>
        <a href="#/" className="brand">
          背譜小幫手
        </a>
        {!songId && <span className="streak">🔥 {liveStreak(load<Streak>('streak', { day: '', n: 0 }))}</span>}
        <select aria-label="聲部" value={voice} onChange={(e) => pickVoice(e.target.value)}>
          {voices.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </header>
      <main>
        {songId ? (
          <Song key={songId + voice} id={songId} voice={voice} />
        ) : (
          <>
            {error && <p className="error">{error}</p>}
            {!songs && !error && <p className="muted">載入中…</p>}
            <ul className="songs">
              {songs?.map((s) => (
                <li key={s.id}>
                  <a href={`#/song/${encodeURIComponent(s.id)}`}>
                    <span>{s.title}</span>
                    <small className={s.voices.includes(voice) ? '' : 'muted'}>
                      {!s.voices.includes(voice) ? `沒有 ${voice}` : s.hasScore ? '完整' : '僅歌詞/音檔'}
                    </small>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  )
}
