// localStorage 在無痕模式等情況可能丟例外，失敗時退回記憶體
const mem = new Map<string, string>()

export function load<T>(key: string, fallback: T): T {
  let v = mem.get(key)
  try {
    v = localStorage.getItem(key) ?? v
  } catch {
    /* 用記憶體裡的值 */
  }
  try {
    return v == null ? fallback : ((JSON.parse(v) as T | null) ?? fallback)
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown) {
  const v = JSON.stringify(value)
  mem.set(key, v)
  try {
    localStorage.setItem(key, v)
  } catch {
    /* 留在記憶體 */
  }
}
