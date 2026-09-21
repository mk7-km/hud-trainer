import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { makeSession, makeSets } from '../domain/testkit'
import { rawPlan } from '../domain/testplan.node'
import { backupFileName, exportBackup, importBackup, parseBackup, wipeUserData } from './backup'
import { getSettings, patchSettings, TrainerDb } from './db'
import { loadPlan } from './planLoader'

let n = 0
const dbs: TrainerDb[] = []
function freshDb() {
  const d = new TrainerDb(`test-${++n}`)
  dbs.push(d)
  return d
}
afterEach(async () => {
  for (const d of dbs.splice(0)) await d.delete()
})

async function seed(d: TrainerDb) {
  const session = makeSession({ date: '2026-09-29' })
  await patchSettings({ programStart: '2026-09-21', opDate: '2026-12-10', onboardingDone: true }, d)
  await d.sessions.add(session)
  await d.sets.bulkAdd(makeSets(session, 'legpress_single', 'R', [[50, 10, 2], [50, 9, 2]]))
  await d.bodyweight.add({ id: 'bw1', date: '2026-09-29', at: 1, weightKg: 91.4, fatPct: null })
  await d.kneeEvents.add({ id: 'ev1', date: '2026-09-30', at: 2, type: 'givingWay', source: 'manual' })
  await d.marksReached.add({ level: 1, name: 'Mark I', date: '2026-09-28' })
}

describe('Backup', () => {
  it('Export → Löschen → Import stellt den Zustand wieder her', async () => {
    const d = freshDb()
    await seed(d)
    const before = await exportBackup('1.0.0', d)
    const text = JSON.stringify(before)

    await wipeUserData(d)
    expect(await d.sessions.count()).toBe(0)
    expect((await getSettings(d)).onboardingDone).toBe(false)

    const parsed = parseBackup(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.summary).toMatchObject({ sessions: 1, sets: 2, bodyweight: 1, planVersion: '1.0.0', firstDate: '2026-09-29' })
    await importBackup(parsed.backup, d)

    const after = await exportBackup('1.0.0', d)
    expect(after.tables).toEqual(before.tables)
  })

  it('Import ersetzt vorhandene Daten vollständig', async () => {
    const source = freshDb()
    await seed(source)
    const backup = await exportBackup('1.0.0', source)

    const target = freshDb()
    await target.bodyweight.add({ id: 'alt', date: '2026-01-01', at: 0, weightKg: 99, fatPct: null })
    await importBackup(backup, target)
    expect((await target.bodyweight.toArray()).map((b) => b.id)).toEqual(['bw1'])
  })

  it('lehnt fremde, kaputte und zu neue Dateien ab', () => {
    expect(parseBackup('kein json').ok).toBe(false)
    expect(parseBackup('{"foo":1}').ok).toBe(false)
    const future = { app: 'hud-trainer', schemaVersion: 99, exportedAt: 'x', planVersion: null, tables: {} }
    const res = parseBackup(JSON.stringify(future))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('neueren')
    const noKey = { ...future, schemaVersion: 1, tables: { sessions: [{ date: '2026-01-01' }] } }
    expect(parseBackup(JSON.stringify(noKey)).ok).toBe(false)
  })

  it('ergänzt fehlende Tabellen als leer und benennt die Datei nach Datum', () => {
    const minimal = { app: 'hud-trainer', schemaVersion: 1, exportedAt: '2026-10-01T08:00:00.000Z', planVersion: null, tables: {} }
    const res = parseBackup(JSON.stringify(minimal))
    expect(res.ok && res.backup.tables.sets).toEqual([])
    expect(backupFileName(minimal.exportedAt)).toBe('trainer-backup-2026-10-01.json')
  })
})

describe('Migration älterer Backups', () => {
  const old = { app: 'hud-trainer', schemaVersion: 1, exportedAt: '2026-10-01T08:00:00.000Z', planVersion: '1.0.0', tables: { bodyweight: [{ id: 'a', date: '2026-10-01', at: 1, weight: 91 }] } }

  it('führt alle Schritte bis zur Zielversion der Reihe nach aus', () => {
    const res = parseBackup(JSON.stringify(old), {
      version: 3,
      migrations: {
        // v1 → v2: Feld umbenannt
        1: (b) => ({ ...b, tables: { ...b.tables, bodyweight: (b.tables.bodyweight ?? []).map(({ weight, ...r }) => ({ ...r, weightKg: weight })) } }),
        // v2 → v3: neues Pflichtfeld mit Vorgabe
        2: (b) => ({ ...b, tables: { ...b.tables, bodyweight: (b.tables.bodyweight ?? []).map((r) => ({ fatPct: null, ...r })) } }),
      },
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.backup.schemaVersion).toBe(3)
      expect(res.backup.tables.bodyweight).toEqual([{ id: 'a', date: '2026-10-01', at: 1, weightKg: 91, fatPct: null }])
    }
  })

  it('meldet eine fehlende Migrationsstufe klar', () => {
    const res = parseBackup(JSON.stringify(old), { version: 3, migrations: { 2: (b) => b } })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('Backup-Version 1')
  })
})
describe('Plan laden', () => {
  it('übernimmt einen gültigen Plan und merkt ihn sich', async () => {
    const d = freshDb()
    const res = await loadPlan(async () => rawPlan(), d)
    expect(res).toMatchObject({ source: 'network', error: null })
    expect((await d.planCache.get('lastValid'))?.planVersion).toBe('1.0.0')
  })

  it('ungültiger Plan: letzte gültige Version bleibt, mit klarer Meldung', async () => {
    const d = freshDb()
    await loadPlan(async () => rawPlan(), d)
    const broken = { ...(rawPlan() as object), planVersion: '2.0.0', sessions: [] }
    const res = await loadPlan(async () => broken, d)
    expect(res.source).toBe('cache')
    expect(res.plan?.planVersion).toBe('1.0.0')
    expect(res.error).toContain('ungültig')
  })

  it('offline mit gültiger Kopie ist kein Fehler; ohne Kopie schon', async () => {
    const d = freshDb()
    const offline = async () => Promise.reject(new Error('offline'))
    expect(await loadPlan(offline, d)).toMatchObject({ plan: null, source: 'none' })
    await loadPlan(async () => rawPlan(), d)
    expect(await loadPlan(offline, d)).toMatchObject({ source: 'cache', error: null })
  })
})
