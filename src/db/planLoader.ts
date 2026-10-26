import { parsePlan, rulesOf, type Plan, type RulesArchive } from '../domain/plan'
import { db, RULES_PREFIX, type TrainerDb } from './db'

export interface LoadedPlan {
  plan: Plan | null
  /** network = frisch geladen und gültig, cache = letzte gültige Version aus der Datenbank. */
  source: 'network' | 'cache' | 'none'
  /** Klartext für SYSTEM, wenn der geladene Plan ungültig oder nicht erreichbar war. */
  error: string | null
}

type Fetcher = () => Promise<unknown>

const defaultFetcher: Fetcher = async () => {
  const res = await fetch(`${import.meta.env.BASE_URL}plan.json`, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Regeln einer Planversion archivieren, damit alte Wochen nach den damals gültigen Regeln zählen. */
export async function archiveRules(plan: Plan, database: TrainerDb = db): Promise<void> {
  await database.planCache.put({
    id: RULES_PREFIX + plan.planVersion,
    planVersion: plan.planVersion,
    raw: plan,
    storedAt: Date.now(),
    rules: rulesOf(plan),
  })
}

export async function loadRulesArchive(database: TrainerDb = db): Promise<RulesArchive> {
  const rows = await database.planCache.where('id').startsWith(RULES_PREFIX).toArray()
  return Object.fromEntries(rows.filter((r) => r.rules).map((r) => [r.planVersion, r.rules!]))
}

/** Network-first (der Service Worker liefert offline seine Kopie); ungültige Pläne ersetzen nie den letzten gültigen. */
export async function loadPlan(fetcher: Fetcher = defaultFetcher, database: TrainerDb = db): Promise<LoadedPlan> {
  let error: string
  try {
    const result = parsePlan(await fetcher())
    if (result.ok) {
      // Vorgängerversion sichern, falls sie noch nicht im Archiv steht (Geräte, die vor dem Archiv liefen).
      const previous = await database.planCache.get('lastValid')
      if (previous && previous.planVersion !== result.plan.planVersion) {
        const old = parsePlan(previous.raw)
        if (old.ok && !(await database.planCache.get(RULES_PREFIX + old.plan.planVersion))) await archiveRules(old.plan, database)
      }
      await database.planCache.put({ id: 'lastValid', planVersion: result.plan.planVersion, raw: result.plan, storedAt: Date.now() })
      await archiveRules(result.plan, database)
      return { plan: result.plan, source: 'network', error: null }
    }
    error = `Der neue Trainingsplan ist ungültig und wurde nicht übernommen. ${result.errors.slice(0, 3).join(' · ')}`
  } catch {
    error = 'Der Trainingsplan konnte nicht geladen werden.'
  }

  const cached = await database.planCache.get('lastValid')
  const fallback = cached ? parsePlan(cached.raw) : null
  if (fallback?.ok) {
    // Offline ohne neuen Plan ist kein Fehler, solange eine gültige Version vorliegt.
    const offline = error === 'Der Trainingsplan konnte nicht geladen werden.'
    return { plan: fallback.plan, source: 'cache', error: offline ? null : error }
  }
  return { plan: null, source: 'none', error }
}
