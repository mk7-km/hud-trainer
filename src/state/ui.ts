import { create } from 'zustand'

export type Tab = 'home' | 'week' | 'status' | 'system' | 'mission'

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
  /** Je verletzter Abstandsregel eine J.A.R.V.I.S.-Zeile und der Regeltext aus dem Plan. */
  conflicts: { line: string; text: string }[]
}

interface UiState {
  tab: Tab
  mission: MissionTarget | null
  rest: RestTimer | null
  /** Warnung vor zu früher Unterkörper-Einheit, wartet auf Bestätigung. */
  tooSoon: TooSoon | null
  /** Gerade erreichte Mark-Stufe (für die Aufstiegsanzeige). */
  markUp: { level: number; name: string; title: string } | null
  /** Vorschau einer Einheit (Vorlagen-ID), über dem aktuellen Tab. */
  preview: string | null
  setPreview(templateId: string | null): void
  setTab(tab: Tab): void
  openMission(target: MissionTarget): void
  closeMission(next?: Tab): void
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
  preview: null,
  setPreview: (preview) => set({ preview }),
  setTab: (tab) => set({ tab, preview: null }),
  // Die Einheit ist ein eigener Tab: andere Tabs bleiben währenddessen erreichbar.
  openMission: (mission) => set({ mission, rest: null, tooSoon: null, preview: null, tab: 'mission' }),
  closeMission: (next: Tab = 'home') => set({ mission: null, rest: null, tab: next }),
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
