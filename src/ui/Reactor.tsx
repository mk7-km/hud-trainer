import type { CSSProperties } from 'react'
import styles from './Reactor.module.css'

const C = 150

function polar(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)]
}

function arc(r: number, from: number, to: number): string {
  const [x0, y0] = polar(r, from)
  const [x1, y1] = polar(r, to)
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

function segments(count: number, gapDeg: number): [number, number][] {
  const span = 360 / count
  return Array.from({ length: count }, (_, i) => [i * span + gapDeg / 2, (i + 1) * span - gapDeg / 2] as [number, number])
}

const TICKS = Array.from({ length: 72 }, (_, i) => i * 5)

/** Arc Reactor = Wochenenergie: innen die Pflichteinheiten, außen die Bonuseinheiten. */
export function Reactor({
  pflichtDone,
  pflichtTarget,
  bonusDone,
  bonusTarget,
  pct,
  paused = false,
  draw = false,
}: {
  pflichtDone: number
  pflichtTarget: number
  bonusDone: number
  bonusTarget: number
  pct: number
  /** Reparaturmodus: Reaktor ruht. */
  paused?: boolean
  /** Einmaliges Aufzeichnen nach der Boot-Sequenz. */
  draw?: boolean
}) {
  const full = pflichtDone >= pflichtTarget
  return (
    <div className={styles.wrap} data-paused={paused} data-full={full} data-draw={draw}>
      <svg
        viewBox="0 0 300 300"
        className={styles.svg}
        role="img"
        aria-label={`Wochenenergie: ${pflichtDone} von ${pflichtTarget} Pflichteinheiten, ${bonusDone} von ${bonusTarget} Bonuseinheiten`}
      >
        <g className={styles.spinSlow}>
          <circle cx={C} cy={C} r={146} className={styles.hair} />
          {TICKS.map((deg) => {
            const long = deg % 30 === 0
            const [x0, y0] = polar(146, deg)
            const [x1, y1] = polar(long ? 136 : 141, deg)
            return <line key={deg} x1={x0} y1={y0} x2={x1} y2={y1} className={long ? styles.tickLong : styles.tick} />
          })}
        </g>

        {segments(bonusTarget, 14).map(([a, b], i) => (
          <path key={`b${i}`} d={arc(126, a, b)} className={styles.bonus} data-on={i < bonusDone} style={{ '--i': pflichtTarget + i } as CSSProperties} />
        ))}

        <circle cx={C} cy={C} r={114} className={styles.hair} />
        {segments(pflichtTarget, 8).map(([a, b], i) => (
          <path key={`p${i}`} d={arc(101, a, b)} className={styles.pflicht} data-on={i < pflichtDone} style={{ '--i': i } as CSSProperties} />
        ))}
        <circle cx={C} cy={C} r={88} className={styles.hair} />

        <g className={styles.spinReverse}>
          <circle cx={C} cy={C} r={80} className={styles.dashed} />
          {[0, 120, 240].map((deg) => {
            const [x, y] = polar(80, deg)
            return <circle key={deg} cx={x} cy={y} r={2.5} className={styles.node} />
          })}
        </g>

        <circle cx={C} cy={C} r={66} className={styles.core} />
        <circle cx={C} cy={C} r={66} className={styles.coreRing} />
        <text x={C} y={C - 2} className={`${styles.count} num`} textAnchor="middle">
          {pflichtDone} / {pflichtTarget}
        </text>
        <text x={C} y={C + 28} className={`${styles.pct} num`} textAnchor="middle">
          {paused ? 'pausiert' : `${pct} %`}
        </text>
      </svg>
    </div>
  )
}
