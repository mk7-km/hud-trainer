import { addDays, diffDays } from './dates'
import type { MarkCriterion, Plan } from './plan'
import type { DateStr, KneeCheckLog, KneeEvent, MarkReached } from './types'

export interface MarkFacts {
  fullWeeksTotal: number
  bestStreak: number
  baselineCaptured: boolean
  rightGain: number | null
  symmetryIndex: number | null
  calmDays: number
  selfChecks: Record<string, DateStr>
}

export interface CriterionResult {
  criterion: MarkCriterion
  ok: boolean
  /** Ist- und Sollwert für die Anzeige; null bei Ja/Nein-Kriterien. */
  actual: number | null
  required: number | null
}

export function evaluateCriterion(c: MarkCriterion, f: MarkFacts): CriterionResult {
  const numeric = (actual: number | null, required: number): CriterionResult => ({
    criterion: c,
    ok: actual !== null && actual >= required - 1e-9,
    actual,
    required,
  })
  switch (c.type) {
    case 'fullWeeksTotalMin':
      return numeric(f.fullWeeksTotal, c.value)
    case 'fullWeeksInRowMin':
      return numeric(f.bestStreak, c.value)
    case 'rightGainMin':
      return numeric(f.rightGain, c.value)
    case 'symmetryMin':
      return numeric(f.symmetryIndex, c.value)
    case 'calmDaysMin':
      return numeric(f.calmDays, c.value)
    case 'baselineCaptured':
      return { criterion: c, ok: f.baselineCaptured, actual: null, required: null }
    case 'selfCheck':
      return { criterion: c, ok: f.selfChecks[c.id] !== undefined, actual: null, required: null }
  }
}

export function evaluateMark(plan: Plan, level: number, facts: MarkFacts): CriterionResult[] {
  const mark = plan.marks.find((m) => m.level === level)
  return mark ? mark.criteria.map((c) => evaluateCriterion(c, facts)) : []
}

/** Stufen der Reihe nach; nie zurück. Liefert die neue höchste Stufe (≥ reachedLevel). */
export function advanceMarks(plan: Plan, reachedLevel: number, facts: MarkFacts): number {
  let level = reachedLevel
  for (;;) {
    const next = plan.marks.find((m) => m.level === level + 1)
    if (!next || !next.criteria.every((c) => evaluateCriterion(c, facts).ok)) return level
    level = next.level
  }
}

export function highestReached(reached: MarkReached[]): number {
  return reached.reduce((max, m) => Math.max(max, m.level), 0)
}

/** Zusammenhängende ruhige Tage bis heute: kein ROT-Status, kein Wegknick-/Blockade-Ereignis. */
export function calmDays(
  kneeChecks: KneeCheckLog[],
  events: KneeEvent[],
  programStart: DateStr | null,
  today: DateStr,
): number {
  if (!programStart || today < programStart) return 0
  const unruhig = [
    ...kneeChecks.filter((k) => k.status === 'red').map((k) => k.date),
    ...events.map((e) => e.date),
  ].filter((d) => d <= today)
  const lastBad = unruhig.reduce<DateStr | null>((m, d) => (m === null || d > m ? d : m), null)
  const from = lastBad !== null && lastBad >= programStart ? addDays(lastBad, 1) : programStart
  return Math.max(0, diffDays(today, from) + 1)
}
