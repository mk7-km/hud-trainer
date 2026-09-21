import { useMemo, useState } from 'react'
import { addDays, formatDateDe, suggestProgramStart } from '../domain/dates'
import { homeLine, homeWarnings, type HomeInput, type Warning } from '../domain/homeLine'
import type { Plan } from '../domain/plan'
import type { DayContext } from '../domain/schedule'
import type { Derived } from '../state/derived'
import { finishSession } from '../state/mission'
import { requestStart } from '../state/start'
import { useApp } from '../state/store'
import { useUi } from '../state/ui'
import { Button, Dialog, JarvisLine, Panel, Seg } from '../ui/controls'
import { formatInt, formatPct } from '../ui/format'
import { Reactor } from '../ui/Reactor'
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

function warningText(plan: Plan, w: Warning): string {
  switch (w.kind) {
    case 'backupOverdue':
      return w.days === undefined ? 'Noch kein Backup gesichert.' : `Letztes Backup vor ${w.days} Tagen.`
    case 'storage':
      return 'Speicherschutz nicht bestätigt. Backups sind umso wichtiger.'
    case 'weighInMissing':
      return `Wägungen diese Woche: ${w.done} von ${plan.bodyweight.weighInsPerWeekMin}.`
    case 'weightLossTooFast':
      return 'Das Gewicht fällt seit zwei Wochen zu schnell.'
    case 'inactivity':
      return `Seit ${w.days} Tagen keine Einheit.`
  }
}

export function Home({ plan, derived, draw }: { plan: Plan; derived: Derived; draw: boolean }) {
  const settings = useApp((st) => st.settings)
  const sessions = useApp((st) => st.sessions)
  const bodyweight = useApp((st) => st.bodyweight)
  const kneeChecks = useApp((st) => st.kneeChecks)
  const today = useApp((st) => st.today)
  const updateSettings = useApp((st) => st.updateSettings)
  const openMission = useUi((u) => u.openMission)
  const setTab = useUi((u) => u.setTab)
  const [discard, setDiscard] = useState(false)
  const [newStart, setNewStart] = useState(() => suggestProgramStart(today))

  const { ctx, week, streak } = derived
  const input: HomeInput = useMemo(
    () => ({ plan, ctx, week, streak, settings, sessions, bodyweight, today, now: Date.now() }),
    [plan, ctx, week, streak, settings, sessions, bodyweight, today],
  )
  const warnings = useMemo(() => homeWarnings(input), [input])
  const choice = useMemo(() => homeLine(input), [input])
  const line = useLine(choice.key, choice.vars)

  const active = sessions.find((x) => x.status === 'active') ?? null
  const ordered = [...plan.sessions].sort((a, b) => a.order - b.order)
  const recommended = ordered.find((t) => !week.fulfilled.has(t.id)) ?? null
  const lastKnee = kneeChecks.reduce<(typeof kneeChecks)[number] | null>((a, b) => (!a || b.at > a.at ? b : a), null)
  const mark = plan.marks.find((x) => x.level === derived.reachedLevel)
  const backupDays = settings.lastBackupAt === null ? null : Math.floor((Date.now() - settings.lastBackupAt) / 86_400_000)

  const repair = settings.repairMode
  // Reparaturmodus endet, wenn ein Plan mit anderer phase.id geladen ist und ein neuer Programmstart bestätigt wird.
  const newPhaseReady = repair && settings.repairPhaseId !== null && settings.repairPhaseId !== plan.phase.id
  const starts = [suggestProgramStart(today), addDays(suggestProgramStart(today), 7)]

  const lockText =
    ctx.locked === 'notStarted' && settings.programStart
      ? `Das Programm startet am ${formatDateDe(settings.programStart)}.`
      : ctx.locked === 'restBeforeOp'
        ? 'Ruhetag vor der OP. Heute ist keine Einheit vorgesehen.'
        : ctx.locked === 'opReached'
          ? 'Der OP-Termin ist erreicht. Einheiten sind gesperrt.'
          : null

  return (
    <main className={s.scroll}>
      <div className={s.rowBetween}>
        <p className={s.kicker}>{mark ? mark.name : 'Mark 0'}</p>
        <p className={s.kicker}>{opLabel(ctx)}</p>
      </div>

      <Reactor
        pflichtDone={week.pflichtDone}
        pflichtTarget={week.pflichtTarget}
        bonusDone={week.bonusDone}
        bonusTarget={week.bonusTarget}
        pct={week.pct}
        paused={repair}
        draw={draw}
      />
      <p className={s.kicker} style={{ textAlign: 'center' }}>
        {repair ? 'Reparaturmodus' : `Woche ${Math.max(ctx.programWeek, 0)} · Block ${ctx.block} · ${weekTypeLabel(ctx)}`}
      </p>
      <JarvisLine text={line} />

      {newPhaseReady && (
        <Panel tone="active" title={`Neue Phase: ${plan.phase.name}`}>
          <div className={s.stack}>
            <p className={s.text}>Ein neuer Trainingsplan ist geladen. Bestätige den Programmstart, dann endet der Reparaturmodus.</p>
            <Seg label="Neuer Programmstart" value={newStart} onChange={setNewStart} options={starts.map((d) => ({ value: d, label: `Mo ${formatDateDe(d).slice(0, 6)}` }))} />
            <Button
              variant="primary"
              block
              onClick={() => void updateSettings({ repairMode: false, repairSince: null, repairPhaseId: null, programStart: newStart, opDate: null, opAskedFor: null })}
            >
              Programmstart bestätigen
            </Button>
          </div>
        </Panel>
      )}

      {lockText && !repair && (
        <Panel tone="warn" title="Gesperrt">
          <p className={s.text}>{lockText}</p>
        </Panel>
      )}

      {active && !repair && (
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

      {warnings.length > 0 && (
        <Panel tone="warn" title="Hinweise">
          {warnings.map((w) => (
            <div key={w.kind} className={m.statRow}>
              <span>{warningText(plan, w)}</span>
              {(w.kind === 'backupOverdue' || w.kind === 'storage') && (
                <Button variant="quiet" onClick={() => setTab('system')}>
                  Zu SYSTEM
                </Button>
              )}
              {w.kind === 'weighInMissing' && (
                <Button variant="quiet" onClick={() => setTab('status')}>
                  Zu STATUS
                </Button>
              )}
            </div>
          ))}
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
          <span className={m.statLabel}>Punkte · Serie</span>
          <span className="num">
            {formatInt(derived.points.total)} · {streak.current} {streak.current === 1 ? 'Woche' : 'Wochen'}
          </span>
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
