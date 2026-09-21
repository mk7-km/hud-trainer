import { useMemo } from 'react'
import { mondayOf } from '../domain/dates'
import { advanceMarks, calmDays, highestReached, type MarkFacts } from '../domain/marks'
import type { Plan } from '../domain/plan'
import { points, streaks, weekSummary } from '../domain/scoring'
import { dayContext } from '../domain/schedule'
import { baseline, baselineCaptured, rightGain, symmetry } from '../domain/strength'
import { useApp } from './store'

/** Alle abgeleiteten Werte: reine Funktionen über Logs + Plan, nichts davon wird gespeichert. */
export function useDerived(plan: Plan) {
  const settings = useApp((st) => st.settings)
  const sessions = useApp((st) => st.sessions)
  const sets = useApp((st) => st.sets)
  const kneeChecks = useApp((st) => st.kneeChecks)
  const kneeEvents = useApp((st) => st.kneeEvents)
  const marksReached = useApp((st) => st.marksReached)
  const today = useApp((st) => st.today)

  return useMemo(() => {
    // Im Reparaturmodus sind Mark und Punkte eingefroren: Stichtag ist der Beginn der Reparatur.
    const asOf = settings.repairMode && settings.repairSince ? settings.repairSince : today
    const ctx = dayContext(plan, settings, today)
    const week = weekSummary(plan, sessions, mondayOf(today))
    const streak = streaks(plan, sessions, settings, asOf)
    const pts = points(plan, sessions, sets)
    const sym = symmetry(plan, sets, asOf)
    const base = baseline(plan, sets, sessions)
    const gain = rightGain(plan, sets, base, asOf)
    const facts: MarkFacts = {
      fullWeeksTotal: streak.fullWeeksTotal,
      bestStreak: streak.best,
      baselineCaptured: baselineCaptured(base),
      rightGain: gain.gain,
      symmetryIndex: sym.index,
      calmDays: calmDays(kneeChecks, kneeEvents, settings.programStart, asOf),
      selfChecks: settings.selfChecks,
    }
    const reachedLevel = highestReached(marksReached)
    const earnedLevel = advanceMarks(plan, reachedLevel, facts)
    return { ctx, week, streak, points: pts, symmetry: sym, baseline: base, gain, facts, reachedLevel, earnedLevel }
  }, [plan, settings, sessions, sets, kneeChecks, kneeEvents, marksReached, today])
}

export type Derived = ReturnType<typeof useDerived>
