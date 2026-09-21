import { useEffect, useState } from 'react'

/** Liefert regelmäßig die aktuelle Zeit. Anzeigen rechnen mit Zeitstempeln, nie mit gezählten Intervallen. */
export function useTick(active: boolean, ms = 250): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const update = () => setNow(Date.now())
    const id = window.setInterval(update, ms)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', update)
    }
  }, [active, ms])
  return now
}
