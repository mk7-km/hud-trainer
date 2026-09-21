import { z } from 'zod'

const range = z.tuple([z.number(), z.number()])

const checklistItem = z.object({ id: z.string(), text: z.string(), dose: z.string().optional() })

/** Felder, die eine Variante oder ein Item-Override überschreiben darf. */
const exerciseFields = {
  name: z.string(),
  logType: z.enum(['weight_reps', 'reps', 'weight_time', 'duration', 'checklist']),
  category: z.string(),
  source: z.string().optional(),
  unilateral: z.boolean().optional(),
  perSide: z.boolean().optional(),
  symmetry: z.boolean().optional(),
  symmetryGroup: z.string().optional(),
  sets: z.number().int().positive().optional(),
  setsBySide: z.object({ R: z.number().int().min(0), L: z.number().int().min(0) }).optional(),
  reps: range.optional(),
  seconds: range.optional(),
  minutes: range.optional(),
  tempo: z.string().optional(),
  restSec: range.optional(),
  targetRIR: range.optional(),
  incrementKg: z.number().positive().optional(),
  defaultWeightKg: z.number().min(0).optional(),
  weightNote: z.string().optional(),
  bodyweightAllowed: z.boolean().optional(),
  lastSetToFailureAllowed: z.boolean().optional(),
  progression: z.enum(['double', 'technique', 'manual']).optional(),
  kneeLoad: z.string(),
  greenOnly: z.boolean().optional(),
  yellow: z.enum(['keep', 'skip', 'reduce20']).optional(),
  red: z.enum(['keep', 'skip']).optional(),
  maxKneeFlexionDeg: z.number().optional(),
  hint: z.string().optional(),
  checklist: z.array(checklistItem).optional(),
}

const overrideSchema = z.object(exerciseFields).partial()
const variantSchema = overrideSchema.extend({ variantId: z.string(), label: z.string() })

const exerciseSchema = z.object({
  id: z.string(),
  ...exerciseFields,
  variantsByBlock: z.record(z.string(), variantSchema).optional(),
})

const itemSchema = z
  .object({
    exerciseId: z.string().optional(),
    chooseOne: z.array(z.string()).min(2).optional(),
    supersetGroup: z.string().optional(),
    overrides: overrideSchema.optional(),
  })
  .refine((i) => (i.exerciseId === undefined) !== (i.chooseOne === undefined), {
    message: 'Item braucht genau eines von exerciseId oder chooseOne',
  })

const sessionSchema = z.object({
  id: z.string(),
  order: z.number(),
  name: z.string(),
  type: z.enum(['pflicht', 'bonus']),
  focus: z.enum(['lower', 'upper', 'cardio']),
  suggestedWeekday: z.string().optional(),
  durationMin: z.number().optional(),
  warmup: z.array(z.string()),
  items: z.array(itemSchema).min(1),
})

const factorRule = z.object({
  setFactor: z.number().positive().max(1),
  rounding: z.literal('ceil'),
})

const questionSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.literal('scale').optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(z.string()).optional(),
})

const criterionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fullWeeksTotalMin'), value: z.number() }),
  z.object({ type: z.literal('fullWeeksInRowMin'), value: z.number() }),
  z.object({ type: z.literal('baselineCaptured') }),
  z.object({ type: z.literal('rightGainMin'), value: z.number() }),
  z.object({ type: z.literal('symmetryMin'), value: z.number() }),
  z.object({ type: z.literal('calmDaysMin'), value: z.number() }),
  z.object({ type: z.literal('selfCheck'), id: z.string(), text: z.string() }),
])

/** Fragen-IDs, auf die sich die Ampel-Ableitung stützt (siehe DECISIONS.md). */
export const KNEE_QUESTION_IDS = ['swelling', 'pain', 'stiffness', 'givingWay48h', 'locking'] as const

export const planSchema = z
  .object({
    schemaVersion: z.literal(1),
    planVersion: z.string(),
    planId: z.string(),
    phase: z.object({ id: z.string(), name: z.string(), type: z.string() }),
    legend: z.record(z.string(), z.string()).optional(),
    globalRules: z
      .object({
        forbiddenUntilSurgery: z.array(z.string()).optional(),
        painRule: z.string().optional(),
        jointRule: z.string().optional(),
      })
      .optional(),
    schedule: z.object({
      weekStartsOn: z.literal('monday'),
      timezone: z.string(),
      pflichtPerWeek: z.number().int().positive(),
      bonusPerWeek: z.number().int().min(0),
      minHoursBetweenLowerSessions: z.number().min(0),
      weeks: z
        .array(
          z.object({
            from: z.number().int().positive(),
            to: z.number().int().positive().nullable(),
            type: z.enum(['calibration', 'normal', 'deload']),
            block: z.number().int().positive(),
          }),
        )
        .min(1),
      calibration: z.object({
        maxSets: z.number().int().positive(),
        targetRIR: z.number(),
        note: z.string().optional(),
      }),
      deload: factorRule,
      taper: factorRule.extend({
        daysBeforeOp: z.number().int().positive(),
        skipKneeLoad: z.array(z.string()),
        restDaysBeforeOp: z.number().int().min(0),
        opWeekCountsForStreak: z.boolean(),
        note: z.string().optional(),
      }),
    }),
    kneeCheck: z.object({
      questions: z.array(questionSchema),
      green: z.object({ action: z.string() }),
      yellow: z.object({ action: z.string(), loadFactor: z.number().positive().max(1) }),
      red: z.object({ action: z.string() }),
      events: z.object({ givingWay: z.string(), locking: z.string() }),
    }),
    progression: z.object({ technique: z.string().optional() }).optional(),
    symmetry: z.object({
      exercises: z.array(z.string()).min(1),
      groups: z.record(z.string(), z.array(z.string())),
      windowDays: z.number().int().positive(),
      rightGain: z.string(),
      caveat: z.string(),
    }),
    points: z.object({
      pflichtSession: z.number(),
      bonusSession: z.number(),
      weekAllPflicht: z.number(),
      perfectWeekExtra: z.number(),
      newRightLegRecord: z.number(),
      redReplacementMobility: z.number(),
      sessionCompleteThreshold: z.number().min(0).max(1),
    }),
    marks: z.array(
      z.object({
        level: z.number().int().positive(),
        name: z.string(),
        title: z.string(),
        criteria: z.array(criterionSchema),
      }),
    ),
    bodyweight: z.object({
      weighInsPerWeekMin: z.number().int().min(0),
      targetLossPerWeekKg: range,
      proteinHint: z.string().optional(),
    }),
    sessions: z.array(sessionSchema).min(1),
    exercises: z.record(z.string(), exerciseSchema),
  })
  .superRefine((plan, ctx) => {
    const has = (id: string) => Object.hasOwn(plan.exercises, id)
    for (const s of plan.sessions) {
      for (const item of s.items) {
        for (const id of item.chooseOne ?? [item.exerciseId!]) {
          if (!has(id)) ctx.addIssue({ code: 'custom', message: `${s.id}: unbekannte Übung ${id}` })
        }
      }
    }
    for (const [key, ex] of Object.entries(plan.exercises)) {
      if (ex.id !== key) ctx.addIssue({ code: 'custom', message: `Übung ${key}: id weicht ab` })
    }
    for (const id of [...plan.symmetry.exercises, ...Object.values(plan.symmetry.groups).flat()]) {
      if (!has(id)) ctx.addIssue({ code: 'custom', message: `symmetry: unbekannte Übung ${id}` })
    }
    const qids = new Set(plan.kneeCheck.questions.map((q) => q.id))
    for (const id of KNEE_QUESTION_IDS) {
      if (!qids.has(id)) ctx.addIssue({ code: 'custom', message: `kneeCheck: Frage ${id} fehlt` })
    }
    const levels = plan.marks.map((m) => m.level)
    if (levels.some((l, i) => l !== i + 1)) {
      ctx.addIssue({ code: 'custom', message: 'marks: Stufen müssen lückenlos ab 1 aufsteigen' })
    }
  })

export type Plan = z.infer<typeof planSchema>
export type PlanExercise = z.infer<typeof exerciseSchema>
export type PlanSession = z.infer<typeof sessionSchema>
export type PlanItem = z.infer<typeof itemSchema>
export type MarkCriterion = z.infer<typeof criterionSchema>
export type LogType = PlanExercise['logType']

export type ParsePlanResult = { ok: true; plan: Plan } | { ok: false; errors: string[] }

export function parsePlan(raw: unknown): ParsePlanResult {
  const res = planSchema.safeParse(raw)
  if (res.success) return { ok: true, plan: res.data }
  return {
    ok: false,
    errors: res.error.issues.map((i) => `${i.path.join('.') || 'plan'}: ${i.message}`),
  }
}
