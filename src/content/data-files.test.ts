import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import jarvis from './jarvis.de.json'

type RawItem = { exerciseId?: string; chooseOne?: string[] }
type RawPlan = {
  planVersion: string
  sessions: { id: string; items: RawItem[] }[]
  exercises: Record<string, { id: string }>
}

const plan = JSON.parse(
  readFileSync(new URL('../../public/plan.json', import.meta.url), 'utf8'),
) as RawPlan

describe('plan.json', () => {
  it('verweist nur auf vorhandene Übungen', () => {
    for (const session of plan.sessions) {
      for (const item of session.items) {
        const ids = item.chooseOne ?? [item.exerciseId]
        for (const id of ids) {
          expect(id && plan.exercises[id], `${session.id} → ${id}`).toBeTruthy()
        }
      }
    }
  })

  it('führt jede Übung unter ihrer eigenen ID', () => {
    for (const [key, ex] of Object.entries(plan.exercises)) expect(ex.id).toBe(key)
  })
})

describe('jarvis.de.json', () => {
  it('nutzt nur dokumentierte Platzhalter', () => {
    const known = new Set([...jarvis.meta.placeholders.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))
    for (const [key, lines] of Object.entries(jarvis)) {
      if (key === 'meta' || !Array.isArray(lines)) continue
      expect(lines.length, key).toBeGreaterThan(0)
      for (const line of lines) {
        for (const m of line.matchAll(/\{(\w+)\}/g)) expect(known.has(m[1]), `${key}: ${m[0]}`).toBe(true)
      }
    }
  })
})
