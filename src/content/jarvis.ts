import lines from './jarvis.de.json'

export type JarvisKey = Exclude<keyof typeof lines, 'meta'>
export type JarvisVars = Partial<
  Record<'open' | 'done' | 'days' | 'weeks' | 'mark' | 'pct' | 'exercise' | 'kg' | 'hours' | 'version', string | number>
>

/** Eine zufällige Zeile zum Anlass; Zeilen mit unbelegten Platzhaltern werden übergangen. */
export function say(key: JarvisKey, vars: JarvisVars = {}, random: () => number = Math.random): string {
  const usable = lines[key].filter((l) => [...l.matchAll(/\{(\w+)\}/g)].every((m) => m[1]! in vars))
  const pool = usable.length ? usable : lines[key]
  const line = pool[Math.floor(random() * pool.length)]!
  return line.replace(/\{(\w+)\}/g, (_, name: keyof JarvisVars) => String(vars[name] ?? ''))
}
