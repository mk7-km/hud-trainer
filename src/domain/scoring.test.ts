import { describe, expect, it } from 'vitest'
import { average7, losingTooFast, weeklyTrend, weighInsThisWeek } from './bodyweight'
import { advanceMarks, calmDays, evaluateMark, type MarkFacts } from './marks'
import { completionRatio, doneUnits, finishStatus, points, streaks, weekSummary } from './scoring'
import { baseline, baselineCaptured, bestE1rm, e1rm, rightGain, rightGainExercises, rightRecords, symmetry } from './strength'
import { fullWeek, makeSession, makeSets } from './testkit'
import { loadTestPlan } from './testplan.node'
import type { BodyweightLog, CheckLog, KneeCheckLog, KneeEvent, SessionLog, SetLog } from './types'

const plan = loadTestPlan()
const PFLICHT = ['lower_a', 'upper_a', 'lower_b', 'upper_b']
const START = '2026-09-21'
const settings = { programStart: START, opDate: null, repairSince: null }

describe('e1RM', () => {
  const s = makeSession({ date: '2026-09-22' })
  it('rechnet mit geloggtem RIR, sonst mit dem unteren Ziel-RIR', () => {
    expect(e1rm(makeSets(s, 'x', 'R', [[60, 10, 2]])[0]!)).toBeCloseTo(84)
    expect(e1rm(makeSets(s, 'x', 'R', [[60, 10, null]], { targetRirLow: 3 })[0]!)).toBeCloseTo(86)
  })
  it('ignoriert Sätze über 15 Wiederholungen, ohne Last und im Schonmodus', () => {
    expect(e1rm(makeSets(s, 'x', 'R', [[60, 16, 2]])[0]!)).toBeNull()
    expect(e1rm(makeSets(s, 'x', 'R', [[0, 10, 2]])[0]!)).toBeNull()
    expect(e1rm(makeSets(s, 'x', 'R', [[60, 10, 2]], { schonmodus: true })[0]!)).toBeNull()
  })
})

describe('Symmetrie, Baseline, Zuwachs', () => {
  const w1 = makeSession({ date: '2026-09-22', programWeek: 1, weekType: 'calibration' })
  const w6 = makeSession({ date: '2026-10-27', programWeek: 6 })
  const sets: SetLog[] = [
    ...makeSets(w1, 'legpress_single', 'R', [[50, 10, 2]]), // 70
    ...makeSets(w1, 'legpress_single', 'L', [[75, 10, 2]]), // 105
    ...makeSets(w1, 'legext_single', 'R', [[20, 13, 2]]), // 30
    ...makeSets(w1, 'legext_single', 'L', [[30, 13, 2]]), // 45
    ...makeSets(w1, 'legcurl_single', 'R', [[25, 10, 2]]), // 35
    ...makeSets(w1, 'legcurl_single', 'L', [[25, 10, 2]]), // 35
    ...makeSets(w6, 'legpress_single', 'R', [[60, 10, 2]]), // 84
    ...makeSets(w6, 'legpress_single', 'L', [[75, 10, 2]]), // 105
    ...makeSets(w6, 'legext_single', 'R', [[24, 13, 2]]), // 36
    ...makeSets(w6, 'legext_single', 'L', [[30, 13, 2]]), // 45
    ...makeSets(w6, 'legcurl_single', 'R', [[30, 10, 2]]), // 42 > links → Deckel 1,0
    ...makeSets(w6, 'legcurl_single', 'L', [[25, 10, 2]]),
  ]

  it('rechnet je Übung, je Gruppe und gesamt im 14-Tage-Fenster', () => {
    const r = symmetry(plan, sets, '2026-10-28')
    expect(r.rows.map((x) => x.ratio)).toEqual([expect.closeTo(0.8), expect.closeTo(0.8), 1])
    expect(r.groups.quad).toBeCloseTo(0.8)
    expect(r.groups.ham).toBe(1)
    expect(r.index).toBeCloseTo((0.8 + 0.8 + 1) / 3)
  })

  it('lässt Werte außerhalb des Fensters und einseitige Daten weg', () => {
    expect(symmetry(plan, sets, '2026-11-20').index).toBeNull()
    const onlyRight = sets.filter((s) => s.side === 'R')
    expect(symmetry(plan, onlyRight, '2026-10-28').index).toBeNull()
  })

  it('Baseline aus Programmwoche 1–2, Zuwachs rechts über die benannten Übungen', () => {
    const base = baseline(plan, sets, [w1, w6])
    expect(base.legpress_single).toEqual({ R: expect.closeTo(70), L: expect.closeTo(105) })
    expect(baselineCaptured(base)).toBe(true)
    expect(rightGainExercises(plan)).toEqual(['legpress_single', 'legext_single'])
    expect(rightGain(plan, sets, base, '2026-10-28').gain).toBeCloseTo(0.2) // (84/70 + 36/30) / 2 − 1
  })

  it('Baseline unvollständig, solange eine Seite fehlt', () => {
    const partial = sets.filter((s) => !(s.exerciseId === 'legcurl_single' && s.side === 'L'))
    expect(baselineCaptured(baseline(plan, partial, [w1, w6]))).toBe(false)
    expect(baselineCaptured(baseline(plan, [], []))).toBe(false)
  })

  it('Bestwerte rechts: nur gegen frühere Einheiten, nie der erste Wert', () => {
    const rec = rightRecords(plan, sets, [w1, w6])
    expect(rec.get(w1.id)).toBeUndefined()
    expect(rec.get(w6.id)!.map((r) => r.exerciseId).sort()).toEqual(['legcurl_single', 'legext_single', 'legpress_single'])
    expect(bestE1rm(sets, 'legpress_single', 'R')).toBeCloseTo(84)
  })
})

describe('Abschluss einer Einheit', () => {
  it('zählt Sätze und vollständig abgehakte Checklisten', () => {
    const s = makeSession({ date: '2026-09-29' })
    const sets = makeSets(s, 'squat_barbell', null, [[60, 8], [60, 8]])
    const check = (itemId: string, done: boolean): CheckLog => ({
      id: itemId, sessionId: s.id, kind: 'checklist', exerciseId: 'physio_cooldown', itemId, text: '', done, at: 0,
    })
    expect(doneUnits(s.id, sets, [check('a', true), check('b', false)], { physio_cooldown: 2 })).toBe(2)
    expect(doneUnits(s.id, sets, [check('a', true), check('b', true)], { physio_cooldown: 2 })).toBe(3)
  })
  it('ab 80 % abgeschlossen, darunter abgebrochen', () => {
    expect(finishStatus(plan, 8, 10)).toBe('completed')
    expect(finishStatus(plan, 7, 10)).toBe('aborted')
    expect(finishStatus(plan, 17, 21)).toBe('completed') // Bezug: angepasste Satzzahl
    expect(finishStatus(plan, 0, 0)).toBe('aborted')
    expect(completionRatio(12, 10)).toBe(1)
  })
})

describe('Punkte und Wochen', () => {
  const monday = '2026-09-28'
  const week = fullWeek(monday, PFLICHT)

  it('volle Woche: 4 × 100 + 200', () => {
    expect(weekSummary(plan, week, monday)).toMatchObject({ pflichtDone: 4, full: true, perfect: false, pct: 100 })
    expect(points(plan, week, []).total).toBe(600)
  })

  it('perfekte Woche: + 2 × 50 + 100', () => {
    const bonus = ['bonus_bike_mobility', 'bonus_swim_bike'].map((id, i) =>
      makeSession({ date: i ? '2026-10-03' : '2026-09-30', sessionTemplateId: id, sessionType: 'bonus', focus: 'cardio' }),
    )
    expect(weekSummary(plan, [...week, ...bonus], monday).perfect).toBe(true)
    expect(points(plan, [...week, ...bonus], []).total).toBe(800)
  })

  it('abgebrochene Einheiten zählen nicht, ausgesetzte ROT-Einheiten erfüllen das Wochenziel ohne Punkte', () => {
    const aborted = week.map((s, i) => (i === 0 ? { ...s, status: 'aborted' as const } : s))
    expect(weekSummary(plan, aborted, monday)).toMatchObject({ pflichtDone: 3, full: false, pct: 75 })
    expect(points(plan, aborted, []).total).toBe(300)

    const red = week.map((s, i) => (i === 0 ? { ...s, status: 'suspended_red' as const, kneeStatus: 'red' as const } : s))
    expect(weekSummary(plan, red, monday).full).toBe(true)
    expect(points(plan, red, []).total).toBe(300 + 200)
  })

  it('ROT-Bonuseinheit (nur Mobility) bringt redReplacementMobility', () => {
    const s = makeSession({ date: monday, sessionTemplateId: 'bonus_bike_mobility', sessionType: 'bonus', focus: 'cardio', kneeStatus: 'red' })
    expect(points(plan, [s], []).total).toBe(50)
  })

  it('dieselbe Vorlage zählt pro Woche nur einmal', () => {
    const twice = [...week, makeSession({ date: '2026-10-03', sessionTemplateId: 'lower_a' })]
    expect(weekSummary(plan, twice, monday).pflichtDone).toBe(4)
    expect(points(plan, twice, []).total).toBe(600)
  })

  it('bleibt nach Korrektur von Sätzen konsistent (Bestwert-Bonus)', () => {
    const a = makeSession({ date: '2026-09-28', sessionTemplateId: 'lower_a' })
    const b = makeSession({ date: '2026-10-05', sessionTemplateId: 'lower_a' })
    const first = makeSets(a, 'legpress_single', 'R', [[50, 10, 2]])
    const second = makeSets(b, 'legpress_single', 'R', [[55, 10, 2]])
    expect(points(plan, [a, b], [...first, ...second]).total).toBe(225)
    const corrected = second.map((s) => ({ ...s, weightKg: 45 }))
    expect(points(plan, [a, b], [...first, ...corrected]).total).toBe(200)
  })
})

describe('Serien', () => {
  const weeks = (mondays: string[]): SessionLog[] => mondays.flatMap((m) => fullWeek(m, PFLICHT))

  it('zählt volle Wochen in Folge, eine verfehlte Woche beendet die Serie', () => {
    const sessions = weeks(['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-19'])
    const r = streaks(plan, sessions, settings, '2026-10-28') // Woche 4 (12.10.) verfehlt, Woche 6 läuft
    expect(r).toMatchObject({ current: 1, best: 3, fullWeeksTotal: 4 })
    expect(r.weeks.map((w) => w.full)).toEqual([true, true, true, false, true])
  })

  it('die laufende Woche verlängert, beendet aber erst nach Sonntag', () => {
    const sessions = weeks(['2026-09-21', '2026-09-28'])
    expect(streaks(plan, sessions, settings, '2026-10-04').current).toBe(2) // Sonntag der vollen Woche
    expect(streaks(plan, sessions, settings, '2026-10-08').current).toBe(2) // neue Woche läuft noch
    expect(streaks(plan, sessions, settings, '2026-10-12').current).toBe(0) // Woche 3 verfehlt
  })

  it('OP-Woche und Reparaturmodus sind neutral', () => {
    const sessions = weeks(['2026-09-21', '2026-09-28'])
    const s = { programStart: START, opDate: '2026-10-08', repairSince: '2026-10-08' }
    expect(streaks(plan, sessions, s, '2026-11-15')).toMatchObject({ current: 2, best: 2 })
  })
})

describe('Mark-Stufen', () => {
  const none: MarkFacts = {
    fullWeeksTotal: 0, bestStreak: 0, baselineCaptured: false, rightGain: null, symmetryIndex: null, calmDays: 0, selfChecks: {},
  }

  it('werden der Reihe nach erreicht', () => {
    expect(advanceMarks(plan, 0, none)).toBe(0)
    expect(advanceMarks(plan, 0, { ...none, fullWeeksTotal: 1, baselineCaptured: true })).toBe(1)
    // Kriterien für Mark III erfüllt, für Mark II (Serie 3) nicht → bleibt bei I
    const skip = { ...none, fullWeeksTotal: 2, bestStreak: 2, baselineCaptured: true, rightGain: 0.25, symmetryIndex: 0.8 }
    expect(advanceMarks(plan, 0, skip)).toBe(1)
    expect(advanceMarks(plan, 0, { ...skip, bestStreak: 3 })).toBe(3)
  })

  it('fallen nie zurück', () => {
    expect(advanceMarks(plan, 3, none)).toBe(3)
  })

  it('Mark VI verlangt die Selbstbestätigung', () => {
    const top = { fullWeeksTotal: 9, bestStreak: 9, baselineCaptured: true, rightGain: 0.5, symmetryIndex: 0.95, calmDays: 30, selfChecks: {} }
    expect(advanceMarks(plan, 0, top)).toBe(5)
    expect(advanceMarks(plan, 5, { ...top, selfChecks: { fullExtension: '2026-12-01' } })).toBe(6)
  })

  it('liefert Ist und Soll je Kriterium', () => {
    const res = evaluateMark(plan, 2, { ...none, bestStreak: 2, rightGain: 0.12 })
    expect(res.map((r) => [r.criterion.type, r.actual, r.required, r.ok])).toEqual([
      ['fullWeeksInRowMin', 2, 3, false],
      ['rightGainMin', 0.12, 0.1, true],
    ])
  })

  it('ruhige Tage: seit dem letzten ROT-Status oder Ereignis', () => {
    const red = { date: '2026-10-01', status: 'red' } as KneeCheckLog
    const yellow = { date: '2026-10-05', status: 'yellow' } as KneeCheckLog
    const event = { date: '2026-10-03', type: 'givingWay' } as KneeEvent
    expect(calmDays([], [], START, '2026-09-30')).toBe(10)
    expect(calmDays([red, yellow], [], START, '2026-10-10')).toBe(9)
    expect(calmDays([red], [event], START, '2026-10-10')).toBe(7)
    expect(calmDays([], [event], START, '2026-10-03')).toBe(0)
    expect(calmDays([], [], null, '2026-10-03')).toBe(0)
  })
})

describe('Körpergewicht', () => {
  const entry = (date: string, weightKg: number): BodyweightLog => ({ id: date, date, at: 0, weightKg, fatPct: null })

  it('7-Tage-Schnitt und Wochentrend', () => {
    const e = [entry('2026-10-01', 90), entry('2026-10-04', 89), entry('2026-10-08', 88.5), entry('2026-10-11', 88.5)]
    expect(average7(e, '2026-10-04')).toBeCloseTo(89.5)
    expect(average7(e, '2026-10-11')).toBeCloseTo(88.5)
    expect(weeklyTrend(e, '2026-10-11')).toBeCloseTo(-1)
    expect(average7([], '2026-10-11')).toBeNull()
  })

  it('zählt Wägetage der laufenden Woche', () => {
    const e = [entry('2026-10-04', 89), entry('2026-10-05', 89), { ...entry('2026-10-05', 89.2), id: 'x' }, entry('2026-10-07', 89)]
    expect(weighInsThisWeek(e, '2026-10-08')).toBe(2)
  })

  it('warnt erst nach zwei zu schnellen Wochen in Folge', () => {
    const fast = [entry('2026-09-27', 92), entry('2026-10-04', 91.2), entry('2026-10-11', 90.4)]
    expect(losingTooFast(plan, fast, '2026-10-11')).toBe(true)
    const once = [entry('2026-09-27', 92), entry('2026-10-04', 91.7), entry('2026-10-11', 90.9)]
    expect(losingTooFast(plan, once, '2026-10-11')).toBe(false)
  })
})
