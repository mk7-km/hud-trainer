import { create } from 'zustand'
import { db, getSettings, patchSettings } from '../db/db'
import { loadPlan } from '../db/planLoader'
import { localDate } from '../domain/dates'
import type { Plan } from '../domain/plan'
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
      settings,
      today: localDate(Date.now(), plan?.schedule.timezone ?? FALLBACK_TZ),
      ready: true,
    })
  },

  async reload() {
    const [settings, data] = await Promise.all([getSettings(), readUserData()])
    set({ ...data, settings })
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
