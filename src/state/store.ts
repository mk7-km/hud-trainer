import { create } from 'zustand'
import { db, getSettings, patchSettings } from '../db/db'
import { loadPlan, loadRulesArchive } from '../db/planLoader'
import { localDate } from '../domain/dates'
import type { Plan, RulesArchive } from '../domain/plan'
import {
  DEFAULT_SETTINGS,
  type BodyweightLog,
  type CheckLog,
  type DateStr,
  type KneeCheckLog,
  type KneeEvent,
  type MarkReached,
  type SessionLog,
  type SetLog,
  type Settings,
} from '../domain/types'

export interface UserData {
  sessions: SessionLog[]
  sets: SetLog[]
  checks: CheckLog[]
  kneeChecks: KneeCheckLog[]
  kneeEvents: KneeEvent[]
  bodyweight: BodyweightLog[]
  marksReached: MarkReached[]
}

interface AppState extends UserData {
  ready: boolean
  plan: Plan | null
  planError: string | null
  /** Eine neue planVersion wurde geladen (Hinweis planUpdated). */
  planUpdatedTo: string | null
  /** Regeln früherer Planversionen (Punkte, Wochenziel) für die Bewertung alter Wochen. */
  planArchive: RulesArchive
  settings: Settings
  today: DateStr
  init(): Promise<void>
  /** Liest alle Nutzerdaten neu aus der Datenbank (nach Import, Löschen, Schreibvorgängen). */
  reload(): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
  dismissPlanUpdated(): void
  refreshToday(): void
}

const FALLBACK_TZ = 'Europe/Vienna'

async function readUserData(): Promise<UserData> {
  const [sessions, sets, checks, kneeChecks, kneeEvents, bodyweight, marksReached] = await Promise.all([
    db.sessions.toArray(),
    db.sets.toArray(),
    db.checks.toArray(),
    db.kneeChecks.toArray(),
    db.kneeEvents.toArray(),
    db.bodyweight.toArray(),
    db.marksReached.toArray(),
  ])
  return { sessions, sets, checks, kneeChecks, kneeEvents, bodyweight, marksReached }
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  plan: null,
  planError: null,
  planUpdatedTo: null,
  planArchive: {},
  settings: DEFAULT_SETTINGS,
  today: localDate(Date.now(), FALLBACK_TZ),
  sessions: [],
  sets: [],
  checks: [],
  kneeChecks: [],
  kneeEvents: [],
  bodyweight: [],
  marksReached: [],

  async init() {
    const [loaded, settings, data] = await Promise.all([loadPlan(), getSettings(), readUserData()])
    const planArchive = await loadRulesArchive()
    const plan = loaded.plan
    let planUpdatedTo: string | null = null
    if (plan && settings.lastSeenPlanVersion !== plan.planVersion) {
      if (settings.lastSeenPlanVersion !== null) planUpdatedTo = plan.planVersion
      settings.lastSeenPlanVersion = plan.planVersion
      await patchSettings({ lastSeenPlanVersion: plan.planVersion })
    }
    set({
      ...data,
      plan,
      planError: loaded.error,
      planUpdatedTo,
      planArchive,
      settings,
      today: localDate(Date.now(), plan?.schedule.timezone ?? FALLBACK_TZ),
      ready: true,
    })
  },

  async reload() {
    const [settings, data, planArchive] = await Promise.all([getSettings(), readUserData(), loadRulesArchive()])
    set({ ...data, settings, planArchive })
  },

  async updateSettings(patch) {
    set({ settings: await patchSettings(patch) })
  },

  dismissPlanUpdated() {
    set({ planUpdatedTo: null })
  },

  refreshToday() {
    const today = localDate(Date.now(), get().plan?.schedule.timezone ?? FALLBACK_TZ)
    if (today !== get().today) set({ today })
  },
}))
