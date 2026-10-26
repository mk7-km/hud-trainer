import { describe, expect, it } from 'vitest'
import type { Plan } from './plan'
import { conflictLineKey, spacingConflicts } from './spacing'
import { makeSession } from './testkit'
import { loadTestPlan } from './testplan.node'

const plan = loadTestPlan()
const H = 3_600_000
const T = Date.parse('2026-10-05T16:00:00Z') // Montag

const done = (templateId: string, date: string, endedAt: number) =>
  makeSession({ date, sessionTemplateId: templateId, startedAt: endedAt - H, endedAt, status: 'completed' })

describe('Abstandsregeln', () => {
  it('Mindestabstand zwischen den Unterkörper-Einheiten', () => {
    const sessions = [done('lower_a', '2026-10-05', T)]
    const c = spacingConflicts(plan, sessions, 'lower_b', T + 40 * H, '2026-10-07')
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ kind: 'minHours', otherId: 'lower_a', hours: 40, freeAt: T + 48 * H })
    expect(conflictLineKey(c[0]!)).toBe('lowerTooSoon')
    expect(spacingConflicts(plan, sessions, 'lower_b', T + 49 * H, '2026-10-07')).toEqual([])
    expect(spacingConflicts(plan, sessions, 'upper', T + 2 * H, '2026-10-05')).toEqual([])
    // dieselbe Einheit noch einmal: ebenfalls zu früh
    expect(spacingConflicts(plan, sessions, 'lower_a', T + 20 * H, '2026-10-06')).toHaveLength(1)
  })

  it('Rumpf und Unterkörper A nicht an aufeinanderfolgenden Tagen, in beliebiger Reihenfolge', () => {
    const core = [done('core', '2026-10-05', T)]
    const c = spacingConflicts(plan, core, 'lower_a', T + 26 * H, '2026-10-06')
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ kind: 'consecutive', otherId: 'core', otherDate: '2026-10-05' })
    expect(conflictLineKey(c[0]!)).toBe('coreLowerAConsecutive')
    expect(spacingConflicts(plan, core, 'lower_a', T + 50 * H, '2026-10-07')).toEqual([])
    // am selben Tag ebenfalls kein Abstand
    expect(spacingConflicts(plan, core, 'lower_a', T + 3 * H, '2026-10-05')).toHaveLength(1)
    const lowerA = [done('lower_a', '2026-10-05', T)]
    expect(spacingConflicts(plan, lowerA, 'core', T + 26 * H, '2026-10-06')).toHaveLength(1)
    expect(spacingConflicts(plan, lowerA, 'upper', T + 26 * H, '2026-10-06')).toEqual([])
  })

  it('abgebrochene oder ausgesetzte Einheiten zählen nicht', () => {
    const sessions = [
      makeSession({ date: '2026-10-05', sessionTemplateId: 'lower_a', endedAt: T, status: 'aborted' }),
      makeSession({ date: '2026-10-05', sessionTemplateId: 'core', endedAt: T, status: 'suspended_red' }),
    ]
    expect(spacingConflicts(plan, sessions, 'lower_b', T + 2 * H, '2026-10-05')).toEqual([])
    expect(spacingConflicts(plan, sessions, 'lower_a', T + 26 * H, '2026-10-06')).toEqual([])
  })

  it('Plan 1.0: feste 48-Stunden-Regel wirkt weiter', () => {
    const legacy: Plan = { ...plan, schedule: { ...plan.schedule, spacingRules: undefined, minHoursBetweenLowerSessions: 48 } }
    const sessions = [done('lower_a', '2026-10-05', T)]
    expect(spacingConflicts(legacy, sessions, 'lower_b', T + 30 * H, '2026-10-06')).toHaveLength(1)
    expect(spacingConflicts(legacy, sessions, 'core', T + 3 * H, '2026-10-05')).toEqual([])
  })
})
