import type { Plan } from './plan'
import type { KneeStatus } from './types'

export type KneeAnswers = Record<string, string | number>

export interface KneeResult {
  status: KneeStatus
  givingWay: boolean
  locking: boolean
}

// Umsetzung von kneeCheck.derive (dort als Prosa formuliert, siehe DECISIONS.md):
//   rot:  Schwellung deutlich ODER Schmerz >= 5 ODER Wegknicken ODER Blockade
//   gelb: sonst, wenn Schwellung leicht ODER Schmerz 3..4 ODER Morgensteifigkeit
//   grün: sonst
const PAIN_RED = 5
const PAIN_YELLOW = 3

/** Position der gewählten Option: 0 = unauffällig, letzte = stärkste Ausprägung. */
function optionLevel(plan: Plan, questionId: string, answers: KneeAnswers): number {
  const q = plan.kneeCheck.questions.find((x) => x.id === questionId)
  const idx = q?.options?.indexOf(String(answers[questionId])) ?? -1
  return Math.max(0, idx)
}

function isMax(plan: Plan, questionId: string, answers: KneeAnswers): boolean {
  const q = plan.kneeCheck.questions.find((x) => x.id === questionId)
  const last = (q?.options?.length ?? 1) - 1
  return last > 0 && optionLevel(plan, questionId, answers) === last
}

export function isKneeCheckComplete(plan: Plan, answers: KneeAnswers): boolean {
  return plan.kneeCheck.questions.every((q) =>
    q.type === 'scale' ? typeof answers[q.id] === 'number' : q.options?.includes(String(answers[q.id])),
  )
}

export function deriveKnee(plan: Plan, answers: KneeAnswers): KneeResult {
  const pain = Number(answers.pain ?? 0)
  const givingWay = isMax(plan, 'givingWay48h', answers)
  const locking = isMax(plan, 'locking', answers)
  const swelling = optionLevel(plan, 'swelling', answers)

  let status: KneeStatus = 'green'
  if (isMax(plan, 'swelling', answers) || pain >= PAIN_RED || givingWay || locking) status = 'red'
  else if (swelling > 0 || pain >= PAIN_YELLOW || isMax(plan, 'stiffness', answers)) status = 'yellow'

  return { status, givingWay, locking }
}
