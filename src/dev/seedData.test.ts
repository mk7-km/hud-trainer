import { describe, expect, it } from 'vitest'
import { parseBackup } from '../db/backup'
import { advanceMarks, calmDays } from '../domain/marks'
import { rulesOf } from '../domain/plan'
import { points, streaks } from '../domain/scoring'
import { baseline, baselineCaptured, rightGain, symmetry } from '../domain/strength'
import { loadTestPlan } from '../domain/testplan.node'
import type { KneeCheckLog, KneeEvent, SessionLog, SetLog, Settings } from '../domain/types'
import { buildSeed } from './seedData'

const plan = loadTestPlan()

// Abnahme: eine komplette Laufzeit nach plan.json ist durchspielbar – Kalibrierung, Gelb, Rot, Deload, Taper.
describe('Seed über elf Wochen mit OP-Termin', () => {
  const today = '2026-12-09' // Mittwoch; OP am 12.12. → Taper seit 05.12., Ruhetage 10./11.12.
  const seed = buildSeed(plan, { today, weeksBack: 11, opDate: '2026-12-12' })
  const sessions = seed.tables.sessions as unknown as SessionLog[]
  const sets = seed.tables.sets as unknown as SetLog[]
  const settings = seed.tables.settings[0] as unknown as Settings

  it('ist ein gültiges Backup mit Regel-Archiv', () => {
    const parsed = parseBackup(JSON.stringify(seed))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.backup.planRules).toEqual([rulesOf(plan)])
  })

  it('enthält alle Wochentypen und Ampelfarben, nur Pflichteinheiten', () => {
    expect(new Set(sessions.map((s) => s.weekType))).toEqual(new Set(['calibration', 'normal', 'deload']))
    expect(sessions.some((s) => s.taper)).toBe(true)
    expect(sessions.some((s) => s.kneeStatus === 'yellow')).toBe(true)
    expect(sessions.some((s) => s.status === 'suspended_red')).toBe(true)
    expect(sets.some((s) => s.schonmodus)).toBe(true)
    expect(new Set(sessions.map((s) => s.block))).toEqual(new Set([1, 2, 3]))
    expect(sessions.every((s) => s.sessionType === 'pflicht')).toBe(true)
  })

  it('vergibt Namen für die freie Bauchübung', () => {
    const free = sets.filter((s) => s.exerciseId === 'abs_free')
    expect(free.length).toBeGreaterThan(0)
    expect(new Set(free.map((s) => s.variantId))).toEqual(new Set(['Crunch am Kabel', 'Beinheben hängend']))
    expect(free.every((s) => s.exerciseName === s.variantId)).toBe(true)
  })

  it('hält die Satzregeln ein', () => {
    const count = (sessionId: string, exerciseId: string) => sets.filter((s) => s.sessionId === sessionId && s.exerciseId === exerciseId).length
    const of = (pred: (s: SessionLog) => boolean) => sessions.find((s) => s.sessionTemplateId === 'upper' && pred(s))!
    expect(count(of((s) => s.weekType === 'calibration').id, 'bench_press')).toBe(2)
    expect(count(of((s) => s.weekType === 'normal' && !s.taper).id, 'bench_press')).toBe(4)
    expect(count(of((s) => s.weekType === 'deload').id, 'bench_press')).toBe(2)
    expect(count(of((s) => s.taper).id, 'bench_press')).toBe(2)
  })

  it('liefert konsistente abgeleitete Werte', () => {
    const streak = streaks(plan, sessions, settings, today)
    expect(streak.fullWeeksTotal).toBeGreaterThanOrEqual(8)
    expect(streak.weeks.some((w) => !w.full)).toBe(true) // Woche 4 verfehlt
    expect(points(plan, sessions, sets).total).toBeGreaterThan(3500)

    const base = baseline(plan, sets, sessions)
    expect(baselineCaptured(base)).toBe(true)
    const sym = symmetry(plan, sets, today).index!
    expect(sym).toBeGreaterThan(0.7)
    expect(sym).toBeLessThanOrEqual(1)
    const gain = rightGain(plan, sets, base, today).gain!
    expect(gain).toBeGreaterThan(0.1)

    const level = advanceMarks(plan, 0, {
      fullWeeksTotal: streak.fullWeeksTotal,
      bestStreak: streak.best,
      baselineCaptured: true,
      rightGain: gain,
      symmetryIndex: sym,
      calmDays: calmDays(seed.tables.kneeChecks as unknown as KneeCheckLog[], seed.tables.kneeEvents as unknown as KneeEvent[], settings.programStart, today),
      selfChecks: {},
    })
    expect(level).toBeGreaterThanOrEqual(2)
  })
})
