import { diffDays } from './dates'
import type { Plan } from './plan'
import { historyKey } from './sessionPlan'
import { baseline, e1rm, rightGain, symmetry } from './strength'
import type { DateStr, SessionLog, SetLog } from './types'

export interface TrendPoint {
  date: DateStr
  symmetry: number | null
  gain: number | null
}

/** Symmetrie und Zuwachs rechts zu jedem Trainingstag mit Symmetrie-Daten. */
export function strengthTrend(plan: Plan, sets: SetLog[], sessions: SessionLog[]): TrendPoint[] {
  const ids = new Set(plan.symmetry.exercises)
  const dates = [...new Set(sets.filter((s) => ids.has(s.exerciseId) && !s.schonmodus).map((s) => s.date))].sort()
  const base = baseline(plan, sets, sessions)
  return dates.map((date) => {
    const upTo = sets.filter((s) => s.date <= date)
    return { date, symmetry: symmetry(plan, upTo, date).index, gain: rightGain(plan, upTo, base, date).gain }
  })
}

export const dayNumber = (date: DateStr, origin: DateStr) => diffDays(date, origin)

export interface ExerciseKey {
  key: string
  exerciseId: string
  variantId: string | null
  name: string
  lastDate: DateStr
}

/** Alle protokollierten Übungen (mit Variante), zuletzt trainierte zuerst. */
export function loggedExercises(sets: SetLog[]): ExerciseKey[] {
  const map = new Map<string, ExerciseKey>()
  for (const s of sets) {
    const key = historyKey(s.exerciseId, s.variantId)
    const prev = map.get(key)
    if (!prev || s.date >= prev.lastDate) {
      map.set(key, { key, exerciseId: s.exerciseId, variantId: s.variantId, name: s.exerciseName, lastDate: s.date })
    }
  }
  return [...map.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name, 'de'))
}

export interface ExerciseDay {
  sessionId: string
  date: DateStr
  schonmodus: boolean
  sets: SetLog[]
  /** Bestes e1RM des Tages je Seite ('R', 'L' oder 'B' für beidseitig). */
  best: Partial<Record<'R' | 'L' | 'B', number>>
}

export function exerciseHistory(sets: SetLog[], key: string): ExerciseDay[] {
  const bySession = new Map<string, ExerciseDay>()
  for (const s of sets) {
    if (historyKey(s.exerciseId, s.variantId) !== key) continue
    const day = bySession.get(s.sessionId) ?? { sessionId: s.sessionId, date: s.date, schonmodus: false, sets: [], best: {} }
    day.sets.push(s)
    day.schonmodus ||= s.schonmodus
    const v = e1rm(s)
    const side = s.side ?? 'B'
    if (v !== null && v > (day.best[side] ?? 0)) day.best[side] = v
    bySession.set(s.sessionId, day)
  }
  const days = [...bySession.values()]
  for (const d of days) d.sets.sort((a, b) => (a.side ?? '').localeCompare(b.side ?? '') * -1 || a.setIndex - b.setIndex)
  return days.sort((a, b) => b.date.localeCompare(a.date))
}
