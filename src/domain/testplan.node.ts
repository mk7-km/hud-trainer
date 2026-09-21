import { readFileSync } from 'node:fs'
import { parsePlan, type Plan } from './plan'

export const rawPlan = (): unknown =>
  JSON.parse(readFileSync(new URL('../../public/plan.json', import.meta.url), 'utf8'))

export function loadTestPlan(): Plan {
  const res = parsePlan(rawPlan())
  if (!res.ok) throw new Error(res.errors.join('\n'))
  return res.plan
}
