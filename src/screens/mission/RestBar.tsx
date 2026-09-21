import { useEffect, useRef } from 'react'
import { playCue } from '../../platform/audio'
import { useUi } from '../../state/ui'
import { formatClock } from '../../ui/format'
import { useTick } from '../../ui/useTick'
import m from './mission.module.css'

/** Pausentimer am unteren Rand. Rechnet mit Zeitstempeln, übersteht Hintergrund und Sperre. */
export function RestBar() {
  const rest = useUi((u) => u.rest)
  const clearRest = useUi((u) => u.clearRest)
  const now = useTick(rest !== null)
  const announced = useRef<number | null>(null)
  const isOver = rest !== null && now >= rest.endsAt

  // Signal genau einmal je Pause, sobald die Mindestpause erreicht ist.
  useEffect(() => {
    if (!rest || !isOver || announced.current === rest.startedAt) return
    announced.current = rest.startedAt
    // Kam die App erst lange nach Ablauf zurück, bleibt es still.
    if (Date.now() - rest.endsAt < 3000) playCue('restEnd')
  }, [rest, isOver])

  if (!rest) return <div className={m.restSpacer} />

  const remaining = (rest.endsAt - now) / 1000
  const over = remaining <= 0
  const total = Math.max(1, rest.endsAt - rest.startedAt)
  const progress = Math.min(1, (now - rest.startedAt) / total)
  const hasRange = rest.maxEndsAt > rest.endsAt
  const pastMax = now >= rest.maxEndsAt

  return (
    <div className={m.rest} data-over={over} role="timer" aria-label="Pause">
      <div className={m.restFill} style={{ transform: `scaleX(${progress})` }} />
      <span className={m.restLabel}>{over ? (pastMax || !hasRange ? 'Pause vorbei' : 'Bereit') : 'Pause'}</span>
      <span className={`${m.restClock} num`}>
        {over ? `+${formatClock(-remaining)}` : formatClock(remaining)}
      </span>
      <button type="button" className={m.restSkip} onClick={clearRest}>
        {over ? 'schließen' : 'überspringen'}
      </button>
    </div>
  )
}
