import { describe, expect, it } from 'vitest'
import { addDays, diffDays, localDate, mondayOf, sundayOf, suggestProgramStart, weekdayIndex, isDateStr } from './dates'
import { dayContext, isNeutralWeek, plannedSets, programStartForWeek, programWeekOf, weekEntry } from './schedule'
import { loadTestPlan } from './testplan.node'

const plan = loadTestPlan()
const TZ = plan.schedule.timezone
const START = '2026-09-21' // Montag
const base = { programStart: START, opDate: null, repairMode: false, opAskedFor: null }

describe('Datumslogik', () => {
  it('nutzt lokale Tagesgrenzen statt UTC', () => {
    expect(localDate(Date.parse('2026-09-21T21:59:00Z'), TZ)).toBe('2026-09-21') // 23:59 MESZ
    expect(localDate(Date.parse('2026-09-21T22:00:00Z'), TZ)).toBe('2026-09-22') // 00:00 MESZ
  })

  it('übersteht das Sommerzeitende am 25.10.2026', () => {
    expect(localDate(Date.parse('2026-10-24T22:30:00Z'), TZ)).toBe('2026-10-25') // 00:30 MESZ
    expect(localDate(Date.parse('2026-10-25T22:30:00Z'), TZ)).toBe('2026-10-25') // 23:30 MEZ (25-h-Tag)
    expect(localDate(Date.parse('2026-10-25T23:00:00Z'), TZ)).toBe('2026-10-26')
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(diffDays('2026-10-26', '2026-10-19')).toBe(7)
    expect(weekdayIndex('2026-10-25')).toBe(6)
    expect(mondayOf('2026-10-25')).toBe('2026-10-19')
    expect(sundayOf('2026-10-19')).toBe('2026-10-25')
    expect(programWeekOf(START, '2026-10-25')).toBe(5)
    expect(programWeekOf(START, '2026-10-26')).toBe(6)
  })

  it('übersteht den Jahreswechsel', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(mondayOf('2027-01-01')).toBe('2026-12-28')
    expect(sundayOf('2026-12-31')).toBe('2027-01-03')
    expect(programWeekOf(START, '2026-12-31')).toBe(15)
    expect(programWeekOf(START, '2027-01-03')).toBe(15)
    expect(programWeekOf(START, '2027-01-04')).toBe(16)
  })

  it('schlägt den Programmstart vor: Mo–Mi aktueller Montag, sonst nächster', () => {
    expect(suggestProgramStart('2026-09-21')).toBe('2026-09-21')
    expect(suggestProgramStart('2026-09-23')).toBe('2026-09-21')
    expect(suggestProgramStart('2026-09-24')).toBe('2026-09-28')
    expect(suggestProgramStart('2026-09-27')).toBe('2026-09-28')
  })

  it('prüft Datumsstrings', () => {
    expect(isDateStr('2026-02-28')).toBe(true)
    expect(isDateStr('2026-02-30')).toBe(false)
    expect(isDateStr('28.02.2026')).toBe(false)
  })
})

describe('Programmwoche, Wochentyp, Block', () => {
  it('ordnet Wochen nach schedule.weeks zu', () => {
    expect(weekEntry(plan, 1)).toEqual({ type: 'calibration', block: 1 })
    expect(weekEntry(plan, 4)).toEqual({ type: 'normal', block: 1 })
    expect(weekEntry(plan, 5)).toEqual({ type: 'deload', block: 1 })
    expect(weekEntry(plan, 6)).toEqual({ type: 'normal', block: 2 })
    expect(weekEntry(plan, 10)).toEqual({ type: 'deload', block: 2 })
    expect(weekEntry(plan, 40)).toEqual({ type: 'normal', block: 3 })
  })

  it('sperrt vor dem Programmstart', () => {
    const ctx = dayContext(plan, base, '2026-09-20')
    expect(ctx.programWeek).toBe(0)
    expect(ctx.locked).toBe('notStarted')
  })

  it('korrigiert die Programmwoche über den Programmstart', () => {
    const start = programStartForWeek('2026-10-08', 5)
    expect(programWeekOf(start, '2026-10-08')).toBe(5)
    expect(weekdayIndex(start)).toBe(0)
  })
})

describe('Taper, Ruhetage, Reparaturmodus', () => {
  const op = { ...base, opDate: '2026-12-10' }

  it('beginnt daysBeforeOp Tage vor der OP', () => {
    expect(dayContext(plan, op, '2026-12-02').taper).toBe(false)
    const first = dayContext(plan, op, '2026-12-03')
    expect(first.taper).toBe(true)
    expect(first.daysToOp).toBe(7)
    expect(first.locked).toBeNull()
  })

  it('sperrt die letzten restDaysBeforeOp Tage', () => {
    expect(dayContext(plan, op, '2026-12-07').locked).toBeNull()
    expect(dayContext(plan, op, '2026-12-08').locked).toBe('restBeforeOp')
    expect(dayContext(plan, op, '2026-12-09').locked).toBe('restBeforeOp')
  })

  it('fragt am OP-Tag einmal nach und sperrt', () => {
    const day = dayContext(plan, op, '2026-12-10')
    expect(day.locked).toBe('opReached')
    expect(day.askOpDone).toBe(true)
    expect(dayContext(plan, { ...op, opAskedFor: '2026-12-10' }, '2026-12-11').askOpDone).toBe(false)
    // verschobener Termin: Frage wird für das neue Datum erneut gestellt
    expect(dayContext(plan, { ...op, opDate: '2026-12-17', opAskedFor: '2026-12-10' }, '2026-12-17').askOpDone).toBe(true)
  })

  it('friert den Block ein und ersetzt den Deload', () => {
    const s = { ...base, opDate: '2026-10-29' } // Taper 22.–28.10., Woche 5 (Deload, Block 1) → Woche 6 (Block 2)
    const inDeload = dayContext(plan, s, '2026-10-22')
    expect(inDeload).toMatchObject({ taper: true, weekType: 'normal', block: 1 })
    expect(plannedSets(plan, 3, inDeload)).toBe(2) // einmal halbiert, nicht doppelt
    expect(dayContext(plan, s, '2026-10-26')).toMatchObject({ programWeek: 6, block: 1, taper: true })
    expect(dayContext(plan, base, '2026-10-26').block).toBe(2)
  })

  it('sperrt im Reparaturmodus alles', () => {
    const ctx = dayContext(plan, { ...op, repairMode: true }, '2026-12-20')
    expect(ctx.locked).toBe('repair')
    expect(ctx.askOpDone).toBe(false)
  })

  it('zählt OP-Woche und Reparaturwochen nicht für Serien', () => {
    const s = { programStart: START, opDate: '2026-12-10', repairSince: '2026-12-10' }
    expect(isNeutralWeek(plan, s, '2026-11-30')).toBe(false)
    expect(isNeutralWeek(plan, s, '2026-12-07')).toBe(true)
    expect(isNeutralWeek(plan, s, '2026-12-14')).toBe(true)
    expect(isNeutralWeek(plan, s, '2026-09-14')).toBe(true)
  })
})

describe('Satzzahl-Regeln', () => {
  it('deckelt in der Kalibrierung', () => {
    const ctx = { weekType: 'calibration', taper: false } as const
    expect([4, 3, 2, 1].map((n) => plannedSets(plan, n, ctx))).toEqual([2, 2, 2, 1])
  })
  it('halbiert im Deload und rundet auf', () => {
    const ctx = { weekType: 'deload', taper: false } as const
    expect([4, 3, 2, 1].map((n) => plannedSets(plan, n, ctx))).toEqual([2, 2, 1, 1])
  })
  it('halbiert im Taper und rundet auf', () => {
    const ctx = { weekType: 'normal', taper: true } as const
    expect([4, 3, 2, 1, 0].map((n) => plannedSets(plan, n, ctx))).toEqual([2, 2, 1, 1, 0])
  })
  it('lässt normale Wochen unverändert', () => {
    expect(plannedSets(plan, 3, { weekType: 'normal', taper: false })).toBe(3)
  })
})
