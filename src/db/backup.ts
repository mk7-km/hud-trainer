import { z } from 'zod'
import { db, USER_TABLES, type TrainerDb, type UserTable } from './db'

export const BACKUP_SCHEMA_VERSION = 1
const APP_TAG = 'hud-trainer'

const row = z.record(z.string(), z.unknown())
const backupSchema = z.object({
  app: z.literal(APP_TAG),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  planVersion: z.string().nullable(),
  tables: z.record(z.string(), z.array(row)),
})

export type Backup = Omit<z.infer<typeof backupSchema>, 'tables'> & {
  tables: Record<UserTable, Record<string, unknown>[]>
}

type RawBackup = z.infer<typeof backupSchema>
export type Migrations = Record<number, (b: RawBackup) => RawBackup>

/** Migrationen: Schlüssel = Ausgangsversion, Ergebnis = nächste Version. Bei jeder Änderung am Datenformat
 *  BACKUP_SCHEMA_VERSION erhöhen und hier den Schritt von der alten Version ergänzen. */
const MIGRATIONS: Migrations = {}

export async function exportBackup(planVersion: string | null, database: TrainerDb = db): Promise<Backup> {
  const tables = {} as Backup['tables']
  await database.transaction('r', USER_TABLES.map((t) => database[t]), async () => {
    for (const t of USER_TABLES) tables[t] = (await database[t].toArray()) as unknown as Record<string, unknown>[]
  })
  return {
    app: APP_TAG,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    planVersion,
    tables,
  }
}

export type ParsedBackup =
  | { ok: true; backup: Backup; summary: BackupSummary }
  | { ok: false; error: string }

export interface BackupSummary {
  exportedAt: string
  planVersion: string | null
  sessions: number
  sets: number
  bodyweight: number
  firstDate: string | null
  lastDate: string | null
}

const PRIMARY_KEY: Record<UserTable, string> = {
  settings: 'id',
  sessions: 'id',
  sets: 'id',
  checks: 'id',
  kneeChecks: 'id',
  kneeEvents: 'id',
  bodyweight: 'id',
  marksReached: 'level',
}

export function parseBackup(
  text: string,
  target: { version: number; migrations: Migrations } = { version: BACKUP_SCHEMA_VERSION, migrations: MIGRATIONS },
): ParsedBackup {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Die Datei ist kein gültiges JSON.' }
  }
  const parsed = backupSchema.safeParse(json)
  if (!parsed.success) return { ok: false, error: 'Die Datei ist kein Backup dieser App.' }

  let data = parsed.data
  if (data.schemaVersion > target.version) {
    return { ok: false, error: 'Das Backup stammt aus einer neueren App-Version. Aktualisiere zuerst die App.' }
  }
  while (data.schemaVersion < target.version) {
    const from = data.schemaVersion
    const migrate = target.migrations[from]
    if (!migrate) return { ok: false, error: `Backup-Version ${data.schemaVersion} wird nicht unterstützt.` }
    data = { ...migrate(data), schemaVersion: from + 1 }
  }

  const tables = {} as Backup['tables']
  for (const t of USER_TABLES) {
    const rows = data.tables[t] ?? []
    if (rows.some((r) => r[PRIMARY_KEY[t]] === undefined || r[PRIMARY_KEY[t]] === null)) {
      return { ok: false, error: `Tabelle „${t}“ enthält Einträge ohne Schlüssel.` }
    }
    tables[t] = rows
  }

  const dates = tables.sessions.map((s) => String(s.date)).sort()
  return {
    ok: true,
    backup: { ...data, tables },
    summary: {
      exportedAt: data.exportedAt,
      planVersion: data.planVersion,
      sessions: tables.sessions.length,
      sets: tables.sets.length,
      bodyweight: tables.bodyweight.length,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
    },
  }
}

/** Ersetzt alle Nutzerdaten durch den Inhalt des Backups. */
export async function importBackup(backup: Backup, database: TrainerDb = db): Promise<void> {
  await database.transaction('rw', USER_TABLES.map((t) => database[t]), async () => {
    for (const t of USER_TABLES) {
      await database[t].clear()
      await (database[t] as unknown as { bulkPut(rows: unknown[]): Promise<unknown> }).bulkPut(backup.tables[t])
    }
  })
}

export async function wipeUserData(database: TrainerDb = db): Promise<void> {
  await database.transaction('rw', USER_TABLES.map((t) => database[t]), async () => {
    for (const t of USER_TABLES) await database[t].clear()
  })
}

export function backupFileName(exportedAt: string): string {
  return `trainer-backup-${exportedAt.slice(0, 10)}.json`
}
