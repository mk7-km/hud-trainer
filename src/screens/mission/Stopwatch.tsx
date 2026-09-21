import { useState } from 'react'
import { Button } from '../../ui/controls'
import { formatClock, formatRange } from '../../ui/format'
import { useTick } from '../../ui/useTick'
import m from './mission.module.css'

/** Start/Stopp-Timer für Halteübungen mit Anzeige des Zielbereichs. */
export function Stopwatch({ range, onStop }: { range: [number, number] | null; onStop: (seconds: number) => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const now = useTick(startedAt !== null, 100)
  const elapsed = startedAt === null ? 0 : (now - startedAt) / 1000
  const zone = !range || elapsed < range[0] ? 'below' : elapsed <= range[1] ? 'in' : 'above'
  const scaleMax = (range?.[1] ?? 60) * 1.25

  return (
    <div className={m.watch} data-zone={startedAt === null ? 'idle' : zone}>
      <div className={m.watchTrack} aria-hidden="true">
        {range && (
          <div
            className={m.watchTarget}
            style={{ left: `${(range[0] / scaleMax) * 100}%`, width: `${((range[1] - range[0]) / scaleMax) * 100}%`, minWidth: 3 }}
          />
        )}
        <div className={m.watchFill} style={{ transform: `scaleX(${Math.min(1, elapsed / scaleMax)})` }} />
      </div>
      <div className={m.watchRow}>
        <span className={`${m.watchClock} num`} role="timer">
          {formatClock(elapsed)}
        </span>
        <span className={m.watchGoal}>Ziel {formatRange(range, ' s')}</span>
        {startedAt === null ? (
          <Button onClick={() => setStartedAt(Date.now())}>Timer starten</Button>
        ) : (
          <Button
            variant="danger"
            onClick={() => {
              onStop(Math.max(1, Math.round((Date.now() - startedAt) / 1000)))
              setStartedAt(null)
            }}
          >
            Stopp
          </Button>
        )}
      </div>
    </div>
  )
}
