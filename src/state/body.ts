import { db, newId } from '../db/db'
import { localDate } from '../domain/dates'
import type { Plan } from '../domain/plan'
import type { BodyweightLog } from '../domain/types'
import { useApp } from './store'

export async function addWeighIn(plan: Plan, weightKg: number, fatPct: number | null) {
  const now = Date.now()
  const entry: BodyweightLog = { id: newId(), date: localDate(now, plan.schedule.timezone), at: now, weightKg, fatPct }
  await db.bodyweight.add(entry)
  useApp.setState((s) => ({ bodyweight: [...s.bodyweight, entry] }))
}

export async function deleteWeighIn(id: string) {
  await db.bodyweight.delete(id)
  useApp.setState((s) => ({ bodyweight: s.bodyweight.filter((b) => b.id !== id) }))
}
