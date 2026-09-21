// Kurze synthetische Signale über Web Audio. Keine Audiodateien.
// Der AudioContext entsteht erst nach einer Nutzergeste (iOS verlangt das).

type Cue = 'setSaved' | 'restEnd' | 'missionDone' | 'markUp'

/** Tonfolgen: [Frequenz Hz, Startversatz s, Dauer s] */
const CUES: Record<Cue, [number, number, number][]> = {
  setSaved: [[880, 0, 0.07]],
  restEnd: [
    [660, 0, 0.12],
    [990, 0.16, 0.18],
  ],
  missionDone: [
    [523, 0, 0.14],
    [659, 0.15, 0.14],
    [784, 0.3, 0.3],
  ],
  markUp: [
    [392, 0, 0.18],
    [523, 0.18, 0.18],
    [659, 0.36, 0.18],
    [1047, 0.54, 0.5],
  ],
}

let ctx: AudioContext | null = null
let enabled = true

export function setSoundEnabled(on: boolean) {
  enabled = on
}

/** Bei der ersten Nutzergeste aufrufen. Mehrfachaufrufe sind harmlos. */
export function unlockAudio() {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    ctx = null
  }
}

export function playCue(cue: Cue) {
  if (!enabled || !ctx) return
  try {
    if (ctx.state === 'suspended') void ctx.resume()
    const t0 = ctx.currentTime + 0.01
    for (const [freq, offset, duration] of CUES[cue]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = t0 + offset
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.02)
    }
  } catch {
    // Ton ist Beiwerk: Fehler still ignorieren
  }
}
