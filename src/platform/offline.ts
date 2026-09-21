import { useEffect, useState } from 'react'

/** true, sobald ein aktiver Service Worker die App ausliefern kann (auch bei späteren Starts). */
export function useOfflineReady(): boolean {
  const [ready, setReady] = useState(() => Boolean(navigator.serviceWorker?.controller))

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let cancelled = false
    void navigator.serviceWorker.ready.then((reg) => {
      if (!cancelled && reg.active) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return ready
}
