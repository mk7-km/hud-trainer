import { addDays, diffDays, mondayOf, weekdayIndex } from './dates'
import { losingTooFast, weighInsThisWeek } from './bodyweight'
import type { Plan } from './plan'
import { lastCompletedDate, weekSummary, type StreakResult, type WeekSummary } from './scoring'
import type { DayContext } from './schedule'
import type { BodyweightLog, DateStr, SessionLog, Settings } from './types'

export const BACKUP_OVERDUE_DAYS = 7
export const INACTIVITY_DAYS = 4
/** Ab Donnerstag wird an fehlende Wägungen erinnert. */
const WEIGH_IN_REMINDER_FROM = 3

export type WarningKind = 'backupOverdue' | 'storage' | 'weighInMissing' | 'weightLossTooFast' | 'inactivity'

export interface Warning {
  kind: WarningKind
  days?: number
  done?: number
}

export interface HomeInput {
  plan: Plan
  ctx: DayContext
  week: WeekSummary
  streak: StreakResult
  settings: Pick<Settings, 'lastBackupAt' | 'persistGranted' | 'repairMode' | 'programStart'>
  sessions: SessionLog[]
  bodyweight: BodyweightLog[]
  today: DateStr
  now: number
}

/** Warnungen für HOME. Im Reparaturmodus und vor Programmstart gibt es keine Mahnungen (Backup ausgenommen). */
export function homeWarnings(i: HomeInput): Warning[] {
  const out: Warning[] = []
  const hasData = i.sessions.length > 0 || i.bodyweight.length > 0
  const backupDays = i.settings.lastBackupAt === null ? null : Math.floor((i.now - i.settings.lastBackupAt) / 86_400_000)
  if (hasData && (backupDays === null || backupDays > BACKUP_OVERDUE_DAYS)) {
    out.push({ kind: 'backupOverdue', days: backupDays ?? undefined })
  }
  if (i.settings.persistGranted === false) out.push({ kind: 'storage' })
  if (i.settings.repairMode || i.ctx.programWeek < 1) return out

  if (losingTooFast(i.plan, i.bodyweight, i.today)) out.push({ kind: 'weightLossTooFast' })
  const weighIns = weighInsThisWeek(i.bodyweight, i.today)
  if (weighIns < i.plan.bodyweight.weighInsPerWeekMin && weekdayIndex(i.today) >= WEIGH_IN_REMINDER_FROM) {
    out.push({ kind: 'weighInMissing', done: weighIns })
  }
  if (!i.ctx.locked) {
    const last = lastCompletedDate(i.sessions) ?? (i.settings.programStart && i.settings.programStart <= i.today ? addDays(i.settings.programStart, -1) : null)
    const idle = last ? diffDays(i.today, last) : 0
    if (idle >= INACTIVITY_DAYS) out.push({ kind: 'inactivity', days: idle })
  }
  return out
}

export type LineKey =
  | 'repairMode'
  | 'restBeforeOp'
  | 'backupOverdue'
  | 'weightLossTooFast'
  | 'inactivity'
  | 'weekFailed'
  | 'weekComplete'
  | 'perfectWeek'
  | 'taper'
  | 'calibrationWeek'
  | 'deloadWeek'
  | 'weighInMissing'
  | 'opCountdown'
  | 'homeStatusDone'
  | 'homeStatusOpen'
  | 'greeting'

export interface LineChoice {
  key: LineKey
  vars: Record<string, string | number>
}

const OP_COUNTDOWN_FROM_DAYS = 30

/** Genau eine J.A.R.V.I.S.-Zeile für HOME, nach Dringlichkeit. */
export function homeLine(i: HomeInput): LineChoice {
  const { ctx, week } = i
  if (ctx.locked === 'repair') return { key: 'repairMode', vars: {} }
  if (ctx.locked === 'restBeforeOp') return { key: 'restBeforeOp', vars: {} }
  if (ctx.locked) return { key: 'greeting', vars: {} }

  const warnings = homeWarnings(i)
  const find = (k: WarningKind) => warnings.find((w) => w.kind === k)
  const backup = find('backupOverdue')
  if (backup) return { key: 'backupOverdue', vars: backup.days === undefined ? {} : { days: backup.days } }
  if (find('weightLossTooFast')) return { key: 'weightLossTooFast', vars: {} }

  // Montag und Dienstag: Bilanz der Vorwoche, solange in der neuen Woche noch nichts erledigt ist.
  const last = i.streak.weeks[i.streak.weeks.length - 1]
  if (last && last.monday === addDays(mondayOf(i.today), -7) && weekdayIndex(i.today) <= 1 && week.pflichtDone === 0) {
    const s = last.summary
    if (s.perfect) return { key: 'perfectWeek', vars: {} }
    if (s.full) return { key: 'weekComplete', vars: { weeks: i.streak.current } }
    return { key: 'weekFailed', vars: { done: s.pflichtDone, pct: s.pct } }
  }

  const idle = find('inactivity')
  if (idle) return { key: 'inactivity', vars: { days: idle.days! } }

  if (ctx.taper) return { key: 'taper', vars: {} }
  if (ctx.weekType === 'calibration') return { key: 'calibrationWeek', vars: {} }
  if (ctx.weekType === 'deload') return { key: 'deloadWeek', vars: {} }
  const weigh = find('weighInMissing')
  if (weigh) return { key: 'weighInMissing', vars: { done: weigh.done! } }

  if (week.full) {
    if (ctx.daysToOp !== null && ctx.daysToOp <= OP_COUNTDOWN_FROM_DAYS) return { key: 'opCountdown', vars: { days: ctx.daysToOp } }
    return { key: 'homeStatusDone', vars: {} }
  }
  return { key: 'homeStatusOpen', vars: { open: week.pflichtTarget - week.pflichtDone, done: week.pflichtDone, pct: week.pct } }
}

/** Zeile nach Abschluss einer Einheit: Wochenereignis vor Bestwert vor Standard. */
export function completionLine(
  plan: Plan,
  sessionsAfter: SessionLog[],
  session: SessionLog,
  streakCurrent: number,
  record: { exercise: string; kg: number } | null,
  pct: number,
): LineChoice | { key: 'newRecordRight' | 'missionComplete' | 'sessionAborted'; vars: Record<string, string | number> } {
  if (session.status !== 'completed') return { key: 'sessionAborted', vars: {} }
  const monday = mondayOf(session.date)
  const after = weekSummary(plan, sessionsAfter, monday)
  const before = weekSummary(plan, sessionsAfter.filter((s) => s.id !== session.id), monday)
  if (after.perfect && !before.perfect) return { key: 'perfectWeek', vars: {} }
  if (after.full && !before.full) return { key: 'weekComplete', vars: { weeks: streakCurrent } }
  if (record) return { key: 'newRecordRight', vars: record }
  return { key: 'missionComplete', vars: { pct } }
}
