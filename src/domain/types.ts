export type Side = 'R' | 'L'
export type KneeStatus = 'green' | 'yellow' | 'red'
export type WeekType = 'calibration' | 'normal' | 'deload'
export type SessionStatus = 'active' | 'completed' | 'aborted' | 'suspended_red'
export type SkipReason = 'busy' | 'pain' | 'time'

/** Lokales Datum `YYYY-MM-DD` in der Plan-Zeitzone. */
export type DateStr = string

export interface Settings {
  id: 'main'
  onboardingDone: boolean
  /** Montag der Programmwoche 1. */
  programStart: DateStr | null
  opDate: DateStr | null
  repairMode: boolean
  repairSince: DateStr | null
  /** phase.id des Plans, in dem der Reparaturmodus begann. */
  repairPhaseId: string | null
  /** OP-Datum, für das die Frage „OP erfolgt?“ schon verneint wurde. */
  opAskedFor: DateStr | null
  voice: boolean
  sound: boolean
  bootSequence: boolean
  reduceMotion: boolean
  /** Laststufe je Übung (exerciseId → kg), überschreibt incrementKg. */
  incrementOverrides: Record<string, number>
  lastBackupAt: number | null
  persistGranted: boolean | null
  /** Selbstbestätigungen für Mark-Kriterien (selfCheck.id → Datum). */
  selfChecks: Record<string, DateStr>
  symmetryCaveatSeen: boolean
  lastSeenPlanVersion: string | null
}

export interface SessionLog {
  id: string
  sessionTemplateId: string
  /** Schnappschüsse, damit alte Logs nach einem Planwechsel lesbar bleiben. */
  sessionName: string
  sessionType: 'pflicht' | 'bonus'
  focus: 'lower' | 'upper' | 'cardio'
  planVersion: string
  programWeek: number
  weekType: WeekType
  block: number
  taper: boolean
  date: DateStr
  startedAt: number
  endedAt: number | null
  status: SessionStatus
  kneeStatus: KneeStatus
  /** Geplante Einheiten (Sätze, Checklisten, Ausdauerblöcke) nach allen Anpassungen. */
  plannedUnits: number
  /** Wahl bei chooseOne: Item-Index → exerciseId. */
  choices: Record<string, string>
  skipped: { exerciseId: string; reason: SkipReason }[]
}

export interface SetLog {
  id: string
  sessionId: string
  date: DateStr
  exerciseId: string
  variantId: string | null
  exerciseName: string
  side: Side | null
  setIndex: number
  weightKg: number | null
  reps: number | null
  seconds: number | null
  rir: number | null
  /** Unterer Ziel-RIR zum Zeitpunkt des Satzes (für e1RM ohne geloggten RIR). */
  targetRirLow: number | null
  schonmodus: boolean
  loggedAt: number
}

export interface CheckLog {
  id: string
  sessionId: string
  kind: 'warmup' | 'checklist'
  exerciseId: string | null
  itemId: string
  text: string
  done: boolean
  at: number
}

export interface KneeCheckLog {
  id: string
  sessionId: string | null
  date: DateStr
  at: number
  answers: Record<string, string | number>
  status: KneeStatus
}

export interface KneeEvent {
  id: string
  date: DateStr
  at: number
  type: 'givingWay' | 'locking'
  source: 'check' | 'manual'
}

export interface BodyweightLog {
  id: string
  date: DateStr
  at: number
  weightKg: number
  fatPct: number | null
}

export interface MarkReached {
  level: number
  name: string
  date: DateStr
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'main',
  onboardingDone: false,
  programStart: null,
  opDate: null,
  repairMode: false,
  repairSince: null,
  repairPhaseId: null,
  opAskedFor: null,
  voice: true,
  sound: true,
  bootSequence: true,
  reduceMotion: false,
  incrementOverrides: {},
  lastBackupAt: null,
  persistGranted: null,
  selfChecks: {},
  symmetryCaveatSeen: false,
  lastSeenPlanVersion: null,
}
