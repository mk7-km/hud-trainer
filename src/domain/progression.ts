import type { Plan } from './plan'
import type { DayContext } from './schedule'
import type { ResolvedItem } from './sessionPlan'
import type { SessionLog, SetLog, Side } from './types'

export interface Recommendation {
  /** find = Last finden (Kalibrierung, keine Vorgeschichte), load = konkrete Vorgabe,
   *  manual = nur letzte Werte vorbelegen, none = Übung ohne Last. */
  kind: 'find' | 'load' | 'manual' | 'none'
  weightKg: number | null
  /** Zielwert innerhalb des Bereichs (Wiederholungen oder Sekunden), „N+“. */
  target: number | null
  increased: boolean
  /** Vorbelegung der Eingabefelder. */
  prefill: { weightKg: number | null; reps: number | null; seconds: number | null }
}

const WEIGHT_STEP = 0.5

function roundDownToStep(kg: number): number {
  return Math.floor(kg / WEIGHT_STEP + 1e-9) * WEIGHT_STEP
}

function amount(set: SetLog): number {
  return set.reps ?? set.seconds ?? 0
}

/** Höchstsumme der Steigerungen pro Programmwoche bei technique, aus der Regel im Plan gelesen. */
function techniqueWeeklyCapKg(plan: Plan): number {
  const m = plan.progression?.technique?.match(/\+\s*(\d+(?:[.,]\d+)?)\s*kg/)
  return m ? Number(m[1]!.replace(',', '.')) : Infinity
}

export interface HistoryInput {
  /** Alle Sätze dieser Übung + Variante (beliebige Seiten, beliebige Reihenfolge). */
  sets: SetLog[]
  sessionsById: Map<string, SessionLog>
}

/** Sätze der letzten regulären Einheit für diese Seite: abgeschlossen oder laufend egal,
 *  aber kein Schonmodus, kein Deload, kein Taper. */
function lastRegular(history: HistoryInput, side: Side | null, beforeSessionId?: string) {
  const bySession = new Map<string, SetLog[]>()
  for (const s of history.sets) {
    if (s.side !== side || s.schonmodus || s.sessionId === beforeSessionId) continue
    const session = history.sessionsById.get(s.sessionId)
    if (!session || session.weekType === 'deload' || session.taper) continue
    const list = bySession.get(s.sessionId) ?? []
    list.push(s)
    bySession.set(s.sessionId, list)
  }
  const ordered = [...bySession.entries()]
    .map(([id, sets]) => ({ session: history.sessionsById.get(id)!, sets }))
    .sort((a, b) => a.session.startedAt - b.session.startedAt)
  return ordered
}

export function recommend(
  plan: Plan,
  item: ResolvedItem,
  side: Side | null,
  history: HistoryInput,
  ctx: Pick<DayContext, 'weekType' | 'taper' | 'programWeek'>,
  opts: { incrementOverride?: number; currentSessionId?: string } = {},
): Recommendation {
  const weighted = item.logType === 'weight_reps' || item.logType === 'weight_time'
  const timed = item.logType === 'weight_time'
  const range = timed ? item.seconds : item.reps
  const regular = lastRegular(history, side, opts.currentSessionId)
  const last = regular[regular.length - 1]

  const lastSet = last?.sets.reduce((a, b) => (b.setIndex > a.setIndex ? b : a))
  const prefill = {
    weightKg: weighted ? (lastSet?.weightKg ?? item.defaultWeightKg) : null,
    reps: timed ? null : (lastSet?.reps ?? range?.[0] ?? null),
    seconds: timed ? (lastSet?.seconds ?? range?.[0] ?? null) : null,
  }
  const none = (kind: Recommendation['kind']): Recommendation => ({
    kind,
    weightKg: null,
    target: null,
    increased: false,
    prefill,
  })

  if (!weighted) return none('none')
  if (item.progression === 'manual' || item.progression === null) return none('manual')
  if (ctx.weekType === 'calibration' || !last || !range) return none('find')

  const [lo, hi] = range
  const weight = Math.max(...last.sets.map((s) => s.weightKg ?? 0))
  const rirLow = item.targetRIR?.[0] ?? 0
  const lastIndex = Math.max(...last.sets.map((s) => s.setIndex))
  const allTop = last.sets.every((s) => {
    const rirExempt = item.lastSetToFailureAllowed && s.setIndex === lastIndex
    const rirOk = rirExempt || s.rir === null || s.rir >= rirLow
    return amount(s) >= hi && rirOk
  })

  const frozen = ctx.weekType === 'deload' || ctx.taper
  let next = weight
  let target = Math.min(hi, Math.max(lo, Math.min(...last.sets.map(amount)) + 1))
  let increased = false

  if (!frozen && allTop) {
    const increment = opts.incrementOverride ?? item.incrementKg ?? 0
    let allowed = increment > 0
    if (item.progression === 'technique') {
      if (last.session.kneeStatus !== 'green') allowed = false
      // Wochenlimit: Ausgangslast ist die letzte reguläre Einheit vor dieser Programmwoche.
      const before = regular.filter((r) => r.session.programWeek < ctx.programWeek).pop()
      if (before) {
        const weekBase = Math.max(...before.sets.map((s) => s.weightKg ?? 0))
        const room = weekBase + techniqueWeeklyCapKg(plan) - weight
        if (room < increment) allowed = false
      }
    }
    if (allowed) {
      next = weight + increment
      target = lo
      increased = true
    } else {
      target = hi
    }
  } else if (frozen) {
    target = lo
  }

  const factored = item.loadFactor < 1 ? roundDownToStep(next * item.loadFactor) : next
  return {
    kind: 'load',
    weightKg: factored,
    target,
    increased,
    prefill: { ...prefill, weightKg: factored, [timed ? 'seconds' : 'reps']: target },
  }
}
