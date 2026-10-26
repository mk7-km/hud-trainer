import { useMemo, useState } from 'react'
import { addDays, formatDateDe, suggestProgramStart } from '../domain/dates'
import { homeLine, homeWarnings, type HomeInput, type Warning } from '../domain/homeLine'
import type { Plan, PlanSession } from '../domain/plan'
import type { DayContext } from '../domain/schedule'
import type { SessionLog } from '../domain/types'
import type { Derived } from '../state/derived'
import { finishSession } from '../state/mission'
import { conflictsFor, requestStart } from '../state/start'
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

/** Nächste offene Einheit nach recommendedOrder; eine mit Abstandskonflikt wird nachgereiht. */
function nextOpen(plan: Plan, derived: Derived): PlanSession | null {
  const byId = new Map(plan.sessions.map((t) => [t.id, t]))
  const orderIds = plan.schedule.recommendedOrder ?? [...plan.sessions].sort((a, b) => a.order - b.order).map((t) => t.id)
  const open = orderIds.map((id) => byId.get(id)).filter((t): t is PlanSession => t !== undefined && !derived.week.fulfilled.has(t.id))
  return open.find((t) => conflictsFor(plan, t.id).length === 0) ?? open[0] ?? null
}

function lockText(ctx: DayContext, programStart: string | null, repairLine: string | null): string | null {
  if (ctx.locked === 'notStarted' && programStart) return `Das Programm startet am ${formatDateDe(programStart)}.`
  if (ctx.locked === 'restBeforeOp') return 'Ruhetag vor der OP. Heute ist keine Einheit vorgesehen.'
  if (ctx.locked === 'opReached') return 'Der OP-Termin ist erreicht. Einheiten sind gesperrt.'
  if (ctx.locked === 'repair') return repairLine
  return null
}

function ActivePanel({ plan, active, label }: { plan: Plan; active: SessionLog; label: string }) {
  const openMission = useUi((u) => u.openMission)
  const [discard, setDiscard] = useState(false)
  return (
    <Panel tone="active" title={`Laufende ${label}`}>
      <div className={s.stack}>
        <p className={s.text}>
          {active.sessionName}, begonnen am {formatDateDe(active.date)}.
        </p>
        <Button variant="primary" block onClick={() => openMission({ kind: 'resume', sessionId: active.id })}>
          {label} fortsetzen
        </Button>
        <Button variant="quiet" onClick={() => setDiscard(true)}>
          {label} beenden
        </Button>
      </div>
      {discard && (
        <Dialog
          title={`Laufende ${label} beenden?`}
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
          <p>Die Einheit wird mit dem bisherigen Stand gespeichert.</p>
        </Dialog>
      )}
    </Panel>
  )
}

function RepairEnd({ plan }: { plan: Plan }) {
  const today = useApp((st) => st.today)
  const updateSettings = useApp((st) => st.updateSettings)
  const [newStart, setNewStart] = useState(() => suggestProgramStart(today))
  const starts = [suggestProgramStart(today), addDays(suggestProgramStart(today), 7)]
  return (
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
  )
}

export function Home({ plan, derived, draw }: { plan: Plan; derived: Derived; draw: boolean }) {
  const mode = useApp((st) => st.settings.mode)
  return mode === 'diary' ? <DiaryHome plan={plan} derived={derived} /> : <CoachHome plan={plan} derived={derived} draw={draw} />
}

/** Tagebuch: nüchterne Übersicht ohne Reaktor, Punkte und Sprüche. */
function DiaryHome({ plan, derived }: { plan: Plan; derived: Derived }) {
  const settings = useApp((st) => st.settings)
  const sessions = useApp((st) => st.sessions)
  const sets = useApp((st) => st.sets)
  const bodyweight = useApp((st) => st.bodyweight)
  const today = useApp((st) => st.today)
  const setPreview = useUi((u) => u.setPreview)
  const openMission = useUi((u) => u.openMission)
  const { ctx, week } = derived

  const active = sessions.find((x) => x.status === 'active') ?? null
  const recommended = nextOpen(plan, derived)
  const newPhaseReady = settings.repairMode && settings.repairPhaseId !== null && settings.repairPhaseId !== plan.phase.id
  const lock = lockText(ctx, settings.programStart, 'Reparaturmodus. Keine Einheiten bis zum neuen Plan.')
  const input: HomeInput = useMemo(
    () => ({ plan, ctx, week, streak: derived.streak, settings, sessions, bodyweight, today, now: Date.now() }),
    [plan, ctx, week, derived.streak, settings, sessions, bodyweight, today],
  )
  // Im Tagebuch nur Hinweise zur Datensicherheit, keine Mahnungen.
  const warnings = useMemo(() => homeWarnings(input).filter((w) => w.kind === 'backupOverdue' || w.kind === 'storage'), [input])
  const last = [...sessions].filter((x) => x.status === 'completed').sort((a, b) => b.startedAt - a.startedAt)[0]
  const lastSets = last ? sets.filter((x) => x.sessionId === last.id).length : 0
  const ordered = (plan.schedule.recommendedOrder ?? plan.sessions.map((t) => t.id)).map((id) => plan.sessions.find((t) => t.id === id)).filter((t): t is PlanSession => !!t)

  return (
    <main className={s.scroll}>
      <div className={s.rowBetween}>
        <p className={s.kicker}>
          Woche <span className="num">{Math.max(ctx.programWeek, 0)}</span> · Block {ctx.block} · {weekTypeLabel(ctx)}
        </p>
        <p className={s.kicker}>{opLabel(ctx)}</p>
      </div>
      <h1 className={`${s.h1} num`}>
        {week.pflichtDone} / {week.pflichtTarget} Einheiten diese Woche
      </h1>
      {ctx.weekType === 'calibration' && <p className={s.muted}>Kalibrierungswoche: höchstens {plan.schedule.calibration.maxSets} Sätze je Übung, Lasten finden.</p>}
      {ctx.weekType === 'deload' && <p className={s.muted}>Deload: halbe Satzzahl, gleiche Lasten.</p>}
      {ctx.taper && <p className={s.muted}>Taper: halbes Volumen, nichts Neues.</p>}

      {newPhaseReady && <RepairEnd plan={plan} />}
      {lock && !settings.repairMode && (
        <Panel tone="warn" title="Gesperrt">
          <p className={s.text}>{lock}</p>
        </Panel>
      )}
      {settings.repairMode && !newPhaseReady && (
        <Panel title="Reparaturmodus">
          <p className={s.text}>Keine Einheiten. Das Gewicht lässt sich weiter protokollieren.</p>
        </Panel>
      )}

      {active && !settings.repairMode && <ActivePanel plan={plan} active={active} label="Einheit" />}

      {!active && !ctx.locked && recommended && (
        <Panel tone="active" title="Nächste Einheit">
          <div className={s.stack}>
            <p className={s.text}>
              {recommended.name}
              {recommended.durationMin ? ` · ca. ${recommended.durationMin} min` : ''}
            </p>
            <Button variant="primary" block onClick={() => requestStart(plan, recommended)}>
              Einheit starten
            </Button>
            <Button variant="quiet" onClick={() => setPreview(recommended.id)}>
              Vorschau ansehen
            </Button>
          </div>
        </Panel>
      )}
      {!active && !ctx.locked && !recommended && (
        <Panel title="Woche erledigt">
          <p className={s.text}>Alle Einheiten dieser Woche sind protokolliert.</p>
        </Panel>
      )}

      <Panel title="Diese Woche">
        <ul className={s.list}>
          {ordered.map((t) => {
            const done = week.fulfilled.has(t.id)
            const running = active?.sessionTemplateId === t.id
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className={s.listBtn}
                  onClick={() => (running && active ? openMission({ kind: 'resume', sessionId: active.id }) : setPreview(t.id))}
                  aria-label={`${t.name}: Vorschau`}
                >
                  <span className={s.listMain}>
                    <span>{t.name}</span>
                    <span className={s.listSub}>{t.durationMin ? `ca. ${t.durationMin} min` : ''}</span>
                  </span>
                  <span className={s.tag} data-state={done ? 'done' : running ? 'warn' : undefined}>
                    {done ? 'erledigt' : running ? 'läuft' : 'offen'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Panel>

      {last && (
        <Panel title="Letzte Einheit">
          <div className={m.statRow}>
            <span>{last.sessionName}</span>
            <span className={`${s.listSub} num`}>
              {formatDateDe(last.date)} · {lastSets} Sätze
            </span>
          </div>
        </Panel>
      )}

      {warnings.length > 0 && (
        <Panel tone="warn" title="Datensicherung">
          {warnings.map((w) => (
            <p key={w.kind} className={s.text}>
              {warningText(plan, w)}
            </p>
          ))}
        </Panel>
      )}
    </main>
  )
}

/** Coach: Reaktor, J.A.R.V.I.S.-Zeile, Hinweise, Lage. */
function CoachHome({ plan, derived, draw }: { plan: Plan; derived: Derived; draw: boolean }) {
  const settings = useApp((st) => st.settings)
  const sessions = useApp((st) => st.sessions)
  const bodyweight = useApp((st) => st.bodyweight)
  const kneeChecks = useApp((st) => st.kneeChecks)
  const today = useApp((st) => st.today)
  const setTab = useUi((u) => u.setTab)

  const { ctx, week, streak } = derived
  const input: HomeInput = useMemo(
    () => ({ plan, ctx, week, streak, settings, sessions, bodyweight, today, now: Date.now() }),
    [plan, ctx, week, streak, settings, sessions, bodyweight, today],
  )
  const warnings = useMemo(() => homeWarnings(input), [input])
  const choice = useMemo(() => homeLine(input), [input])
  const line = useLine(choice.key, choice.vars)

  const active = sessions.find((x) => x.status === 'active') ?? null
  const recommended = nextOpen(plan, derived)
  const lastKnee = kneeChecks.reduce<(typeof kneeChecks)[number] | null>((a, b) => (!a || b.at > a.at ? b : a), null)
  const mark = plan.marks.find((x) => x.level === derived.reachedLevel)
  const backupDays = settings.lastBackupAt === null ? null : Math.floor((Date.now() - settings.lastBackupAt) / 86_400_000)
  const repair = settings.repairMode
  const newPhaseReady = repair && settings.repairPhaseId !== null && settings.repairPhaseId !== plan.phase.id
  const repairLine = useLine('repairMode')
  const lock = lockText(ctx, settings.programStart, repairLine)

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

      {newPhaseReady && <RepairEnd plan={plan} />}

      {lock && !repair && (
        <Panel tone="warn" title="Gesperrt">
          <p className={s.text}>{lock}</p>
        </Panel>
      )}

      {active && !repair && <ActivePanel plan={plan} active={active} label="Mission" />}

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
    </main>
  )
}


