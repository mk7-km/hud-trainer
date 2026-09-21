import { describe, expect, it } from 'vitest'
import { afterSave, nextOpenSlot, slotsOf, supersetMembers } from './missionFlow'
import { resolveSession } from './sessionPlan'
import { makeSession, makeSets } from './testkit'
import { loadTestPlan } from './testplan.node'
import type { SetLog } from './types'

const plan = loadTestPlan()
const ctx = { weekType: 'normal', taper: false, block: 1 } as const

describe('Reihenfolge der Sätze', () => {
  it('wechselt die Seiten, rechts beginnt, auch bei ungleicher Satzzahl', () => {
    const iso = resolveSession(plan, 'upper_a', ctx, 'green').items.find((i) => i.exerciseId === 'knee_iso_legext')!
    expect(slotsOf(iso).map((s) => `${s.side}${s.setIndex + 1}`)).toEqual(['R1', 'L1', 'R2', 'L2', 'R3', 'R4'])
  })

  it('findet den nächsten offenen Satz', () => {
    const item = resolveSession(plan, 'lower_a', ctx, 'green').items.find((i) => i.exerciseId === 'legpress_single')!
    const session = makeSession({ date: '2026-09-29' })
    const sets = makeSets(session, 'legpress_single', 'R', [[50, 10]])
    expect(nextOpenSlot(item, sets)).toEqual({ side: 'L', setIndex: 0 })
  })
})

describe('Supersätze', () => {
  const items = resolveSession(plan, 'upper_a', ctx, 'green').items
  const curl = items.findIndex((i) => i.exerciseId === 'ez_curl')
  const push = items.findIndex((i) => i.exerciseId === 'triceps_pushdown')
  const session = makeSession({ date: '2026-09-29', sessionTemplateId: 'upper_a' })
  const open = (sets: SetLog[]) => (i: number) => nextOpenSlot(items[i]!, sets) !== null

  it('erkennt die Gruppe', () => {
    expect(supersetMembers(items, curl)).toEqual([curl, push])
    expect(supersetMembers(items, 0)).toEqual([0])
  })

  it('wechselt ohne Pause zur Partnerübung, Pause erst nach der letzten Übung der Gruppe', () => {
    const afterCurl = makeSets(session, 'ez_curl', null, [[30, 10]])
    expect(afterSave(items, curl, open(afterCurl))).toEqual({ nextIndex: push, rest: null })
    const afterBoth = [...afterCurl, ...makeSets(session, 'triceps_pushdown', null, [[25, 12]])]
    expect(afterSave(items, push, open(afterBoth))).toEqual({ nextIndex: curl, rest: [60, 60] })
  })

  it('normale Übung: Pause nach jedem Satz, danach weiter zur nächsten offenen Übung', () => {
    const one = makeSets(session, 'bench_press', null, [[80, 8]])
    expect(afterSave(items, 0, open(one))).toEqual({ nextIndex: 0, rest: [120, 180] })
    const all = makeSets(session, 'bench_press', null, [[80, 8], [80, 8], [80, 8], [80, 8]])
    expect(afterSave(items, 0, open(all))).toEqual({ nextIndex: 1, rest: [120, 180] })
  })
})
