import { addDays } from './dates'
import type { Plan } from './plan'
import type { DateStr, SessionLog, SetLog, Side } from './types'

const E1RM_MAX_REPS = 15

/** e1RM nach plan.progression.e1rmFormula; null, wenn der Satz nicht zählt. */
export function e1rm(set: SetLog): number | null {
  if (set.schonmodus || set.weightKg === null || set.reps === null) return null
  if (set.weightKg <= 0 || set.reps <= 0 || set.reps > E1RM_MAX_REPS) return null
  const rirUsed = set.rir ?? set.targetRirLow ?? 0
  return set.weightKg * (1 + (set.reps + rirUsed) / 30)
}

export function bestE1rm(
  sets: SetLog[],
  exerciseId: string,
  side: Side,
  from?: DateStr,
  to?: DateStr,
): number | null {
  let best: number | null = null
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || s.side !== side) continue
    if ((from && s.date < from) || (to && s.date > to)) continue
    const v = e1rm(s)
    if (v !== null && (best === null || v > best)) best = v
  }
  return best
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export interface SymmetryRow {
  exerciseId: string
  right: number | null
  left: number | null
  /** rechts / links, gedeckelt bei 1. */
  ratio: number | null
}

export interface SymmetryResult {
  rows: SymmetryRow[]
  groups: Record<string, number | null>
  index: number | null
}

export function symmetry(plan: Plan, sets: SetLog[], today: DateStr): SymmetryResult {
  const from = addDays(today, -(plan.symmetry.windowDays - 1))
  const rows = plan.symmetry.exercises.map((exerciseId): SymmetryRow => {
    const right = bestE1rm(sets, exerciseId, 'R', from, today)
    const left = bestE1rm(sets, exerciseId, 'L', from, today)
    const ratio = right !== null && left !== null && left > 0 ? Math.min(1, right / left) : null
    return { exerciseId, right, left, ratio }
  })
  const ratioOf = (id: string) => rows.find((r) => r.exerciseId === id)?.ratio ?? null
  const groups = Object.fromEntries(
    Object.entries(plan.symmetry.groups).map(([g, ids]) => [
      g,
      mean(ids.map(ratioOf).filter((r): r is number => r !== null)),
    ]),
  )
  return { rows, groups, index: mean(rows.map((r) => r.ratio).filter((r): r is number => r !== null)) }
}

const BASELINE_WEEKS = 2

export type Baseline = Record<string, { R: number | null; L: number | null }>

/** Bestes e1RM je Seite aus den ersten Programmwochen. */
export function baseline(plan: Plan, sets: SetLog[], sessions: SessionLog[]): Baseline {
  const early = new Set(
    sessions.filter((s) => s.programWeek >= 1 && s.programWeek <= BASELINE_WEEKS).map((s) => s.id),
  )
  const earlySets = sets.filter((s) => early.has(s.sessionId))
  return Object.fromEntries(
    plan.symmetry.exercises.map((id) => [
      id,
      { R: bestE1rm(earlySets, id, 'R'), L: bestE1rm(earlySets, id, 'L') },
    ]),
  )
}

export function baselineCaptured(base: Baseline): boolean {
  const rows = Object.values(base)
  return rows.length > 0 && rows.every((b) => b.R !== null && b.L !== null)
}

/** Übungen, die in den Zuwachs rechts eingehen: im Plan in symmetry.rightGain benannt. */
export function rightGainExercises(plan: Plan): string[] {
  const named = plan.symmetry.exercises.filter((id) => plan.symmetry.rightGain.includes(id))
  return named.length ? named : plan.symmetry.exercises
}

export interface RightGainResult {
  rows: { exerciseId: string; baseline: number | null; current: number | null; gain: number | null }[]
  gain: number | null
}

export function rightGain(plan: Plan, sets: SetLog[], base: Baseline, today: DateStr): RightGainResult {
  const from = addDays(today, -(plan.symmetry.windowDays - 1))
  const rows = rightGainExercises(plan).map((exerciseId) => {
    const b = base[exerciseId]?.R ?? null
    const current = bestE1rm(sets, exerciseId, 'R', from, today)
    return { exerciseId, baseline: b, current, gain: b && current !== null ? current / b - 1 : null }
  })
  // Erst aussagekräftig, wenn alle benannten Übungen Daten haben.
  const complete = rows.every((r) => r.gain !== null)
  return { rows, gain: complete ? mean(rows.map((r) => r.gain!)) : null }
}

/** Neue Bestwerte rechts je Einheit: bestes e1RM der Einheit schlägt alle früheren Einheiten. */
export function rightRecords(
  plan: Plan,
  sets: SetLog[],
  sessions: SessionLog[],
): Map<string, { exerciseId: string; e1rm: number }[]> {
  const order = new Map(sessions.map((s) => [s.id, s.startedAt]))
  const result = new Map<string, { exerciseId: string; e1rm: number }[]>()
  for (const exerciseId of plan.symmetry.exercises) {
    const perSession = new Map<string, number>()
    for (const s of sets) {
      if (s.exerciseId !== exerciseId || s.side !== 'R' || !order.has(s.sessionId)) continue
      const v = e1rm(s)
      if (v !== null && v > (perSession.get(s.sessionId) ?? 0)) perSession.set(s.sessionId, v)
    }
    const ordered = [...perSession.entries()].sort((a, b) => order.get(a[0])! - order.get(b[0])!)
    let best: number | null = null
    for (const [sessionId, value] of ordered) {
      if (best !== null && value > best) {
        result.set(sessionId, [...(result.get(sessionId) ?? []), { exerciseId, e1rm: value }])
      }
      if (best === null || value > best) best = value
    }
  }
  return result
}
