import { db, newId } from '../db/db'
import { localDate } from '../domain/dates'
import { deriveKnee, type KneeAnswers, type KneeResult } from '../domain/knee'
import type { Plan } from '../domain/plan'
import { doneUnits, finishStatus } from '../domain/scoring'
import type { DayContext } from '../domain/schedule'
import { resolveSession, type ResolvedItem, type ResolvedSession } from '../domain/sessionPlan'
import type { CheckLog, KneeEvent, SessionLog, SetLog, Side, SkipReason } from '../domain/types'
import { useApp } from './store'

const tz = (plan: Plan) => plan.schedule.timezone

/** Knie-Check speichern und Einheit anlegen (aktiv oder bei Rot + Unterkörper ausgesetzt). */
export async function beginSession(
  plan: Plan,
  templateId: string,
  ctx: DayContext,
  answers: KneeAnswers,
): Promise<{ session: SessionLog; knee: KneeResult }> {
  const now = Date.now()
  const date = localDate(now, tz(plan))
  const knee = deriveKnee(plan, answers)
  const resolved = resolveSession(plan, templateId, ctx, knee.status)
  const t = resolved.template

  const session: SessionLog = {
    id: newId(),
    sessionTemplateId: t.id,
    sessionName: t.name,
    sessionType: t.type,
    focus: t.focus,
    planVersion: plan.planVersion,
    programWeek: ctx.programWeek,
    weekType: ctx.weekType,
    block: ctx.block,
    taper: ctx.taper,
    date,
    startedAt: now,
    endedAt: resolved.suspended ? now : null,
    status: resolved.suspended ? 'suspended_red' : 'active',
    kneeStatus: knee.status,
    plannedUnits: resolved.plannedUnits,
    choices: {},
    skipped: [],
  }
  const events: KneeEvent[] = []
  if (knee.givingWay) events.push({ id: newId(), date, at: now, type: 'givingWay', source: 'check' })
  if (knee.locking) events.push({ id: newId(), date, at: now, type: 'locking', source: 'check' })
  const check = { id: newId(), sessionId: session.id, date, at: now, answers, status: knee.status }

  await db.transaction('rw', db.sessions, db.kneeChecks, db.kneeEvents, async () => {
    await db.sessions.add(session)
    await db.kneeChecks.add(check)
    if (events.length) await db.kneeEvents.bulkAdd(events)
  })
  useApp.setState((s) => ({
    sessions: [...s.sessions, session],
    kneeChecks: [...s.kneeChecks, check],
    kneeEvents: [...s.kneeEvents, ...events],
  }))
  return { session, knee }
}

/** Geplante Einheit aus den in der Sitzung gespeicherten Rahmendaten wiederherstellen. */
export function resolveFor(plan: Plan, session: SessionLog): ResolvedSession | null {
  try {
    return resolveSession(plan, session.sessionTemplateId, session, session.kneeStatus, session.choices)
  } catch {
    return null // Vorlage existiert im aktuellen Plan nicht mehr
  }
}

async function patchSession(id: string, patch: Partial<SessionLog>) {
  await db.sessions.update(id, patch)
  useApp.setState((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
}

export async function chooseExercise(plan: Plan, session: SessionLog, itemIndex: number, exerciseId: string) {
  const choices = { ...session.choices, [String(itemIndex)]: exerciseId }
  const plannedUnits = resolveSession(plan, session.sessionTemplateId, session, session.kneeStatus, choices).plannedUnits
  await patchSession(session.id, { choices, plannedUnits })
}

export interface SetInput {
  weightKg: number | null
  reps: number | null
  seconds: number | null
  rir: number | null
}

/** Satz sofort persistieren. Ein vorhandener Satz an derselben Stelle wird ersetzt (Korrektur). */
export async function saveSet(
  session: SessionLog,
  item: ResolvedItem,
  side: Side | null,
  setIndex: number,
  input: SetInput,
): Promise<SetLog> {
  const existing = useApp
    .getState()
    .sets.find(
      (s) => s.sessionId === session.id && s.exerciseId === item.exerciseId && s.side === side && s.setIndex === setIndex,
    )
  const set: SetLog = {
    id: existing?.id ?? newId(),
    sessionId: session.id,
    date: session.date,
    exerciseId: item.exerciseId,
    variantId: item.variantId,
    exerciseName: item.variantLabel ? `${item.name} (${item.variantLabel})` : item.name,
    side,
    setIndex,
    ...input,
    targetRirLow: item.targetRIR?.[0] ?? null,
    schonmodus: existing?.schonmodus ?? item.schonmodus,
    loggedAt: existing?.loggedAt ?? Date.now(),
  }
  await db.sets.put(set)
  useApp.setState((s) => ({ sets: existing ? s.sets.map((x) => (x.id === set.id ? set : x)) : [...s.sets, set] }))
  return set
}

export async function deleteSet(id: string) {
  await db.sets.delete(id)
  useApp.setState((s) => ({ sets: s.sets.filter((x) => x.id !== id) }))
}

export async function setCheck(
  session: SessionLog,
  kind: CheckLog['kind'],
  exerciseId: string | null,
  itemId: string,
  text: string,
  done: boolean,
) {
  const id = `${session.id}|${kind}|${exerciseId ?? ''}|${itemId}`
  const check: CheckLog = { id, sessionId: session.id, kind, exerciseId, itemId, text, done, at: Date.now() }
  await db.checks.put(check)
  useApp.setState((s) => ({ checks: [...s.checks.filter((c) => c.id !== id), check] }))
}

export async function skipExercise(session: SessionLog, exerciseId: string, reason: SkipReason | null) {
  const skipped = session.skipped.filter((x) => x.exerciseId !== exerciseId)
  if (reason) skipped.push({ exerciseId, reason })
  await patchSession(session.id, { skipped })
}

export function sessionProgress(session: SessionLog, resolved: ResolvedSession | null) {
  const { sets, checks } = useApp.getState()
  const sizes = Object.fromEntries(
    (resolved?.items ?? []).filter((i) => i.logType === 'checklist').map((i) => [i.exerciseId, i.checklist.length]),
  )
  const done = doneUnits(session.id, sets, checks, sizes)
  return { done, planned: session.plannedUnits }
}

/** Einheit beenden: ab der Schwelle abgeschlossen, darunter abgebrochen. */
export async function finishSession(plan: Plan, session: SessionLog): Promise<SessionLog> {
  const { done, planned } = sessionProgress(session, resolveFor(plan, session))
  const patch = { status: finishStatus(plan, done, planned), endedAt: Date.now() }
  await patchSession(session.id, patch)
  return { ...session, ...patch }
}

export async function reportGivingWay(plan: Plan) {
  const now = Date.now()
  const event: KneeEvent = { id: newId(), date: localDate(now, tz(plan)), at: now, type: 'givingWay', source: 'manual' }
  await db.kneeEvents.add(event)
  useApp.setState((s) => ({ kneeEvents: [...s.kneeEvents, event] }))
}
