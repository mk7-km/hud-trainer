import { addDays, formatDateDe, mondayOf } from '../domain/dates'
import type { Plan } from '../domain/plan'
import { weekSummary } from '../domain/scoring'
import { programWeekOf, weekEntry } from '../domain/schedule'
import type { SessionLog } from '../domain/types'
import type { Derived } from '../state/derived'
import { lastLowerEnd, requestStart } from '../state/start'
import { useApp } from '../state/store'
import { useUi } from '../state/ui'
import { Panel } from '../ui/controls'
import { formatInt } from '../ui/format'
import { opLabel, weekTypeLabel } from './Home'
import s from './screen.module.css'

const STATUS_TAG: Record<SessionLog['status'], { label: string; state?: 'done' | 'warn' | 'alarm' }> = {
  completed: { label: 'erledigt', state: 'done' },
  suspended_red: { label: 'ausgesetzt', state: 'alarm' },
  aborted: { label: 'abgebrochen', state: 'warn' },
  active: { label: 'läuft', state: 'warn' },
}
const TYPE_LABEL = { calibration: 'Kalibrierung', normal: 'Normal', deload: 'Deload' } as const
const short = (d: string) => formatDateDe(d).slice(0, 6)

function SessionRow({ session }: { session: SessionLog }) {
  const openMission = useUi((u) => u.openMission)
  const tag = STATUS_TAG[session.status]
  return (
    <li>
      <button
        type="button"
        className={s.listBtn}
        disabled={session.status === 'suspended_red'}
        onClick={() => openMission({ kind: 'resume', sessionId: session.id })}
        aria-label={`${session.sessionName} vom ${short(session.date)} öffnen`}
      >
        <span className={s.listMain}>
          <span>{session.sessionName}</span>
          <span className={s.listSub}>
            <span className={s.dot} data-knee={session.kneeStatus} />
            {short(session.date)} · {session.sessionType === 'pflicht' ? 'Pflicht' : 'Bonus'}
          </span>
        </span>
        <span className={s.tag} data-state={tag.state}>
          {tag.label}
        </span>
      </button>
    </li>
  )
}

export function Week({ plan, derived }: { plan: Plan; derived: Derived }) {
  const sessions = useApp((st) => st.sessions)
  const today = useApp((st) => st.today)
  const programStart = useApp((st) => st.settings.programStart)
  const { ctx, week } = derived

  const monday = mondayOf(today)
  const active = sessions.some((x) => x.status === 'active')
  const thisWeek = sessions.filter((x) => x.date >= monday && x.date <= addDays(monday, 6))
  const ordered = [...plan.sessions].sort((a, b) => a.order - b.order)

  const lowerEnd = lastLowerEnd(sessions)
  const lowerFreeAt = lowerEnd === null ? null : lowerEnd + plan.schedule.minHoursBetweenLowerSessions * 3_600_000
  const lowerBlocked = lowerFreeAt !== null && lowerFreeAt > Date.now()

  const pastMondays = [...new Set(sessions.map((x) => mondayOf(x.date)))].filter((d) => d < monday).sort().reverse()

  return (
    <main className={s.scroll}>
      <div className={s.rowBetween}>
        <p className={s.kicker}>
          Woche <span className="num">{Math.max(ctx.programWeek, 0)}</span> · Block {ctx.block} · {weekTypeLabel(ctx)}
        </p>
        <p className={s.kicker}>{opLabel(ctx)}</p>
      </div>
      <h1 className={`${s.h1} num`}>
        {week.pflichtDone}/{week.pflichtTarget}
        {week.bonusDone > 0 ? ` + ${week.bonusDone}` : ''} diese Woche
      </h1>
      <p className={s.muted}>
        {short(monday)} bis {short(addDays(monday, 6))} · Abschluss Sonntag 23:59
      </p>

      {lowerBlocked && (
        <Panel tone="warn" title="48-Stunden-Regel">
          <p className={s.text}>
            Nächste Unterkörper-Einheit frühestens{' '}
            {new Date(lowerFreeAt).toLocaleString('de-AT', { weekday: 'long', hour: '2-digit', minute: '2-digit' })} Uhr.
          </p>
        </Panel>
      )}

      <Panel title="Einheiten">
        <ul className={s.list}>
          {ordered.map((t) => {
            const logs = thisWeek.filter((x) => x.sessionTemplateId === t.id).sort((a, b) => b.startedAt - a.startedAt)
            const counted = logs.find((x) => x.status === 'completed' || x.status === 'suspended_red' || x.status === 'active')
            if (counted) return <SessionRow key={t.id} session={counted} />
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className={s.listBtn}
                  disabled={active || Boolean(ctx.locked)}
                  onClick={() => requestStart(plan, t)}
                  aria-label={`${t.name} starten`}
                >
                  <span className={s.listMain}>
                    <span>{t.name}</span>
                    <span className={s.listSub}>
                      {t.type === 'pflicht' ? 'Pflicht' : 'Bonus'}
                      {t.durationMin ? ` · ca. ${t.durationMin} min` : ''}
                      {logs.length > 0 ? ' · zuletzt abgebrochen' : ''}
                    </span>
                  </span>
                  <span className={s.tag}>offen</span>
                </button>
              </li>
            )
          })}
        </ul>
      </Panel>

      <Panel title="Verlauf">
        {pastMondays.length === 0 ? (
          <p className={s.muted}>Noch keine frühere Woche. Der Verlauf beginnt mit dem ersten Wochenabschluss.</p>
        ) : (
          pastMondays.map((m) => {
            const sum = weekSummary(plan, sessions, m)
            const no = programStart ? programWeekOf(programStart, m) : 0
            const bonusPts = derived.points.byWeek.get(m) ?? 0
            const logs = sessions.filter((x) => x.date >= m && x.date <= addDays(m, 6)).sort((a, b) => a.startedAt - b.startedAt)
            return (
              <details key={m} className={s.details}>
                <summary className={s.summary}>
                  <span className={s.listMain}>
                    <span>
                      Woche <span className="num">{no}</span> · {TYPE_LABEL[weekEntry(plan, no).type]}
                    </span>
                    <span className={s.listSub}>
                      {short(m)} bis {short(addDays(m, 6))}
                      {bonusPts > 0 ? ` · Wochenbonus ${formatInt(bonusPts)}` : ''}
                    </span>
                  </span>
                  <span className={`${s.tag} num`} data-state={sum.full ? 'done' : 'warn'}>
                    {sum.pflichtDone}/{sum.pflichtTarget}
                    {sum.bonusDone > 0 ? ` + ${sum.bonusDone}` : ''}
                  </span>
                </summary>
                <ul className={s.list}>
                  {logs.map((x) => (
                    <SessionRow key={x.id} session={x} />
                  ))}
                </ul>
              </details>
            )
          })
        )}
      </Panel>
    </main>
  )
}
