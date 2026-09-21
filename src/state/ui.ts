import { create } from 'zustand'

export type Tab = 'home' | 'week' | 'status' | 'system'

export type MissionTarget =
  | { kind: 'start'; templateId: string }
  | { kind: 'resume'; sessionId: string }

interface RestTimer {
  startedAt: number
  /** Ende der Mindestpause. */
  endsAt: number
  /** Ende der längsten vorgesehenen Pause. */
  maxEndsAt: number
}

export interface TooSoon {
  templateId: string
  hours: number
  line: string
}

interface UiState {
  tab: Tab
  mission: MissionTarget | null
  rest: RestTimer | null
  /** Warnung vor zu früher Unterkörper-Einheit, wartet auf Bestätigung. */
  tooSoon: TooSoon | null
  /** Gerade erreichte Mark-Stufe (für die Aufstiegsanzeige). */
  markUp: { level: number; name: string; title: string } | null
  setTab(tab: Tab): void
  openMission(target: MissionTarget): void
  closeMission(): void
  startRest(range: [number, number] | null): void
  clearRest(): void
  setTooSoon(value: TooSoon | null): void
  setMarkUp(value: UiState['markUp']): void
}

export const useUi = create<UiState>((set) => ({
  tab: 'home',
  mission: null,
  rest: null,
  tooSoon: null,
  markUp: null,
  setTab: (tab) => set({ tab }),
  openMission: (mission) => set({ mission, rest: null, tooSoon: null }),
  closeMission: () => set({ mission: null, rest: null }),
  // Zeitstempel statt Zähler: übersteht Hintergrund und Bildschirmsperre.
  startRest: (range) => {
    if (!range || range[0] <= 0) return set({ rest: null })
    const now = Date.now()
    set({ rest: { startedAt: now, endsAt: now + range[0] * 1000, maxEndsAt: now + range[1] * 1000 } })
  },
  clearRest: () => set({ rest: null }),
  setTooSoon: (tooSoon) => set({ tooSoon }),
  setMarkUp: (markUp) => set({ markUp }),
}))
