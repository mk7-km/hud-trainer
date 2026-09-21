import { addDays, mondayOf } from './dates'
import type { Plan } from './plan'
import { isNeutralWeek } from './schedule'
import { rightRecords } from './strength'
import type { CheckLog, DateStr, SessionLog, SessionStatus, SetLog, Settings } from './types'

/** Erledigte Einheiten einer Sitzung: Sätze + vollständig abgehakte Checklisten. */
export function doneUnits(
  sessionId: string,
  sets: SetLog[],
  checks: CheckLog[],
  checklistSizes: Record<string, number>,
): number {
  const setCount = sets.filter((s) => s.sessionId === sessionId).length
  const doneByExercise = new Map<string, number>()
  for (const c of checks) {
    if (c.sessionId !== sessionId || c.kind !== 'checklist' || !c.done || !c.exerciseId) continue
    doneByExercise.set(c.exerciseId, (doneByExercise.get(c.exerciseId) ?? 0) + 1)
  }
  let lists = 0
  for (const [exerciseId, size] of Object.entries(checklistSizes)) {
    if (size > 0 && (doneByExercise.get(exerciseId) ?? 0) >= size) lists++
  }
  return setCount + lists
}

export function completionRatio(done: number, planned: number): number {
  return planned <= 0 ? 0 : Math.min(1, done / planned)
}

export function finishStatus(plan: Plan, done: number, planned: number): SessionStatus {
  return completionRatio(done, planned) >= plan.points.sessionCompleteThreshold
    ? 'completed'
    : 'aborted'
}

const counts = (s: SessionLog) => s.status === 'completed' || s.status === 'suspended_red'

export interface WeekSummary {
  monday: DateStr
  pflichtDone: number
  bonusDone: number
  pflichtTarget: number
  bonusTarget: number
  full: boolean
  perfect: boolean
  /** Reaktorstand: Anteil der Pflichteinheiten. */
  pct: number
  /** Vorlagen-IDs, die diese Woche als erfüllt zählen. */
  fulfilled: Set<string>
}

export function weekSummary(plan: Plan, sessions: SessionLog[], monday: DateStr): WeekSummary {
  const sunday = addDays(monday, 6)
  const inWeek = sessions.filter((s) => s.date >= monday && s.date <= sunday && counts(s))
  const distinct = (type: 'pflicht' | 'bonus') =>
    new Set(inWeek.filter((s) => s.sessionType === type).map((s) => s.sessionTemplateId))
  const pflichtTarget = plan.schedule.pflichtPerWeek
  const bonusTarget = plan.schedule.bonusPerWeek
  const pflicht = distinct('pflicht')
  const bonus = distinct('bonus')
  const pflichtDone = Math.min(pflicht.size, pflichtTarget)
  const bonusDone = Math.min(bonus.size, bonusTarget)
  const full = pflichtDone >= pflichtTarget
  return {
    monday,
    pflichtDone,
    bonusDone,
    pflichtTarget,
    bonusTarget,
    full,
    perfect: full && bonusDone >= bonusTarget,
    pct: Math.round((pflichtDone / pflichtTarget) * 100),
    fulfilled: new Set([...pflicht, ...bonus]),
  }
}

/** Punkte einer einzelnen Sitzung ohne Bestwert-Bonus. */
export function sessionBasePoints(plan: Plan, s: SessionLog): number {
  if (s.status !== 'completed') return 0 // ausgesetzte ROT-Einheiten erfüllen das Wochenziel, bringen aber keine Punkte
  if (s.sessionType === 'pflicht') return plan.points.pflichtSession
  return s.kneeStatus === 'red' ? plan.points.redReplacementMobility : plan.points.bonusSession
}

export interface PointsResult {
  total: number
  bySession: Map<string, { base: number; records: number }>
  byWeek: Map<DateStr, number>
}

export function points(plan: Plan, sessions: SessionLog[], sets: SetLog[]): PointsResult {
  const completed = sessions.filter((s) => s.status === 'completed')
  const records = rightRecords(plan, sets, completed)
  const bySession = new Map<string, { base: number; records: number }>()
  const seenPerWeek = new Set<string>()
  let total = 0

  for (const s of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    // Dieselbe Vorlage zählt pro Woche nur einmal.
    const key = `${mondayOf(s.date)}|${s.sessionTemplateId}`
    const repeat = seenPerWeek.has(key)
    if (counts(s)) seenPerWeek.add(key)
    const base = repeat ? 0 : sessionBasePoints(plan, s)
    const rec = (records.get(s.id)?.length ?? 0) * plan.points.newRightLegRecord
    bySession.set(s.id, { base, records: rec })
    total += base + rec
  }

  const byWeek = new Map<DateStr, number>()
  for (const monday of new Set(sessions.map((s) => mondayOf(s.date)))) {
    const w = weekSummary(plan, sessions, monday)
    const bonus = (w.full ? plan.points.weekAllPflicht : 0) + (w.perfect ? plan.points.perfectWeekExtra : 0)
    if (bonus > 0) byWeek.set(monday, bonus)
    total += bonus
  }
  return { total, bySession, byWeek }
}

export interface StreakResult {
  current: number
  best: number
  fullWeeksTotal: number
  /** Abgeschlossene Wochen in zeitlicher Folge (ohne neutrale Wochen). */
  weeks: { monday: DateStr; full: boolean; summary: WeekSummary }[]
}

type StreakSettings = Pick<Settings, 'programStart' | 'opDate' | 'repairSince'>

export function streaks(
  plan: Plan,
  sessions: SessionLog[],
  settings: StreakSettings,
  today: DateStr,
): StreakResult {
  const result: StreakResult = { current: 0, best: 0, fullWeeksTotal: 0, weeks: [] }
  if (!settings.programStart) return result
  const thisMonday = mondayOf(today)

  for (let monday = mondayOf(settings.programStart); monday <= thisMonday; monday = addDays(monday, 7)) {
    if (isNeutralWeek(plan, settings, monday)) continue
    const summary = weekSummary(plan, sessions, monday)
    const running = monday === thisMonday
    // Die laufende Woche kann eine Serie verlängern, aber erst nach Sonntag 23:59 beenden.
    if (running && !summary.full) continue
    if (!running) result.weeks.push({ monday, full: summary.full, summary })
    if (summary.full) {
      result.current++
      result.fullWeeksTotal++
      result.best = Math.max(result.best, result.current)
    } else {
      result.current = 0
    }
  }
  return result
}

/** Tage seit der letzten abgeschlossenen Einheit; null, wenn es noch keine gibt. */
export function lastCompletedDate(sessions: SessionLog[]): DateStr | null {
  return sessions.filter(counts).reduce<DateStr | null>((d, s) => (d === null || s.date > d ? s.date : d), null)
}
