import { useEffect } from 'react'
import { db } from '../db/db'
import type { Plan } from '../domain/plan'
import type { MarkReached } from '../domain/types'
import type { Derived } from './derived'
import { useApp } from './store'
import { useUi } from './ui'

/** Einzige gespeicherte Ableitung: neu erreichte Mark-Stufen mit Datum (Marks fallen nie zurück). */
export function useMarkSync(plan: Plan | null, derived: Derived | null) {
  const earned = derived?.earnedLevel ?? 0
  const reached = derived?.reachedLevel ?? 0

  useEffect(() => {
    if (!plan || earned <= reached) return
    const today = useApp.getState().today
    const rows: MarkReached[] = plan.marks
      .filter((m) => m.level > reached && m.level <= earned)
      .map((m) => ({ level: m.level, name: m.name, date: today }))
    if (!rows.length) return
    void db.marksReached.bulkPut(rows).then(() => {
      useApp.setState((s) => ({ marksReached: [...s.marksReached.filter((m) => m.level > earned || m.level <= reached), ...rows] }))
      const top = plan.marks.find((m) => m.level === earned)
      if (top) useUi.getState().setMarkUp({ level: top.level, name: top.name, title: top.title })
    })
  }, [plan, earned, reached])
}
