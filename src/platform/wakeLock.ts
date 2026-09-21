import { useEffect } from 'react'

/** Hält den Bildschirm wach, solange `active` gilt. Nach Rückkehr aus dem Hintergrund neu anfordern. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let released = false

    const acquire = async () => {
      if (released || document.visibilityState !== 'visible') return
      try {
        sentinel = await navigator.wakeLock.request('screen')
      } catch {
        // z. B. Stromsparmodus: still ignorieren
      }
    }
    void acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', acquire)
      void sentinel?.release().catch(() => undefined)
    }
  }, [active])
}
