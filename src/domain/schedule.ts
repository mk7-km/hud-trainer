import { addDays, diffDays, mondayOf } from './dates'
import type { Plan } from './plan'
import type { DateStr, Settings, WeekType } from './types'

/** Programmwoche eines Tages; ≤ 0 heißt: Programm hat noch nicht begonnen. */
export function programWeekOf(programStart: DateStr, date: DateStr): number {
  return Math.floor(diffDays(mondayOf(date), mondayOf(programStart)) / 7) + 1
}

/** Programmstart so verschieben, dass `date` in Programmwoche `week` liegt (Korrektur in SYSTEM). */
export function programStartForWeek(date: DateStr, week: number): DateStr {
  return addDays(mondayOf(date), -(week - 1) * 7)
}

export function weekEntry(plan: Plan, week: number): { type: WeekType; block: number } {
  const w = Math.max(1, week)
  const entry = plan.schedule.weeks.find((e) => w >= e.from && (e.to === null || w <= e.to))
  // Lücke im Plan: letzte definierte Zeile gilt weiter.
  const fallback = plan.schedule.weeks[plan.schedule.weeks.length - 1]!
  const { type, block } = entry ?? fallback
  return { type, block }
}

export type LockReason = 'notStarted' | 'restBeforeOp' | 'opReached' | 'repair'

export interface DayContext {
  date: DateStr
  programWeek: number
  weekType: WeekType
  block: number
  taper: boolean
  /** Tage bis zur OP (0 = OP-Tag, negativ = danach), null ohne OP-Datum. */
  daysToOp: number | null
  /** Grund, warum heute keine Einheit gestartet werden darf. */
  locked: LockReason | null
  /** OP-Datum erreicht, aber noch nicht bestätigt: App fragt „OP erfolgt?“. */
  askOpDone: boolean
}

type ScheduleSettings = Pick<Settings, 'programStart' | 'opDate' | 'repairMode' | 'opAskedFor'>

export function dayContext(plan: Plan, settings: ScheduleSettings, date: DateStr): DayContext {
  const { taper: taperRule } = plan.schedule
  const programWeek = settings.programStart ? programWeekOf(settings.programStart, date) : 0
  let { type: weekType, block } = weekEntry(plan, programWeek)

  const daysToOp = settings.opDate ? diffDays(settings.opDate, date) : null
  const taper = daysToOp !== null && daysToOp >= 1 && daysToOp <= taperRule.daysBeforeOp

  if (taper && settings.programStart && settings.opDate) {
    // Block eingefroren: Es gilt der Block vom Tag vor Taper-Beginn.
    const dayBeforeTaper = addDays(settings.opDate, -(taperRule.daysBeforeOp + 1))
    block = weekEntry(plan, programWeekOf(settings.programStart, dayBeforeTaper)).block
  }
  if (taper && weekType === 'deload') weekType = 'normal' // Taper ersetzt den Deload, kein doppelter Faktor

  let locked: LockReason | null = null
  if (settings.repairMode) locked = 'repair'
  else if (daysToOp !== null && daysToOp <= 0) locked = 'opReached'
  else if (daysToOp !== null && daysToOp <= taperRule.restDaysBeforeOp) locked = 'restBeforeOp'
  else if (programWeek < 1) locked = 'notStarted'

  const askOpDone =
    !settings.repairMode &&
    daysToOp !== null &&
    daysToOp <= 0 &&
    settings.opAskedFor !== settings.opDate

  return { date, programWeek, weekType, block, taper, daysToOp, locked, askOpDone }
}

/** Geplante Satzzahl nach Wochentyp und Taper. */
export function plannedSets(
  plan: Plan,
  baseSets: number,
  ctx: Pick<DayContext, 'weekType' | 'taper'>,
): number {
  if (baseSets <= 0) return 0
  const { calibration, deload, taper } = plan.schedule
  let sets = baseSets
  if (ctx.weekType === 'calibration') sets = Math.min(sets, calibration.maxSets)
  if (ctx.taper) sets = Math.ceil(sets * taper.setFactor)
  else if (ctx.weekType === 'deload') sets = Math.ceil(sets * deload.setFactor)
  return sets
}

/** Wochen (Montage), die für Serien weder positiv noch negativ zählen. */
export function isNeutralWeek(
  plan: Plan,
  settings: Pick<Settings, 'programStart' | 'opDate' | 'repairSince'>,
  monday: DateStr,
): boolean {
  if (!settings.programStart || monday < mondayOf(settings.programStart)) return true
  const opWeek = settings.opDate !== null && mondayOf(settings.opDate) === monday
  if (opWeek && !plan.schedule.taper.opWeekCountsForStreak) return true
  if (settings.repairSince && monday >= mondayOf(settings.repairSince)) return true
  return false
}
