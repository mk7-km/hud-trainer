import { useState } from 'react'
import { say } from '../content/jarvis'
import { formatDateDe, mondayOf } from '../domain/dates'
import type { Plan, PlanSession } from '../domain/plan'
import { weekSummary } from '../domain/scoring'
import { dayContext, type DayContext } from '../domain/schedule'
import type { SessionLog } from '../domain/types'
import { finishSession } from '../state/mission'
import { useApp } from '../state/store'
import { useUi } from '../state/ui'
import { Button, Dialog, JarvisLine, Panel } from '../ui/controls'
import { useLine } from '../ui/useLine'
import s from './screen.module.css'

const WEEK_TYPE_LABEL = { calibration: 'Kalibrierung', normal: 'Normal', deload: 'Deload' } as const

export function weekTypeLabel(ctx: DayContext): string {
  return ctx.taper ? 'Taper' : WEEK_TYPE_LABEL[ctx.weekType]
}

/** Stunden seit der letzten Unterkörper-Einheit, falls unter der Vorgabe des Plans. */
export function lowerTooSoonHours(plan: Plan, sessions: SessionLog[], now: number): number | null {
  const last = sessions
    .filter((x) => x.focus === 'lower' && x.status === 'completed')
    .reduce<number | null>((t, x) => Math.max(t ?? 0, x.endedAt ?? x.startedAt), null)
  if (last === null) return null
  const hours = (now - last) / 3_600_000
  return hours < plan.schedule.minHoursBetweenLowerSessions ? Math.floor(hours) : null
}

export function Home({ plan }: { plan: Plan }) {
  const settings = useApp((st) => st.settings)
  const sessions = useApp((st) => st.sessions)
  const today = useApp((st) => st.today)
  const openMission = useUi((u) => u.openMission)
  const [tooSoon, setTooSoon] = useState<{ template: PlanSession; hours: number; line: string } | null>(null)
  const [discard, setDiscard] = useState(false)

  const ctx = dayContext(plan, settings, today)
  const week = weekSummary(plan, sessions, mondayOf(today))
  const active = sessions.find((x) => x.status === 'active') ?? null
  const ordered = [...plan.sessions].sort((a, b) => a.order - b.order)
  const recommended = ordered.find((t) => !week.fulfilled.has(t.id)) ?? null

  const repairLine = useLine('repairMode')

  const start = (template: PlanSession) => {
    const hours = template.focus === 'lower' ? lowerTooSoonHours(plan, sessions, Date.now()) : null
    if (hours !== null) return setTooSoon({ template, hours, line: say('lowerTooSoon', { hours }) })
    openMission({ kind: 'start', templateId: template.id })
  }

  const lockText =
    ctx.locked === 'notStarted' && settings.programStart
      ? `Das Programm startet am ${formatDateDe(settings.programStart)}.`
      : ctx.locked === 'restBeforeOp'
        ? say('restBeforeOp')
        : ctx.locked === 'opReached'
          ? 'Der OP-Termin ist erreicht. Einheiten sind gesperrt.'
          : ctx.locked === 'repair'
            ? repairLine
            : null

  return (
    <main className={s.scroll}>
      <div className={s.rowBetween}>
        <p className={s.kicker}>
          Woche <span className="num">{Math.max(ctx.programWeek, 0)}</span> · Block {ctx.block} · {weekTypeLabel(ctx)}
        </p>
        <p className={s.kicker}>
          {ctx.daysToOp === null ? 'OP offen' : ctx.daysToOp > 0 ? `OP in ${ctx.daysToOp} T` : 'OP erreicht'}
        </p>
      </div>
      <h1 className={`${s.h1} num`}>
        {week.pflichtDone} / {week.pflichtTarget} Pflicht · {week.bonusDone} / {week.bonusTarget} Bonus
      </h1>
      {ctx.weekType === 'calibration' && !ctx.taper && <JarvisLine text={say('calibrationWeek')} />}
      {ctx.weekType === 'deload' && <JarvisLine text={say('deloadWeek')} />}
      {ctx.taper && <JarvisLine text={say('taper')} />}

      {lockText && (
        <Panel tone="warn" title="Gesperrt">
          <p className={s.text}>{lockText}</p>
        </Panel>
      )}

      {active && (
        <Panel tone="active" title="Laufende Mission">
          <div className={s.stack}>
            <p className={s.text}>
              {active.sessionName}, begonnen am {formatDateDe(active.date)}.
            </p>
            <Button variant="primary" block onClick={() => openMission({ kind: 'resume', sessionId: active.id })}>
              Mission fortsetzen
            </Button>
            <Button variant="quiet" onClick={() => setDiscard(true)}>
              Mission beenden
            </Button>
          </div>
        </Panel>
      )}

      {!active && !ctx.locked && recommended && (
        <Panel tone="active" title="Nächste Mission">
          <div className={s.stack}>
            <p className={s.text}>
              {recommended.name}
              {recommended.durationMin ? ` · ca. ${recommended.durationMin} min` : ''}
            </p>
            <Button variant="primary" block onClick={() => start(recommended)}>
              Mission starten
            </Button>
          </div>
        </Panel>
      )}

      <Panel title="Einheiten dieser Woche">
        <ul className={s.list}>
          {ordered.map((t) => {
            const done = week.fulfilled.has(t.id)
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className={s.listBtn}
                  disabled={Boolean(active) || Boolean(ctx.locked)}
                  onClick={() => start(t)}
                  aria-label={`${t.name} starten`}
                >
                  <span className={s.listMain}>
                    <span>{t.name}</span>
                    <span className={s.listSub}>{t.type === 'pflicht' ? 'Pflicht' : 'Bonus'}</span>
                  </span>
                  <span className={s.tag} data-state={done ? 'done' : undefined}>
                    {done ? 'erledigt' : 'offen'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Panel>

      {tooSoon && (
        <Dialog
          title="Zu früh für die Beine"
          actions={
            <>
              <Button variant="primary" onClick={() => setTooSoon(null)}>
                Andere Einheit wählen
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  openMission({ kind: 'start', templateId: tooSoon.template.id })
                  setTooSoon(null)
                }}
              >
                Trotzdem starten
              </Button>
            </>
          }
        >
          <p>{tooSoon.line}</p>
          <p>
            Zwischen zwei Unterkörper-Einheiten sollen {plan.schedule.minHoursBetweenLowerSessions} Stunden liegen. Seit
            der letzten sind es {tooSoon.hours}.
          </p>
        </Dialog>
      )}

      {discard && active && (
        <Dialog
          title="Laufende Mission beenden?"
          actions={
            <>
              <Button variant="primary" onClick={() => setDiscard(false)}>
                Zurück
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  void finishSession(plan, active)
                  setDiscard(false)
                }}
              >
                Jetzt beenden
              </Button>
            </>
          }
        >
          <p>
            Die Einheit wird mit dem bisherigen Stand beendet. Unter {Math.round(plan.points.sessionCompleteThreshold * 100)} %
            der Sätze gilt sie als abgebrochen.
          </p>
        </Dialog>
      )}
    </main>
  )
}
