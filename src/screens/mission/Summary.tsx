import { useMemo } from 'react'
import type { Plan } from '../../domain/plan'
import { completionRatio, points } from '../../domain/scoring'
import { rightRecords, symmetry } from '../../domain/strength'
import type { SessionLog } from '../../domain/types'
import { resolveFor, sessionProgress } from '../../state/mission'
import { useApp } from '../../state/store'
import { Button, JarvisLine, Panel } from '../../ui/controls'
import { formatInt, formatKg, formatPct } from '../../ui/format'
import s from '../screen.module.css'
import m from './mission.module.css'

export function Summary({
  plan,
  session,
  line,
  onClose,
}: {
  plan: Plan
  session: SessionLog
  line: string | null
  onClose: () => void
}) {
  const sessions = useApp((st) => st.sessions)
  const sets = useApp((st) => st.sets)

  const data = useMemo(() => {
    const progress = sessionProgress(session, resolveFor(plan, session))
    const pts = points(plan, sessions, sets).bySession.get(session.id) ?? { base: 0, records: 0 }
    const completed = sessions.filter((x) => x.status === 'completed')
    const records = rightRecords(plan, sets, completed).get(session.id) ?? []
    const before = symmetry(plan, sets.filter((x) => x.sessionId !== session.id), session.date).index
    const after = symmetry(plan, sets, session.date).index
    return { progress, pts, records, before, after }
  }, [plan, session, sessions, sets])

  const completed = session.status === 'completed'
  const ratio = completionRatio(data.progress.done, data.progress.planned)
  const name = (id: string) => plan.exercises[id]?.name ?? id

  return (
    <main className={s.scrollFull}>
      <p className={s.kicker}>{completed ? 'Mission abgeschlossen' : 'Mission abgebrochen'}</p>
      <h1 className={s.h1}>{session.sessionName}</h1>
      <JarvisLine text={line} />

      <Panel title="Ergebnis" tone={completed ? 'active' : 'warn'}>
        <p className={`${m.big} num`}>+{formatInt(data.pts.base + data.pts.records)} Punkte</p>
        <div className={m.statRow}>
          <span className={m.statLabel}>Sätze protokolliert</span>
          <span className="num">
            {data.progress.done} von {data.progress.planned} ({formatPct(ratio)})
          </span>
        </div>
        <div className={m.statRow}>
          <span className={m.statLabel}>Knie-Status</span>
          <span>
            <span className={s.dot} data-knee={session.kneeStatus} />
            {session.kneeStatus === 'green' ? 'grün' : session.kneeStatus === 'yellow' ? 'gelb' : 'rot'}
          </span>
        </div>
        {data.after !== null && (
          <div className={m.statRow}>
            <span className={m.statLabel}>Symmetrie</span>
            <span className="num">
              {data.before !== null && Math.round(data.before * 100) !== Math.round(data.after * 100)
                ? `${formatPct(data.before)} → ${formatPct(data.after)}`
                : formatPct(data.after)}
            </span>
          </div>
        )}
      </Panel>

      {completed && data.records.length > 0 && (
        <Panel title="Neue Bestwerte rechts">
          {data.records.map((r) => (
            <div key={r.exerciseId} className={m.statRow}>
              <span>{name(r.exerciseId)}</span>
              <span className="num">{formatKg(Math.round(r.e1rm * 10) / 10)} kg e1RM</span>
            </div>
          ))}
        </Panel>
      )}

      <Button variant="primary" block onClick={onClose}>
        Fertig
      </Button>
    </main>
  )
}
