import type { ResolvedItem } from './sessionPlan'
import type { SetLog, Side } from './types'

export interface Slot {
  side: Side | null
  setIndex: number
}

/** Reihenfolge der Sätze: Seiten im Wechsel, rechts beginnt (R1, L1, R2, L2, …). */
export function slotsOf(item: ResolvedItem): Slot[] {
  if (item.logType === 'duration') return [{ side: null, setIndex: 0 }]
  const rounds = Math.max(0, ...item.sides.map((s) => s.sets))
  const slots: Slot[] = []
  for (let r = 0; r < rounds; r++) {
    for (const s of item.sides) if (r < s.sets) slots.push({ side: s.side, setIndex: r })
  }
  return slots
}

export function findSet(sets: SetLog[], item: ResolvedItem, slot: Slot): SetLog | undefined {
  return sets.find((s) => s.exerciseId === item.exerciseId && s.side === slot.side && s.setIndex === slot.setIndex)
}

export function nextOpenSlot(item: ResolvedItem, sessionSets: SetLog[]): Slot | null {
  return slotsOf(item).find((slot) => !findSet(sessionSets, item, slot)) ?? null
}

export function loggedCount(item: ResolvedItem, sessionSets: SetLog[]): number {
  return slotsOf(item).filter((slot) => findSet(sessionSets, item, slot)).length
}

/** Aufeinanderfolgende Items derselben supersetGroup, inklusive `index`. */
export function supersetMembers(items: ResolvedItem[], index: number): number[] {
  const group = items[index]?.supersetGroup
  if (!group) return [index]
  let from = index
  let to = index
  while (from > 0 && items[from - 1]!.supersetGroup === group) from--
  while (to < items.length - 1 && items[to + 1]!.supersetGroup === group) to++
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

export interface AfterSave {
  /** Item, das als Nächstes gezeigt wird; null = alles erledigt. */
  nextIndex: number | null
  /** Pause (Sekundenbereich) oder null, wenn im Supersatz direkt gewechselt wird. */
  rest: [number, number] | null
}

/** Was nach „Satz speichern“ passiert: im Supersatz wechseln, Pause erst nach der letzten Übung der Gruppe. */
export function afterSave(items: ResolvedItem[], index: number, open: (index: number) => boolean): AfterSave {
  const members = supersetMembers(items, index)
  const pos = members.indexOf(index)

  // Im Supersatz: nächstes Mitglied mit offenem Satz, zyklisch ab dem aktuellen.
  const rotation = [...members.slice(pos + 1), ...members.slice(0, pos + 1)]
  const nextMember = rotation.find(open)
  if (nextMember !== undefined) {
    const wrapped = members.indexOf(nextMember) <= pos
    const lastOfRound = members[members.length - 1]!
    return { nextIndex: nextMember, rest: wrapped ? items[lastOfRound]!.restSec : null }
  }

  // Übung (oder Gruppe) fertig: Pause läuft, während zur nächsten offenen Übung gewechselt wird.
  const after = items.findIndex((_, i) => i > index && open(i))
  const any = after !== -1 ? after : items.findIndex((_, i) => open(i))
  const rest = any === -1 ? null : items[members[members.length - 1]!]!.restSec
  return { nextIndex: any === -1 ? null : any, rest }
}
