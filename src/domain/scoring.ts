import { addDays, mondayOf } from './dates'
import { rulesOf, type Plan, type PlanRules, type RulesArchive } from './plan'
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

/** Regeln der Planversion, unter der eine Einheit protokolliert wurde; unbekannte Versionen: aktueller Plan. */
export function rulesFor(plan: Plan, archive: RulesArchive | undefined, planVersion: string): PlanRules {
  return archive?.[planVersion] ?? rulesOf(plan)
}

const counts = (s: SessionLog, rules: PlanRules) =>
  s.status === 'completed' || (s.status === 'suspended_red' && rules.suspendedCountsAsFulfilled)

/**
 * Regeln einer Woche: Vergangene Wochen zählen nach der Planversion ihrer zuletzt begonnenen Einheit;
 * die laufende Woche (und spätere) nach dem aktuellen Plan.
 */
function weekRules(plan: Plan, archive: RulesArchive | undefined, monday: DateStr, inWeek: SessionLog[], today?: DateStr): PlanRules {
  if (today !== undefined && monday >= mondayOf(today)) return rulesOf(plan)
  const last = inWeek.reduce<SessionLog | null>((a, s) => (!a || s.startedAt > a.startedAt ? s : a), null)
  return last ? rulesFor(plan, archive, last.planVersion) : rulesOf(plan)
}

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

export function weekSummary(plan: Plan, sessions: SessionLog[], monday: DateStr, archive?: RulesArchive, today?: DateStr): WeekSummary {
  const sunday = addDays(monday, 6)
  const all = sessions.filter((s) => s.date >= monday && s.date <= sunday)
  const rules = weekRules(plan, archive, monday, all, today)
  const inWeek = all.filter((s) => counts(s, rulesFor(plan, archive, s.planVersion)))
  const distinct = (type: 'pflicht' | 'bonus') =>
    new Set(inWeek.filter((s) => s.sessionType === type).map((s) => s.sessionTemplateId))
  const pflichtTarget = rules.pflichtPerWeek
  const bonusTarget = rules.bonusPerWeek
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
    perfect: full && bonusTarget > 0 && bonusDone >= bonusTarget,
    pct: Math.round((pflichtDone / pflichtTarget) * 100),
    fulfilled: new Set([...pflicht, ...bonus]),
  }
}

/** Punkte einer einzelnen Sitzung ohne Bestwert-Bonus, nach den Regeln ihrer Planversion. */
export function sessionBasePoints(rules: PlanRules, s: SessionLog): number {
  if (s.status !== 'completed') return 0 // ausgesetzte ROT-Einheiten erfüllen das Wochenziel, bringen aber keine Punkte
  if (s.sessionType === 'pflicht') return rules.pflichtSession
  return s.kneeStatus === 'red' ? rules.redReplacementMobility : rules.bonusSession
}

export interface PointsResult {
  total: number
  bySession: Map<string, { base: number; records: number }>
  byWeek: Map<DateStr, number>
}

export function points(plan: Plan, sessions: SessionLog[], sets: SetLog[], archive?: RulesArchive, today?: DateStr): PointsResult {
  const completed = sessions.filter((s) => s.status === 'completed')
  const records = rightRecords(plan, sets, completed)
  const bySession = new Map<string, { base: number; records: number }>()
  const seenPerWeek = new Set<string>()
  let total = 0

  for (const s of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    // Dieselbe Vorlage zählt pro Woche nur einmal.
    const key = `${mondayOf(s.date)}|${s.sessionTemplateId}`
    const rules = rulesFor(plan, archive, s.planVersion)
    const repeat = seenPerWeek.has(key)
    if (counts(s, rules)) seenPerWeek.add(key)
    const base = repeat ? 0 : sessionBasePoints(rules, s)
    const rec = (records.get(s.id)?.length ?? 0) * plan.points.newRightLegRecord
    bySession.set(s.id, { base, records: rec })
    total += base + rec
  }

  const byWeek = new Map<DateStr, number>()
  for (const monday of new Set(sessions.map((s) => mondayOf(s.date)))) {
    const w = weekSummary(plan, sessions, monday, archive, today)
    const rules = weekRules(plan, archive, monday, sessions.filter((s) => mondayOf(s.date) === monday), today)
    const bonus = (w.full ? rules.weekAllPflicht : 0) + (w.perfect ? rules.perfectWeekExtra : 0)
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
  archive?: RulesArchive,
): StreakResult {
  const result: StreakResult = { current: 0, best: 0, fullWeeksTotal: 0, weeks: [] }
  if (!settings.programStart) return result
  const thisMonday = mondayOf(today)

  for (let monday = mondayOf(settings.programStart); monday <= thisMonday; monday = addDays(monday, 7)) {
    if (isNeutralWeek(plan, settings, monday)) continue
    const summary = weekSummary(plan, sessions, monday, archive, today)
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
  return sessions.filter((s) => s.status === 'completed' || s.status === 'suspended_red').reduce<DateStr | null>((d, s) => (d === null || s.date > d ? s.date : d), null)
}
