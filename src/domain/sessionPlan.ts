import type { LogType, Plan, PlanExercise, PlanSession } from './plan'
import { plannedSets, type DayContext } from './schedule'
import type { KneeStatus, Side } from './types'

export type RemovedReason = 'yellow' | 'red' | 'taper'

export interface ResolvedItem {
  /** Index des Items in der Einheit (stabil, auch für chooseOne). */
  index: number
  exerciseId: string
  variantId: string | null
  variantLabel: string | null
  name: string
  logType: LogType
  category: string
  unilateral: boolean
  perSide: boolean
  /** Satzzahl je Seite; bei beidseitigen Übungen ein Eintrag mit side = null. */
  sides: { side: Side | null; sets: number }[]
  reps: [number, number] | null
  seconds: [number, number] | null
  minutes: [number, number] | null
  tempo: string | null
  restSec: [number, number] | null
  targetRIR: [number, number] | null
  incrementKg: number | null
  defaultWeightKg: number | null
  weightNote: string | null
  bodyweightAllowed: boolean
  lastSetToFailureAllowed: boolean
  progression: 'double' | 'technique' | 'manual' | null
  hint: string | null
  checklist: { id: string; text: string; dose?: string }[]
  supersetGroup: string | null
  /** Faktor auf die Lastempfehlung (Gelb + reduce20), sonst 1. */
  loadFactor: number
  /** Sätze dieser Übung zählen nicht für Progression, Symmetrie und Bestwerte. */
  schonmodus: boolean
  /** Offene Wahl bei chooseOne. */
  options: { exerciseId: string; name: string }[] | null
  units: number
}

export interface ResolvedSession {
  template: PlanSession
  /** Rot + Unterkörper: Einheit wird ausgesetzt. */
  suspended: boolean
  items: ResolvedItem[]
  removed: { exerciseId: string; name: string; reason: RemovedReason }[]
  plannedUnits: number
}

type Ctx = Pick<DayContext, 'weekType' | 'taper' | 'block'>

/** Übung ← Variante des Blocks ← Overrides des Items. */
export function effectiveExercise(
  plan: Plan,
  exerciseId: string,
  block: number,
  overrides?: Partial<PlanExercise>,
): { ex: PlanExercise; variantId: string | null; variantLabel: string | null } {
  const base = plan.exercises[exerciseId]!
  const variant = base.variantsByBlock?.[String(block)]
  const { variantId = null, label = null, ...variantFields } = variant ?? {}
  const defined = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
  return {
    ex: { ...base, ...defined(variantFields), ...defined(overrides ?? {}) } as PlanExercise,
    variantId,
    variantLabel: label,
  }
}

function removal(plan: Plan, ex: PlanExercise, ctx: Ctx, knee: KneeStatus): RemovedReason | null {
  if (knee === 'red' && (ex.red ?? 'keep') === 'skip') return 'red'
  if (knee !== 'green' && (ex.greenOnly || (ex.yellow ?? 'keep') === 'skip')) return 'yellow'
  if (ctx.taper && plan.schedule.taper.skipKneeLoad.includes(ex.kneeLoad)) return 'taper'
  return null
}

export function resolveSession(
  plan: Plan,
  sessionId: string,
  ctx: Ctx,
  knee: KneeStatus,
  choices: Record<string, string> = {},
): ResolvedSession {
  const template = plan.sessions.find((s) => s.id === sessionId)
  if (!template) throw new Error(`Unbekannte Einheit: ${sessionId}`)

  const result: ResolvedSession = {
    template,
    suspended: knee === 'red' && template.focus === 'lower',
    items: [],
    removed: [],
    plannedUnits: 0,
  }
  if (result.suspended) return result

  template.items.forEach((item, index) => {
    const open = item.chooseOne !== undefined && choices[String(index)] === undefined
    const exerciseId = item.exerciseId ?? choices[String(index)] ?? item.chooseOne![0]!
    const { ex, variantId, variantLabel } = effectiveExercise(plan, exerciseId, ctx.block, item.overrides)

    const reason = removal(plan, ex, ctx, knee)
    if (reason) {
      result.removed.push({ exerciseId, name: ex.name, reason })
      return
    }

    const counted = ex.logType !== 'checklist' && ex.logType !== 'duration'
    const unilateral = ex.unilateral === true
    let sides: ResolvedItem['sides'] = []
    if (counted) {
      const bySide = ex.setsBySide ?? { R: ex.sets ?? 0, L: ex.sets ?? 0 }
      sides = unilateral
        ? (['R', 'L'] as const).map((side) => ({ side, sets: plannedSets(plan, bySide[side], ctx) }))
        : [{ side: null, sets: plannedSets(plan, ex.sets ?? 0, ctx) }]
    }
    const reduce = knee === 'yellow' && ex.yellow === 'reduce20'

    result.items.push({
      index,
      exerciseId,
      variantId,
      variantLabel,
      name: ex.name,
      logType: ex.logType,
      category: ex.category,
      unilateral,
      perSide: ex.perSide === true,
      sides,
      reps: ex.reps ?? null,
      seconds: ex.seconds ?? null,
      minutes: ex.minutes ?? null,
      tempo: ex.tempo ?? null,
      restSec: ex.restSec ?? null,
      targetRIR:
        ctx.weekType === 'calibration' && ex.targetRIR
          ? [plan.schedule.calibration.targetRIR, plan.schedule.calibration.targetRIR]
          : (ex.targetRIR ?? null),
      incrementKg: ex.incrementKg ?? null,
      defaultWeightKg: ex.defaultWeightKg ?? null,
      weightNote: ex.weightNote ?? null,
      bodyweightAllowed: ex.bodyweightAllowed === true,
      lastSetToFailureAllowed: ex.lastSetToFailureAllowed === true,
      progression: ex.progression ?? null,
      hint: ex.hint ?? null,
      checklist: ex.checklist ?? [],
      supersetGroup: item.supersetGroup ?? null,
      loadFactor: reduce ? plan.kneeCheck.yellow.loadFactor : 1,
      schonmodus: reduce,
      options: open
        ? item.chooseOne!.map((id) => ({ exerciseId: id, name: plan.exercises[id]!.name }))
        : null,
      units: counted ? sides.reduce((n, s) => n + s.sets, 0) : 1,
    })
  })

  result.plannedUnits = result.items.reduce((n, i) => n + i.units, 0)
  return result
}

/** Schlüssel für Historie und Progression: Übung + Variante. */
export function historyKey(exerciseId: string, variantId: string | null): string {
  return variantId ? `${exerciseId}#${variantId}` : exerciseId
}
