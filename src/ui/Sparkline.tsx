import styles from './Sparkline.module.css'

export interface Series {
  points: { x: number; y: number }[]
  tone?: 'primary' | 'muted' | 'ice'
  dots?: boolean
}

/** Schlichte Verlaufslinie als SVG. x/y in Datenwerten, Skalierung automatisch. */
export function Sparkline({
  series,
  height = 96,
  yMin,
  yMax,
  guides = [],
  label,
}: {
  series: Series[]
  height?: number
  yMin?: number
  yMax?: number
  guides?: number[]
  label: string
}) {
  const all = series.flatMap((s) => s.points)
  if (all.length === 0) return null
  const W = 320
  const pad = 6
  const xs = all.map((p) => p.x)
  const ys = [...all.map((p) => p.y), ...guides]
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const lo = yMin ?? Math.min(...ys)
  const hi = yMax ?? Math.max(...ys)
  const spanX = x1 - x0 || 1
  const spanY = hi - lo || 1
  const px = (x: number) => pad + ((x - x0) / spanX) * (W - 2 * pad)
  const py = (y: number) => height - pad - ((y - lo) / spanY) * (height - 2 * pad)

  return (
    <svg className={styles.chart} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label} preserveAspectRatio="none">
      {guides.map((g) => (
        <line key={g} className={styles.guide} x1={pad} x2={W - pad} y1={py(g)} y2={py(g)} />
      ))}
      {series.map((s, i) => (
        <g key={i} data-tone={s.tone ?? 'primary'}>
          {s.points.length > 1 && (
            <polyline className={styles.line} points={s.points.map((p) => `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ')} />
          )}
          {(s.dots || s.points.length === 1) &&
            s.points.map((p, j) => <circle key={j} className={styles.dot} cx={px(p.x)} cy={py(p.y)} r={2.5} />)}
        </g>
      ))}
    </svg>
  )
}
