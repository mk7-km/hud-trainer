import { describe, expect, it } from 'vitest'
import { mondayOf } from './dates'
import { completionLine, homeLine, homeWarnings, type HomeInput } from './homeLine'
import { streaks, weekSummary } from './scoring'
import { dayContext } from './schedule'
import { fullWeek, makeSession } from './testkit'
import { loadTestPlan } from './testplan.node'
import type { BodyweightLog, SessionLog } from './types'

const plan = loadTestPlan()
const PFLICHT = ['lower_a', 'upper_a', 'lower_b', 'upper_b']
const START = '2026-09-21'

function input(today: string, sessions: SessionLog[], extra: Partial<HomeInput['settings']> & { opDate?: string | null; bodyweight?: BodyweightLog[] } = {}): HomeInput {
  const now = Date.parse(`${today}T10:00:00Z`)
  const settings = { programStart: START, opDate: extra.opDate ?? null, repairMode: false, opAskedFor: null, repairSince: null, lastBackupAt: now, persistGranted: true, ...extra }
  return {
    plan,
    ctx: dayContext(plan, settings, today),
    week: weekSummary(plan, sessions, mondayOf(today)),
    streak: streaks(plan, sessions, settings, today),
    settings,
    sessions,
    bodyweight: extra.bodyweight ?? [],
    today,
    now,
  }
}
const weigh = (date: string, weightKg = 90): BodyweightLog => ({ id: date, date, at: 0, weightKg, fatPct: null })

describe('Zeile auf HOME', () => {
  it('Kalibrierungswoche, Deload, offener Wochenstand', () => {
    expect(homeLine(input('2026-09-22', [])).key).toBe('calibrationWeek')
    const w5 = fullWeek('2026-10-19', PFLICHT).slice(0, 1)
    expect(homeLine(input('2026-10-21', w5)).key).toBe('deloadWeek')
    const w2 = fullWeek('2026-09-28', PFLICHT).slice(0, 3)
    expect(homeLine(input('2026-10-02', w2, { bodyweight: [weigh('2026-09-28'), weigh('2026-09-30')] }))).toEqual({
      key: 'homeStatusOpen',
      vars: { open: 1, done: 3, pct: 75 },
    })
  })

  it('Wochenziel erfüllt; OP-Countdown in den letzten 30 Tagen', () => {
    const w2 = fullWeek('2026-09-28', PFLICHT)
    const bw = [weigh('2026-09-28'), weigh('2026-09-30')]
    expect(homeLine(input('2026-10-03', w2, { bodyweight: bw })).key).toBe('homeStatusDone')
    expect(homeLine(input('2026-10-03', w2, { bodyweight: bw, opDate: '2026-10-25' }))).toEqual({ key: 'opCountdown', vars: { days: 22 } })
  })

  it('Montagsbilanz der Vorwoche', () => {
    const full = [...fullWeek('2026-09-21', PFLICHT), ...fullWeek('2026-09-28', PFLICHT)]
    expect(homeLine(input('2026-10-05', full))).toEqual({ key: 'weekComplete', vars: { weeks: 2 } })
    const failed = [...fullWeek('2026-09-21', PFLICHT), ...fullWeek('2026-09-28', PFLICHT).slice(0, 2)]
    expect(homeLine(input('2026-10-05', failed))).toEqual({ key: 'weekFailed', vars: { done: 2, pct: 50 } })
  })

  it('Inaktivität, Backup und Reparaturmodus haben Vorrang', () => {
    const old = [makeSession({ date: '2026-09-29' })]
    expect(homeLine(input('2026-10-08', old))).toEqual({ key: 'inactivity', vars: { days: 9 } })
    const stale = input('2026-10-08', old)
    stale.settings = { ...stale.settings, lastBackupAt: stale.now - 9 * 86_400_000 }
    expect(homeLine(stale)).toEqual({ key: 'backupOverdue', vars: { days: 9 } })
    expect(homeLine(input('2026-10-08', old, { repairMode: true })).key).toBe('repairMode')
  })

  it('Taper und Ruhetage vor der OP', () => {
    const recent = [makeSession({ date: '2026-12-02' })]
    expect(homeLine(input('2026-12-04', recent, { opDate: '2026-12-10', bodyweight: [weigh('2026-12-01'), weigh('2026-12-03')] })).key).toBe('taper')
    expect(homeLine(input('2026-12-09', recent, { opDate: '2026-12-10' })).key).toBe('restBeforeOp')
  })
})

describe('Warnungen', () => {
  it('Backup: nie gesichert zählt erst, wenn Daten vorliegen', () => {
    const none = input('2026-09-22', [])
    none.settings = { ...none.settings, lastBackupAt: null }
    expect(homeWarnings(none)).toEqual([])
    const some = input('2026-09-22', [makeSession({ date: '2026-09-21' })])
    some.settings = { ...some.settings, lastBackupAt: null }
    expect(homeWarnings(some).map((w) => w.kind)).toEqual(['backupOverdue'])
  })

  it('Wägungen ab Donnerstag, Speicherschutz, keine Mahnungen im Reparaturmodus', () => {
    const s = [makeSession({ date: '2026-09-30' })]
    expect(homeWarnings(input('2026-09-30', s)).map((w) => w.kind)).toEqual([])
    expect(homeWarnings(input('2026-10-01', s))).toEqual([{ kind: 'weighInMissing', done: 0 }])
    expect(homeWarnings(input('2026-10-01', s, { persistGranted: false })).map((w) => w.kind)).toEqual(['storage', 'weighInMissing'])
    expect(homeWarnings(input('2026-10-20', s, { repairMode: true }))).toEqual([])
  })
})

describe('Zeile nach Abschluss', () => {
  const pct = 100
  it('vierte Pflichteinheit schließt die Woche ab', () => {
    const week = fullWeek('2026-09-28', PFLICHT)
    expect(completionLine(plan, week, week[3]!, 2, null, pct)).toEqual({ key: 'weekComplete', vars: { weeks: 2 } })
    expect(completionLine(plan, week.slice(0, 3), week[2]!, 0, null, pct).key).toBe('missionComplete')
  })
  it('sechste Einheit macht die Woche perfekt; Bestwert und Abbruch', () => {
    const bonus = ['bonus_bike_mobility', 'bonus_swim_bike'].map((id, i) =>
      makeSession({ date: i ? '2026-10-03' : '2026-09-30', sessionTemplateId: id, sessionType: 'bonus', focus: 'cardio' }),
    )
    const all = [...fullWeek('2026-09-28', PFLICHT), ...bonus]
    expect(completionLine(plan, all, bonus[1]!, 1, null, pct).key).toBe('perfectWeek')
    const one = [makeSession({ date: '2026-09-28' })]
    expect(completionLine(plan, one, one[0]!, 0, { exercise: 'Beinpresse einbeinig', kg: 84 }, pct).key).toBe('newRecordRight')
    const aborted = makeSession({ date: '2026-09-28', status: 'aborted' })
    expect(completionLine(plan, [aborted], aborted, 0, null, pct).key).toBe('sessionAborted')
  })
})
