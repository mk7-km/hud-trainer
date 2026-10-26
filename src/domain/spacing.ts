import { diffDays } from './dates'
import { spacingRules, type Plan, type SpacingRule } from './plan'
import type { DateStr, SessionLog } from './types'

export interface SpacingConflict {
  rule: SpacingRule
  kind: 'minHours' | 'consecutive'
  /** Einheit, zu der der Abstand zu kurz ist (Vorlagen-ID und gespeicherter Name). */
  otherId: string
  otherName: string
  /** minHours: Stunden seit dem Ende der anderen Einheit und Zeitpunkt, ab dem es wieder geht. */
  hours?: number
  freeAt?: number
  /** consecutive: Datum der anderen Einheit. */
  otherDate?: DateStr
}

const HOUR = 3_600_000

/** Verstöße gegen schedule.spacingRules, wenn `templateId` jetzt gestartet würde. */
export function spacingConflicts(
  plan: Plan,
  sessions: SessionLog[],
  templateId: string,
  now: number,
  today: DateStr,
): SpacingConflict[] {
  const done = sessions.filter((s) => s.status === 'completed')
  const out: SpacingConflict[] = []

  for (const rule of spacingRules(plan)) {
    if (!rule.sessions.includes(templateId)) continue
    const related = done.filter((s) => rule.sessions.includes(s.sessionTemplateId))

    if (rule.minHours !== undefined) {
      const last = related.reduce<SessionLog | null>((a, s) => (!a || (s.endedAt ?? s.startedAt) > (a.endedAt ?? a.startedAt) ? s : a), null)
      if (last) {
        const end = last.endedAt ?? last.startedAt
        if (now - end < rule.minHours * HOUR) {
          out.push({
            rule,
            kind: 'minHours',
            otherId: last.sessionTemplateId,
            otherName: last.sessionName,
            hours: Math.floor((now - end) / HOUR),
            freeAt: end + rule.minHours * HOUR,
          })
        }
      }
    }

    if (rule.notOnConsecutiveDays) {
      // Gleicher Tag zählt ebenfalls: zwei Einheiten der Regel am selben Tag sind kein Abstand.
      const near = related
        .filter((s) => s.sessionTemplateId !== templateId && Math.abs(diffDays(today, s.date)) <= 1)
        .sort((a, b) => b.date.localeCompare(a.date))[0]
      if (near) out.push({ rule, kind: 'consecutive', otherId: near.sessionTemplateId, otherName: near.sessionName, otherDate: near.date })
    }
  }
  return out
}

/** J.A.R.V.I.S.-Anlass je Konfliktart. */
export function conflictLineKey(c: SpacingConflict): 'lowerTooSoon' | 'coreLowerAConsecutive' {
  return c.kind === 'minHours' ? 'lowerTooSoon' : 'coreLowerAConsecutive'
}
