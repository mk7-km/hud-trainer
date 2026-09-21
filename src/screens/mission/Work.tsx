import { useMemo, useRef, useState } from 'react'
import { afterSave, findSet, loggedCount, nextOpenSlot, slotsOf, supersetMembers, type Slot } from '../../domain/missionFlow'
import type { Plan } from '../../domain/plan'
import { recommend, type Recommendation } from '../../domain/progression'
import { historyKey, type ResolvedItem, type ResolvedSession } from '../../domain/sessionPlan'
import type { SessionLog, SetLog, SkipReason } from '../../domain/types'
import { playCue } from '../../platform/audio'
import { deleteSet, saveSet, setCheck, skipExercise, type SetInput } from '../../state/mission'
import { useApp } from '../../state/store'
import { useUi } from '../../state/ui'
import { Button, Dialog, Seg, Stepper } from '../../ui/controls'
import { formatKg, formatRange } from '../../ui/format'
import { RestBar } from './RestBar'
import { Stopwatch } from './Stopwatch'
import s from '../screen.module.css'
import m from './mission.module.css'

const SIDE_LABEL = { R: 'Rechts', L: 'Links' } as const
const SKIP_REASONS: { value: SkipReason; label: string }[] = [
  { value: 'busy', label: 'Gerät besetzt' },
  { value: 'pain', label: 'Schmerz' },
  { value: 'time', label: 'Zeit' },
]
const RIR_OPTIONS = [0, 1, 2, 3, 4].map((n) => ({ value: n, label: n === 4 ? '4+' : String(n) }))

export function prescription(item: ResolvedItem): string {
  const parts: string[] = []
  if (item.logType === 'duration') parts.push(formatRange(item.minutes, ' min'))
  else if (item.logType !== 'checklist') {
    const sets = item.unilateral
      ? item.sides.every((x) => x.sets === item.sides[0]!.sets)
        ? `${item.sides[0]!.sets} je Seite`
        : item.sides.map((x) => `${x.side} ${x.sets}`).join(' / ')
      : String(item.sides[0]?.sets ?? 0)
    const amount = item.seconds ? formatRange(item.seconds, ' s') : formatRange(item.reps) + (item.perSide ? ' je Seite' : '')
    parts.push(`${sets} × ${amount}`)
  }
  if (item.tempo) parts.push(`Tempo ${item.tempo}`)
  if (item.targetRIR) parts.push(`RIR ${formatRange(item.targetRIR)}`)
  return parts.join(' · ')
}

function describeSet(item: ResolvedItem, set: SetLog): string {
  if (item.logType === 'duration') return `${Math.round((set.seconds ?? 0) / 60)} min`
  const amount = set.seconds !== null ? `${set.seconds} s` : `${set.reps ?? 0}`
  const weighted = item.logType === 'weight_reps' || item.logType === 'weight_time'
  return weighted ? `${formatKg(set.weightKg ?? 0)} kg × ${amount}` : `${amount} Wdh`
}

function recommendationText(item: ResolvedItem, rec: Recommendation): string | null {
  if (rec.kind === 'find') return 'Last finden: sauber im Zielbereich, nicht ans Limit.'
  if (rec.kind !== 'load' || rec.weightKg === null) return null
  const unit = item.logType === 'weight_time' ? ' s' : ''
  const schon = item.schonmodus ? ' (Schonmodus)' : ''
  return `Empfehlung: ${formatKg(rec.weightKg)} kg, Ziel ${rec.target}${unit}+${schon}`
}

interface Props {
  plan: Plan
  session: SessionLog
  resolved: ResolvedSession
  /** Korrektur einer abgeschlossenen Einheit: keine Pausen, kein Überspringen. */
  review?: boolean
  onFinish: () => void
  onLeave: () => void
}

export function Work({ plan, session, resolved, review = false, onFinish, onLeave }: Props) {
  const allSets = useApp((st) => st.sets)
  const allChecks = useApp((st) => st.checks)
  const sessions = useApp((st) => st.sessions)
  const settings = useApp((st) => st.settings)
  const startRest = useUi((u) => u.startRest)
  const clearRest = useUi((u) => u.clearRest)

  const items = resolved.items
  const sessionSets = useMemo(() => allSets.filter((x) => x.sessionId === session.id), [allSets, session.id])
  const skippedIds = new Set(session.skipped.map((x) => x.exerciseId))

  const checklistDone = (item: ResolvedItem) =>
    item.checklist.every((c) =>
      allChecks.some((k) => k.sessionId === session.id && k.exerciseId === item.exerciseId && k.itemId === c.id && k.done),
    )
  const isOpen = (i: number) => {
    const item = items[i]!
    if (skippedIds.has(item.exerciseId)) return false
    return item.logType === 'checklist' ? !checklistDone(item) : nextOpenSlot(item, sessionSets) !== null
  }

  const [cursor, setCursor] = useState<number | null>(() => {
    if (review) return null
    const first = items.findIndex((_, i) => isOpen(i))
    return first === -1 ? null : first
  })
  const [skipFor, setSkipFor] = useState<ResolvedItem | null>(null)

  if (cursor === null || !items[cursor]) {
    const doneAll = items.every((_, i) => !isOpen(i))
    return (
      <main className={s.scrollFull}>
        <div className={s.rowBetween}>
          <div>
            <p className={s.kicker}>{review ? 'Einheit korrigieren' : 'Übersicht'}</p>
            <h1 className={s.h1}>{session.sessionName}</h1>
          </div>
          <Button variant="quiet" onClick={onLeave}>
            {review ? 'Schließen' : 'Später fortsetzen'}
          </Button>
        </div>
        <ul className={s.list}>
          {items.map((item, i) => {
            const total = item.logType === 'checklist' ? item.checklist.length : slotsOf(item).length
            const done =
              item.logType === 'checklist'
                ? item.checklist.filter((c) =>
                    allChecks.some((k) => k.sessionId === session.id && k.exerciseId === item.exerciseId && k.itemId === c.id && k.done),
                  ).length
                : loggedCount(item, sessionSets)
            const skipped = skippedIds.has(item.exerciseId)
            return (
              <li key={item.index}>
                <button type="button" className={s.listBtn} onClick={() => setCursor(i)}>
                  <span className={s.listMain}>
                    <span>{item.name}</span>
                    <span className={s.listSub}>{[item.variantLabel, prescription(item)].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className={`${s.tag} num`} data-state={skipped ? 'warn' : done >= total ? 'done' : undefined}>
                    {skipped ? 'übersprungen' : `${done}/${total}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        {resolved.removed.length > 0 && (
          <p className={s.muted}>Heute gestrichen: {resolved.removed.map((r) => r.name).join(', ')}.</p>
        )}
        {!review && (
          <Button variant={doneAll ? 'primary' : 'secondary'} block onClick={onFinish}>
            Mission beenden
          </Button>
        )}
      </main>
    )
  }

  const item = items[cursor]
  const members = supersetMembers(items, cursor)

  const go = (index: number | null) => {
    setCursor(index)
  }

  const handleSaved = (nextSets: SetLog[]) => {
    const open = (i: number) => {
      const it = items[i]!
      if (skippedIds.has(it.exerciseId)) return false
      return it.logType === 'checklist' ? !checklistDone(it) : nextOpenSlot(it, nextSets) !== null
    }
    const result = afterSave(items, cursor, open)
    if (!review) {
      playCue('setSaved')
      startRest(result.rest)
    }
    // Nur innerhalb eines Supersatzes wird automatisch gewechselt.
    if (result.nextIndex !== null && members.includes(result.nextIndex) && result.nextIndex !== cursor) {
      go(result.nextIndex)
    }
  }

  const nextIndex = (() => {
    const after = items.findIndex((_, i) => i > cursor && isOpen(i))
    return after !== -1 ? after : items.findIndex((_, i) => i !== cursor && isOpen(i))
  })()
  const itemOpen = isOpen(cursor)

  return (
    <div className={s.shell}>
      <main className={s.scroll}>
        <header className={m.head}>
          <button type="button" className={m.back} onClick={() => go(null)} aria-label="Zur Übersicht">
            ‹
          </button>
          <div className={m.headMain}>
            <p className={s.kicker}>
              <span className="num">
                {cursor + 1}/{items.length}
              </span>
              {item.supersetGroup && ` · Supersatz ${members.indexOf(cursor) + 1}/${members.length}`}
              {item.variantLabel && ` · ${item.variantLabel}`}
            </p>
            <h1 className={m.title}>{item.name}</h1>
            {prescription(item) && <p className={`${s.muted} num`}>{prescription(item)}</p>}
          </div>
        </header>
        {item.hint && <p className={m.hint}>{item.hint}</p>}
        {item.weightNote && <p className={s.muted}>Gewicht: {item.weightNote}</p>}

        {item.logType === 'checklist' ? (
          <Checklist session={session} item={item} />
        ) : (
          <SetEntry
            key={item.index}
            plan={plan}
            session={session}
            item={item}
            sessionSets={sessionSets}
            history={{
              sets: allSets.filter((x) => historyKey(x.exerciseId, x.variantId) === historyKey(item.exerciseId, item.variantId)),
              sessionsById: new Map(sessions.map((x) => [x.id, x])),
            }}
            incrementOverride={settings.incrementOverrides[item.exerciseId]}
            onSaved={handleSaved}
          />
        )}

        {!itemOpen && nextIndex !== -1 && (
          <Button variant="primary" block onClick={() => go(nextIndex)}>
            Nächste Übung: {items[nextIndex]!.name}
          </Button>
        )}
        {!itemOpen && nextIndex === -1 && !review && (
          <Button variant="primary" block onClick={() => go(null)}>
            Zur Übersicht und beenden
          </Button>
        )}
        {!review && itemOpen && item.logType !== 'checklist' && (
          <Button variant="quiet" onClick={() => setSkipFor(item)}>
            Übung überspringen
          </Button>
        )}
        {!review && skippedIds.has(item.exerciseId) && (
          <Button variant="quiet" onClick={() => void skipExercise(session, item.exerciseId, null)}>
            Überspringen zurücknehmen
          </Button>
        )}
      </main>
      {!review && <RestBar />}

      {skipFor && (
        <Dialog
          title="Übung überspringen"
          actions={
            <>
              {SKIP_REASONS.map((r) => (
                <Button
                  key={r.value}
                  onClick={() => {
                    void skipExercise(session, skipFor.exerciseId, r.value)
                    setSkipFor(null)
                    clearRest()
                    go(nextIndex === -1 ? null : nextIndex)
                  }}
                >
                  {r.label}
                </Button>
              ))}
              <Button variant="quiet" onClick={() => setSkipFor(null)}>
                Doch nicht
              </Button>
            </>
          }
        >
          <p>Warum entfällt „{skipFor.name}“? Die Sätze fehlen dann bei den 80 %.</p>
        </Dialog>
      )}
    </div>
  )
}

function Checklist({ session, item }: { session: SessionLog; item: ResolvedItem }) {
  const checks = useApp((st) => st.checks)
  return (
    <ul className={s.list}>
      {item.checklist.map((c) => {
        const done = checks.some(
          (k) => k.sessionId === session.id && k.exerciseId === item.exerciseId && k.itemId === c.id && k.done,
        )
        return (
          <li key={c.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={done}
              className={m.check}
              onClick={() => void setCheck(session, 'checklist', item.exerciseId, c.id, c.text, !done)}
            >
              <span className={m.box} aria-hidden="true" />
              <span className={s.listMain}>
                <span>{c.text}</span>
                {c.dose && <span className={s.listSub}>{c.dose}</span>}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function SetEntry({
  plan,
  session,
  item,
  sessionSets,
  history,
  incrementOverride,
  onSaved,
}: {
  plan: Plan
  session: SessionLog
  item: ResolvedItem
  sessionSets: SetLog[]
  history: { sets: SetLog[]; sessionsById: Map<string, SessionLog> }
  incrementOverride: number | undefined
  onSaved: (sessionSets: SetLog[]) => void
}) {
  const slots = slotsOf(item)
  const [picked, setPicked] = useState<Slot | null>(null)
  const slot = picked ?? nextOpenSlot(item, sessionSets)
  const existing = slot ? findSet(sessionSets, item, slot) : undefined

  const recs = useMemo(() => {
    const map = new Map<string, Recommendation>()
    for (const side of item.sides) {
      map.set(String(side.side), recommend(plan, item, side.side, history, session, { incrementOverride, currentSessionId: session.id }))
    }
    if (item.logType === 'duration') map.set('null', recommend(plan, item, null, history, session, { currentSessionId: session.id }))
    return map
    // history wird bei jedem Render neu gebaut; maßgeblich ist die Satzzahl
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, item, session, incrementOverride, history.sets.length])
  const rec = slot ? recs.get(String(slot.side)) : undefined

  const weighted = item.logType === 'weight_reps' || item.logType === 'weight_time'
  const timed = item.logType === 'weight_time'
  const isDuration = item.logType === 'duration'

  const initial = (): SetInput & { minutes: number | null } => {
    if (existing) return { ...existing, minutes: existing.seconds !== null ? Math.round(existing.seconds / 60) : null }
    // Vorbelegung: letzter Satz dieser Seite in dieser Einheit, sonst Empfehlung
    const prev = slot
      ? [...sessionSets].reverse().find((x) => x.exerciseId === item.exerciseId && x.side === slot.side)
      : undefined
    return {
      weightKg: prev?.weightKg ?? rec?.prefill.weightKg ?? null,
      reps: prev?.reps ?? rec?.prefill.reps ?? null,
      seconds: prev?.seconds ?? rec?.prefill.seconds ?? null,
      rir: null,
      minutes: item.minutes?.[0] ?? null,
    }
  }
  const slotKey = slot ? `${slot.side}-${slot.setIndex}-${existing?.id ?? 'new'}` : 'none'
  const [form, setForm] = useState(initial)
  const [formKey, setFormKey] = useState(slotKey)
  if (formKey !== slotKey) {
    setFormKey(slotKey)
    setForm(initial())
  }

  const step = incrementOverride ?? item.incrementKg ?? 2.5
  const minWeight = 0
  const valid =
    slot !== null &&
    (isDuration
      ? (form.minutes ?? 0) > 0
      : (!weighted || (form.weightKg !== null && (form.weightKg > 0 || item.bodyweightAllowed))) &&
        (timed ? (form.seconds ?? 0) > 0 : (form.reps ?? 0) > 0))

  const saving = useRef(false)
  async function save() {
    if (!slot || !valid || saving.current) return
    saving.current = true
    const input: SetInput = isDuration
      ? { weightKg: null, reps: null, seconds: (form.minutes ?? 0) * 60, rir: null }
      : {
          weightKg: weighted ? form.weightKg : null,
          reps: timed ? null : form.reps,
          seconds: timed ? form.seconds : null,
          rir: item.targetRIR ? form.rir : null,
        }
    try {
      const saved = await saveSet(session, item, slot.side, slot.setIndex, input)
      const next = [...sessionSets.filter((x) => x.id !== saved.id), saved]
      setPicked(null)
      if (!existing) onSaved(next)
    } finally {
      saving.current = false
    }
  }

  const sides = isDuration ? [{ side: null, sets: 1 }] : item.sides
  const recText = rec ? recommendationText(item, rec) : null

  return (
    <>
      <div className={m.sets}>
        {sides.map((sd) => (
          <div key={String(sd.side)} className={m.sideBlock}>
            {sd.side && <p className={m.sideLabel}>{SIDE_LABEL[sd.side]}</p>}
            {slots
              .filter((x) => x.side === sd.side)
              .map((x) => {
                const set = findSet(sessionSets, item, x)
                const active = slot !== null && slot.side === x.side && slot.setIndex === x.setIndex
                return (
                  <button
                    key={x.setIndex}
                    type="button"
                    className={`${m.setRow} num`}
                    data-active={active}
                    data-done={Boolean(set)}
                    onClick={() => setPicked(x)}
                    aria-label={`${sd.side ? SIDE_LABEL[sd.side] + ' ' : ''}Satz ${x.setIndex + 1}${set ? ' ändern' : ''}`}
                  >
                    <span className={m.setNo}>{x.setIndex + 1}</span>
                    <span className={m.setVal}>{set ? describeSet(item, set) : '—'}</span>
                    <span className={m.setRir}>{set?.rir !== null && set?.rir !== undefined ? `RIR ${set.rir}` : ''}</span>
                    <span className={m.setMark} aria-hidden="true">
                      {set ? '✓' : '○'}
                    </span>
                  </button>
                )
              })}
          </div>
        ))}
      </div>

      {slot && (
        <div className={m.entry}>
          <p className={m.entryTitle}>
            {existing ? 'Satz ändern: ' : ''}
            {slot.side ? `${SIDE_LABEL[slot.side]} · ` : ''}
            {isDuration ? 'Dauer' : `Satz ${slot.setIndex + 1}`}
          </p>
          {recText && !existing && (
            <div className={s.rowBetween}>
              <p className={m.rec}>{recText}</p>
              {rec?.kind === 'load' && (
                <Button
                  variant="quiet"
                  onClick={() => setForm((f) => ({ ...f, weightKg: rec.prefill.weightKg, reps: rec.prefill.reps, seconds: rec.prefill.seconds }))}
                >
                  wie empfohlen
                </Button>
              )}
            </div>
          )}
          {weighted && (
            <Stepper
              label="Gewicht"
              unit="kg"
              value={form.weightKg}
              step={step}
              min={minWeight}
              format={formatKg}
              onChange={(weightKg) => setForm((f) => ({ ...f, weightKg }))}
            />
          )}
          {isDuration && (
            <Stepper label="Dauer" unit="min" value={form.minutes} step={5} max={300} onChange={(minutes) => setForm((f) => ({ ...f, minutes }))} />
          )}
          {timed && (
            <>
              <Stopwatch range={item.seconds} onStop={(seconds) => setForm((f) => ({ ...f, seconds }))} />
              <Stepper label="Zeit" unit="s" value={form.seconds} step={5} max={3600} onChange={(seconds) => setForm((f) => ({ ...f, seconds }))} />
            </>
          )}
          {!timed && !isDuration && (
            <Stepper label="Wiederholungen" unit="Wdh" value={form.reps} step={1} max={200} onChange={(reps) => setForm((f) => ({ ...f, reps }))} />
          )}
          {item.targetRIR && (
            <div className={m.rirRow}>
              <span className={m.rirLabel}>RIR</span>
              <Seg label="Wiederholungen in Reserve" value={form.rir} onChange={(rir) => setForm((f) => ({ ...f, rir }))} options={RIR_OPTIONS} />
            </div>
          )}
          <Button variant="primary" block disabled={!valid} onClick={() => void save()}>
            {existing ? 'Änderung speichern' : 'Satz speichern'}
          </Button>
          {existing && (
            <div className={s.rowBetween}>
              <Button variant="quiet" onClick={() => setPicked(null)}>
                Abbrechen
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  void deleteSet(existing.id)
                  setPicked(null)
                }}
              >
                Satz löschen
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
