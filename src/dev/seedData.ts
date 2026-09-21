// Entwickler-Seed: erzeugt mehrere Wochen plausibler Beispieldaten als Backup-Objekt.
// Wird nur im Dev-Modus (SYSTEM) und in den Playwright-Tests verwendet, nie im Produktivablauf.
import type { Backup } from '../db/backup'
import { addDays, diffDays, mondayOf } from '../domain/dates'
import type { Plan } from '../domain/plan'
import { dayContext } from '../domain/schedule'
import { resolveSession } from '../domain/sessionPlan'
import {
  DEFAULT_SETTINGS,
  type BodyweightLog,
  type CheckLog,
  type KneeCheckLog,
  type KneeEvent,
  type KneeStatus,
  type SessionLog,
  type SetLog,
  type Settings,
} from '../domain/types'

export interface SeedOptions {
  today: string
  /** Volle Wochen vor der laufenden Woche. */
  weeksBack: number
  opDate?: string | null
}

const WEEKDAY_OFFSET: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 }
const ANSWERS: Record<KneeStatus, Record<string, string | number>> = {
  green: { swelling: 'keine', pain: 1, stiffness: 'nein', givingWay48h: 'nein', locking: 'nein' },
  yellow: { swelling: 'leicht', pain: 3, stiffness: 'nein', givingWay48h: 'nein', locking: 'nein' },
  red: { swelling: 'deutlich', pain: 5, stiffness: 'ja', givingWay48h: 'nein', locking: 'nein' },
}

export function buildSeed(plan: Plan, opts: SeedOptions): Backup {
  const programStart = addDays(mondayOf(opts.today), -7 * opts.weeksBack)
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    onboardingDone: true,
    programStart,
    opDate: opts.opDate ?? null,
    lastSeenPlanVersion: plan.planVersion,
    symmetryCaveatSeen: false,
    bootSequence: false,
  }

  const sessions: SessionLog[] = []
  const sets: SetLog[] = []
  const checks: CheckLog[] = []
  const kneeChecks: KneeCheckLog[] = []
  const kneeEvents: KneeEvent[] = []
  const bodyweight: BodyweightLog[] = []
  let n = 0
  const id = (p: string) => `seed-${p}-${++n}`
  const at = (date: string, hour: number) => Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`)

  // Startlasten je Übung (kg); rechts deutlich schwächer, holt über die Wochen auf.
  const baseLoad = (exerciseId: string) => 20 + (exerciseId.length % 7) * 10
  const rightFactor = (week: number) => Math.min(0.93, 0.68 + week * 0.035)

  const ordered = [...plan.sessions].sort((a, b) => a.order - b.order)
  for (let day = programStart; day < opts.today; day = addDays(day, 1)) {
    const weekIndex = Math.floor(diffDays(day, programStart) / 7) // 0-basiert
    const offset = diffDays(day, mondayOf(day))
    const ctx = dayContext(plan, settings, day)
    if (ctx.locked) continue

    for (const template of ordered) {
      if (WEEKDAY_OFFSET[template.suggestedWeekday ?? ''] !== offset) continue
      // Woche 4 (Index 3) verfehlt: Freitagseinheit fällt aus. Bonus nur in geraden Wochen komplett.
      if (weekIndex === 3 && template.order === 5) continue
      if (template.type === 'bonus' && weekIndex % 2 === 1 && template.order === 6) continue

      // Ein Gelb-Tag (Woche 3, Donnerstag) und ein Rot-Tag (Woche 6, Montag)
      const knee: KneeStatus = weekIndex === 2 && offset === 3 ? 'yellow' : weekIndex === 5 && offset === 0 ? 'red' : 'green'
      const choices: Record<string, string> = {}
      template.items.forEach((item, i) => {
        if (item.chooseOne) choices[String(i)] = item.chooseOne[weekIndex % item.chooseOne.length]!
      })
      const resolved = resolveSession(plan, template.id, ctx, knee, choices)
      const startedAt = at(day, 16)
      const session: SessionLog = {
        id: id('s'),
        sessionTemplateId: template.id,
        sessionName: template.name,
        sessionType: template.type,
        focus: template.focus,
        planVersion: plan.planVersion,
        programWeek: ctx.programWeek,
        weekType: ctx.weekType,
        block: ctx.block,
        taper: ctx.taper,
        date: day,
        startedAt,
        endedAt: startedAt + (resolved.suspended ? 0 : 65 * 60_000),
        status: resolved.suspended ? 'suspended_red' : 'completed',
        kneeStatus: knee,
        plannedUnits: resolved.plannedUnits,
        choices,
        skipped: [],
      }
      sessions.push(session)
      kneeChecks.push({ id: id('k'), sessionId: session.id, date: day, at: startedAt, answers: ANSWERS[knee], status: knee })

      let clock = startedAt
      for (const item of resolved.items) {
        if (item.logType === 'checklist') {
          for (const c of item.checklist) {
            checks.push({ id: id('c'), sessionId: session.id, kind: 'checklist', exerciseId: item.exerciseId, itemId: c.id, text: c.text, done: true, at: clock })
          }
          continue
        }
        const name = item.variantLabel ? `${item.name} (${item.variantLabel})` : item.name
        const push = (side: SetLog['side'], setIndex: number, v: Partial<SetLog>) =>
          sets.push({
            id: id('set'),
            sessionId: session.id,
            date: day,
            exerciseId: item.exerciseId,
            variantId: item.variantId,
            exerciseName: name,
            side,
            setIndex,
            weightKg: null,
            reps: null,
            seconds: null,
            rir: null,
            targetRirLow: item.targetRIR?.[0] ?? null,
            schonmodus: item.schonmodus,
            loggedAt: (clock += 150_000),
            ...v,
          })
        if (item.logType === 'duration') {
          push(null, 0, { seconds: (item.minutes?.[0] ?? 30) * 60 })
          continue
        }
        const inc = item.incrementKg ?? 2.5
        for (const side of item.sides) {
          const sideFactor = side.side === 'R' ? rightFactor(weekIndex) : 1
          const grown = baseLoad(item.exerciseId) * (1 + weekIndex * 0.03) * sideFactor * item.loadFactor
          const weight = Math.max(item.bodyweightAllowed ? 0 : inc, Math.round(grown / inc) * inc)
          for (let i = 0; i < side.sets; i++) {
            const hi = item.reps?.[1] ?? 10
            const lo = item.reps?.[0] ?? hi
            const reps = Math.max(lo, hi - i - (weekIndex % 2))
            const weighted = item.logType === 'weight_reps' || item.logType === 'weight_time'
            push(side.side, i, {
              weightKg: weighted ? weight : null,
              reps: item.logType === 'weight_time' ? null : reps,
              seconds: item.logType === 'weight_time' ? (item.seconds?.[1] ?? 30) : null,
              rir: item.targetRIR ? item.targetRIR[0] : null,
            })
          }
        }
      }
    }

    // Wägungen: Montag, Mittwoch, Samstag; langsamer Trend nach unten
    if (offset === 0 || offset === 2 || offset === 5) {
      const total = diffDays(day, programStart)
      bodyweight.push({ id: id('bw'), date: day, at: at(day, 6), weightKg: Math.round((92.4 - total * 0.045 + ((total * 7) % 5) * 0.1) * 10) / 10, fatPct: null })
    }
  }

  // Ein gemeldetes Wegknicken in Woche 2
  const eventDay = addDays(programStart, 9)
  if (eventDay < opts.today) kneeEvents.push({ id: id('ev'), date: eventDay, at: at(eventDay, 12), type: 'givingWay', source: 'manual' })

  return {
    app: 'hud-trainer',
    schemaVersion: 1,
    exportedAt: new Date(at(opts.today, 8)).toISOString(),
    planVersion: plan.planVersion,
    tables: {
      settings: [settings as unknown as Record<string, unknown>],
      sessions: sessions as unknown as Record<string, unknown>[],
      sets: sets as unknown as Record<string, unknown>[],
      checks: checks as unknown as Record<string, unknown>[],
      kneeChecks: kneeChecks as unknown as Record<string, unknown>[],
      kneeEvents: kneeEvents as unknown as Record<string, unknown>[],
      bodyweight: bodyweight as unknown as Record<string, unknown>[],
      marksReached: [],
    },
  }
}
