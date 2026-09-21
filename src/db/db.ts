import Dexie, { type Table } from 'dexie'
import {
  DEFAULT_SETTINGS,
  type BodyweightLog,
  type CheckLog,
  type KneeCheckLog,
  type KneeEvent,
  type MarkReached,
  type SessionLog,
  type SetLog,
  type Settings,
} from '../domain/types'

export interface PlanCacheRow {
  id: 'lastValid'
  planVersion: string
  raw: unknown
  storedAt: number
}

export class TrainerDb extends Dexie {
  settings!: Table<Settings, string>
  sessions!: Table<SessionLog, string>
  sets!: Table<SetLog, string>
  checks!: Table<CheckLog, string>
  kneeChecks!: Table<KneeCheckLog, string>
  kneeEvents!: Table<KneeEvent, string>
  bodyweight!: Table<BodyweightLog, string>
  marksReached!: Table<MarkReached, number>
  /** Letzter gültiger Plan. Kein Nutzerdatum, nicht Teil des Backups. */
  planCache!: Table<PlanCacheRow, string>

  constructor(name = 'hud-trainer') {
    super(name)
    this.version(1).stores({
      settings: 'id',
      sessions: 'id, date, status, sessionTemplateId',
      sets: 'id, sessionId, date, exerciseId',
      checks: 'id, sessionId',
      kneeChecks: 'id, date, sessionId',
      kneeEvents: 'id, date',
      bodyweight: 'id, date',
      marksReached: 'level',
      planCache: 'id',
    })
  }
}

export const db = new TrainerDb()

/** Tabellen mit Nutzerdaten, in fester Reihenfolge (Backup, Löschen). */
export const USER_TABLES = [
  'settings',
  'sessions',
  'sets',
  'checks',
  'kneeChecks',
  'kneeEvents',
  'bodyweight',
  'marksReached',
] as const
export type UserTable = (typeof USER_TABLES)[number]

export async function getSettings(database: TrainerDb = db): Promise<Settings> {
  const stored = await database.settings.get('main')
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function patchSettings(patch: Partial<Settings>, database: TrainerDb = db): Promise<Settings> {
  return database.transaction('rw', database.settings, async () => {
    const next = { ...(await getSettings(database)), ...patch, id: 'main' as const }
    await database.settings.put(next)
    return next
  })
}

export function newId(): string {
  return crypto.randomUUID()
}
