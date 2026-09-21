import { useMemo, useState } from 'react'
import { say } from '../../content/jarvis'
import type { KneeAnswers } from '../../domain/knee'
import type { Plan } from '../../domain/plan'
import { completionRatio } from '../../domain/scoring'
import { dayContext } from '../../domain/schedule'
import type { SessionLog } from '../../domain/types'
import { useWakeLock } from '../../platform/wakeLock'
import { beginSession, chooseExercise, finishSession, resolveFor, sessionProgress, setCheck } from '../../state/mission'
import { useApp } from '../../state/store'
import { useUi, type MissionTarget } from '../../state/ui'
import { Button, Dialog, JarvisLine, Panel } from '../../ui/controls'
import { formatPct } from '../../ui/format'
import { KneeCheck } from './KneeCheck'
import { Summary } from './Summary'
import { Work } from './Work'
import s from '../screen.module.css'
import m from './mission.module.css'

type Phase = 'knee' | 'notice' | 'choose' | 'warmup' | 'work' | 'summary'

export function Mission({ plan, target }: { plan: Plan; target: MissionTarget }) {
  const close = useUi((u) => u.closeMission)
  const sessions = useApp((st) => st.sessions)
  const settings = useApp((st) => st.settings)
  const today = useApp((st) => st.today)

  const [sessionId, setSessionId] = useState<string | null>(target.kind === 'resume' ? target.sessionId : null)
  const [phase, setPhase] = useState<Phase>(target.kind === 'resume' ? 'work' : 'knee')
  const [locking, setLocking] = useState(false)
  const [lockingAck, setLockingAck] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [line, setLine] = useState<string | null>(null)

  const session = sessions.find((x) => x.id === sessionId) ?? null
  const resolved = useMemo(() => (session ? resolveFor(plan, session) : null), [plan, session])
  const review = target.kind === 'resume' && session !== null && session.status !== 'active'
  useWakeLock(phase === 'work' || phase === 'warmup')

  if (phase === 'knee' && target.kind === 'start') {
    const template = plan.sessions.find((x) => x.id === target.templateId)
    if (!template) return null
    const submit = async (answers: KneeAnswers) => {
      const ctx = dayContext(plan, settings, today)
      const { session: created, knee } = await beginSession(plan, template.id, ctx, answers)
      setSessionId(created.id)
      setLocking(knee.locking)
      setLine(knee.status === 'green' ? say('kneeGreen') : knee.status === 'yellow' ? say('kneeYellow') : say('kneeRed'))
      setPhase('notice')
    }
    return <KneeCheck plan={plan} sessionName={template.name} onSubmit={(a) => void submit(a)} onCancel={close} />
  }

  if (!session) return null

  const afterNotice = (sn: SessionLog) => {
    const r = resolveFor(plan, sn)
    if (!r || sn.status !== 'active') return close()
    if (r.items.some((i) => i.options)) return setPhase('choose')
    setPhase(r.template.warmup.length ? 'warmup' : 'work')
  }

  if (phase === 'notice') {
    const knee = session.kneeStatus
    const suspended = session.status === 'suspended_red'
    return (
      <main className={s.scrollFull}>
        <p className={s.kicker}>Knie-Status</p>
        <h1 className={s.h1}>
          <span className={s.dot} data-knee={knee} />
          {knee === 'green' ? 'Grün' : knee === 'yellow' ? 'Gelb: Schonmodus' : 'Rot'}
        </h1>
        <JarvisLine text={line} />
        <Panel tone={knee === 'red' ? 'alarm' : knee === 'yellow' ? 'warn' : undefined} title="Vorgabe">
          <p className={s.text}>{plan.kneeCheck[knee].action}</p>
        </Panel>
        {suspended && (
          <p className={s.text}>
            Die Einheit „{session.sessionName}“ ist ausgesetzt. Sie zählt für das Wochenziel als erfüllt.
          </p>
        )}
        {!suspended && resolved && resolved.removed.length > 0 && (
          <p className={s.muted}>Heute gestrichen: {resolved.removed.map((r) => r.name).join(', ')}.</p>
        )}
        {locking && (
          <Panel tone="alarm" title="Blockade gemeldet">
            <div className={s.stack}>
              <p className={s.text}>{say('locking')}</p>
              <p className={s.muted}>{plan.kneeCheck.events.locking}</p>
              <button type="button" role="checkbox" aria-checked={lockingAck} className={m.check} onClick={() => setLockingAck((v) => !v)}>
                <span className={m.box} aria-hidden="true" />
                <span>Verstanden, ich kontaktiere den Operateur.</span>
              </button>
            </div>
          </Panel>
        )}
        <Button variant="primary" block disabled={locking && !lockingAck} onClick={() => afterNotice(session)}>
          {suspended ? 'Zurück zur Übersicht' : 'Weiter'}
        </Button>
      </main>
    )
  }

  if (!resolved) {
    return (
      <main className={s.scrollFull}>
        <h1 className={s.h1}>{session.sessionName}</h1>
        <p className={s.text}>Diese Einheit gibt es im aktuellen Trainingsplan nicht mehr. Die Protokolle bleiben im Verlauf erhalten.</p>
        <Button block onClick={close}>
          Schließen
        </Button>
      </main>
    )
  }

  if (phase === 'choose' || (phase === 'work' && resolved.items.some((i) => i.options))) {
    const open = resolved.items.find((i) => i.options)!
    return (
      <main className={s.scrollFull}>
        <p className={s.kicker}>Wahl</p>
        <h1 className={s.h1}>Womit heute?</h1>
        <div className={s.stack}>
          {open.options!.map((o) => (
            <Button
              key={o.exerciseId}
              block
              onClick={() =>
                void chooseExercise(plan, session, open.index, o.exerciseId).then(() =>
                  setPhase(resolved.template.warmup.length && phase === 'choose' ? 'warmup' : 'work'),
                )
              }
            >
              {o.name}
            </Button>
          ))}
        </div>
      </main>
    )
  }

  if (phase === 'warmup') {
    return <Warmup session={session} items={resolved.template.warmup} onDone={() => setPhase('work')} />
  }

  if (phase === 'summary') return <Summary plan={plan} session={session} line={line} onClose={close} />

  // Fortschritt immer frisch aus dem Store lesen: Mission rendert nicht bei jedem gespeicherten Satz neu.
  const currentRatio = () => {
    const progress = sessionProgress(session, resolved)
    return completionRatio(progress.done, progress.planned)
  }
  const ratio = currentRatio()
  const finish = async () => {
    const ratio = currentRatio()
    const finished = await finishSession(plan, session)
    setLine(
      finished.status === 'completed'
        ? say('missionComplete', { pct: Math.round(ratio * 100) })
        : say('sessionAborted'),
    )
    setConfirmFinish(false)
    setPhase('summary')
  }

  return (
    <>
      <Work
        plan={plan}
        session={session}
        resolved={resolved}
        review={review}
        onLeave={close}
        onFinish={() => (currentRatio() < plan.points.sessionCompleteThreshold ? setConfirmFinish(true) : void finish())}
      />
      {confirmFinish && (
        <Dialog
          title="Mission vorzeitig beenden?"
          actions={
            <>
              <Button variant="primary" onClick={() => setConfirmFinish(false)}>
                Weiter trainieren
              </Button>
              <Button variant="danger" onClick={() => void finish()}>
                Als abgebrochen beenden
              </Button>
            </>
          }
        >
          <p>
            Protokolliert sind <span className="num">{formatPct(ratio)}</span> der geplanten Sätze. Unter{' '}
            {formatPct(plan.points.sessionCompleteThreshold)} gilt die Einheit als abgebrochen: keine Punkte, zählt nicht
            für die Woche.
          </p>
        </Dialog>
      )}
    </>
  )
}

function Warmup({ session, items, onDone }: { session: SessionLog; items: string[]; onDone: () => void }) {
  const checks = useApp((st) => st.checks)
  const isDone = (i: number) => checks.some((k) => k.sessionId === session.id && k.kind === 'warmup' && k.itemId === String(i) && k.done)
  return (
    <main className={s.scrollFull}>
      <p className={s.kicker}>Aufwärmen</p>
      <h1 className={s.h1}>{session.sessionName}</h1>
      <ul className={s.list}>
        {items.map((text, i) => (
          <li key={i}>
            <button
              type="button"
              role="checkbox"
              aria-checked={isDone(i)}
              className={m.check}
              onClick={() => void setCheck(session, 'warmup', null, String(i), text, !isDone(i))}
            >
              <span className={m.box} aria-hidden="true" />
              <span>{text}</span>
            </button>
          </li>
        ))}
      </ul>
      <Button variant="primary" block onClick={onDone}>
        Aufwärmen erledigt
      </Button>
    </main>
  )
}
