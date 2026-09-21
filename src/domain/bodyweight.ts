import { addDays, mondayOf } from './dates'
import type { Plan } from './plan'
import type { BodyweightLog, DateStr } from './types'

/** Mittel der Wägungen in den 7 Tagen bis einschließlich `date`. */
export function average7(entries: BodyweightLog[], date: DateStr): number | null {
  const from = addDays(date, -6)
  const xs = entries.filter((e) => e.date >= from && e.date <= date).map((e) => e.weightKg)
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

/** Veränderung des 7-Tage-Schnitts gegenüber der Vorwoche (negativ = Abnahme). */
export function weeklyTrend(entries: BodyweightLog[], date: DateStr): number | null {
  const now = average7(entries, date)
  const before = average7(entries, addDays(date, -7))
  return now !== null && before !== null ? now - before : null
}

export function weighInsThisWeek(entries: BodyweightLog[], today: DateStr): number {
  const monday = mondayOf(today)
  return new Set(entries.filter((e) => e.date >= monday && e.date <= today).map((e) => e.date)).size
}

/** Zwei Wochen in Folge schneller gefallen als die obere Zielgrenze. */
export function losingTooFast(plan: Plan, entries: BodyweightLog[], today: DateStr): boolean {
  const limit = plan.bodyweight.targetLossPerWeekKg[1]
  const recent = weeklyTrend(entries, today)
  const earlier = weeklyTrend(entries, addDays(today, -7))
  return recent !== null && earlier !== null && -recent > limit && -earlier > limit
}
