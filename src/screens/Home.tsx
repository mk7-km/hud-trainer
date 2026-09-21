import { useState } from 'react'
import { say } from '../content/jarvis'
import { formatDateDe } from '../domain/dates'
import type { Plan } from '../domain/plan'
import type { DayContext } from '../domain/schedule'
import type { Derived } from '../state/derived'
import { finishSession } from '../state/mission'
import { requestStart } from '../state/start'
import { useApp } from '../state/store'
import { useUi } from '../state/ui'
import { Button, Dialog, JarvisLine, Panel } from '../ui/controls'
import { formatInt, formatPct } from '../ui/format'
import { useLine } from '../ui/useLine'
import s from './screen.module.css'
import m from './mission/mission.module.css'

const WEEK_TYPE_LABEL = { calibration: 'Kalibrierung', normal: 'Normal', deload: 'Deload' } as const
const KNEE_LABEL = { green: 'grün', yellow: 'gelb', red: 'rot' } as const

export function weekTypeLabel(ctx: DayContext): string {
  return ctx.taper ? 'Taper' : WEEK_TYPE_LABEL[ctx.weekType]
}

export function opLabel(ctx: DayContext): string {
  return ctx.daysToOp === null ? 'OP offen' : ctx.daysToOp > 0 ? `OP in ${ctx.daysToOp} T` : 'OP erreicht'
}

export function Home({ plan, derived }: { plan: Plan; derived: Derived }) {
  const settings = useApp((st) => st.settings)
  const sessions = useApp((st) => st.sessions)
  const kneeChecks = useApp((st) => st.kneeChecks)
  const openMission = useUi((u) => u.openMission)
  const [discard, setDiscard] = useState(false)

  const { ctx, week } = derived
  const active = sessions.find((x) => x.status === 'active') ?? null
  const ordered = [...plan.sessions].sort((a, b) => a.order - b.order)
  const recommended = ordered.find((t) => !week.fulfilled.has(t.id)) ?? null
  const repairLine = useLine('repairMode')
  const lastKnee = kneeChecks.reduce<(typeof kneeChecks)[number] | null>((a, b) => (!a || b.at > a.at ? b : a), null)
  const mark = plan.marks.find((x) => x.level === derived.reachedLevel)
  const backupDays = settings.lastBackupAt === null ? null : Math.floor((Date.now() - settings.lastBackupAt) / 86_400_000)

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
        <p className={s.kicker}>{mark ? mark.name : 'Noch keine Mark-Stufe'}</p>
        <p className={s.kicker}>{opLabel(ctx)}</p>
      </div>
      <h1 className={`${s.h1} num`}>
        {week.pflichtDone} / {week.pflichtTarget} Pflicht · {week.bonusDone} / {week.bonusTarget} Bonus
      </h1>
      <p className={s.muted}>
        Woche <span className="num">{Math.max(ctx.programWeek, 0)}</span> · Block {ctx.block} · {weekTypeLabel(ctx)}
      </p>
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
            <Button variant="primary" block onClick={() => requestStart(plan, recommended)}>
              Mission starten
            </Button>
          </div>
        </Panel>
      )}
      {!active && !ctx.locked && !recommended && (
        <Panel title="Woche erledigt">
          <p className={s.text}>Alle Einheiten dieser Woche sind protokolliert.</p>
        </Panel>
      )}

      <Panel title="Lage">
        <div className={m.statRow}>
          <span className={m.statLabel}>Knie</span>
          <span>
            <span className={s.dot} data-knee={lastKnee?.status} />
            {lastKnee ? `${KNEE_LABEL[lastKnee.status]} · ${formatDateDe(lastKnee.date).slice(0, 6)}` : 'noch kein Check'}
          </span>
        </div>
        <div className={m.statRow}>
          <span className={m.statLabel}>Symmetrie</span>
          <span className="num">{derived.symmetry.index === null ? 'noch keine Daten' : formatPct(derived.symmetry.index)}</span>
        </div>
        <div className={m.statRow}>
          <span className={m.statLabel}>Punkte</span>
          <span className="num">{formatInt(derived.points.total)}</span>
        </div>
        <div className={m.statRow}>
          <span className={m.statLabel}>Backup</span>
          <span className="num">{backupDays === null ? 'noch keines' : backupDays === 0 ? 'heute' : `vor ${backupDays} T`}</span>
        </div>
      </Panel>

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
