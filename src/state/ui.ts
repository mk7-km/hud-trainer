import { create } from 'zustand'

export type Tab = 'home' | 'system'

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

interface UiState {
  tab: Tab
  mission: MissionTarget | null
  rest: RestTimer | null
  setTab(tab: Tab): void
  openMission(target: MissionTarget): void
  closeMission(): void
  startRest(range: [number, number] | null): void
  clearRest(): void
}

export const useUi = create<UiState>((set) => ({
  tab: 'home',
  mission: null,
  rest: null,
  setTab: (tab) => set({ tab }),
  openMission: (mission) => set({ mission, rest: null }),
  closeMission: () => set({ mission: null, rest: null }),
  // Zeitstempel statt Zähler: übersteht Hintergrund und Bildschirmsperre.
  startRest: (range) => {
    if (!range || range[0] <= 0) return set({ rest: null })
    const now = Date.now()
    set({ rest: { startedAt: now, endsAt: now + range[0] * 1000, maxEndsAt: now + range[1] * 1000 } })
  },
  clearRest: () => set({ rest: null }),
}))
