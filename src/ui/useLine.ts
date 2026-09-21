import { useMemo } from 'react'
import { say, type JarvisKey, type JarvisVars } from '../content/jarvis'

/** Eine J.A.R.V.I.S.-Zeile, die über Re-Renders stabil bleibt, solange Anlass und Werte gleich sind. */
export function useLine(key: JarvisKey | null, vars: JarvisVars = {}): string | null {
  const signature = JSON.stringify(vars)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (key ? say(key, vars) : null), [key, signature])
}
