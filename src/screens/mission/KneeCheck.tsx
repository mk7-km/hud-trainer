import { useState } from 'react'
import { isKneeCheckComplete, type KneeAnswers } from '../../domain/knee'
import type { Plan } from '../../domain/plan'
import { Button, JarvisLine, Seg } from '../../ui/controls'
import s from '../screen.module.css'
import m from './mission.module.css'

export function KneeCheck({
  plan,
  sessionName,
  line,
  onSubmit,
  onCancel,
}: {
  plan: Plan
  sessionName: string
  line: string | null
  onSubmit: (answers: KneeAnswers) => void
  onCancel: () => void
}) {
  const [answers, setAnswers] = useState<KneeAnswers>({})
  const answer = (id: string, value: string | number) => setAnswers((a) => ({ ...a, [id]: value }))

  return (
    <main className={s.scrollFull}>
      <div className={s.rowBetween}>
        <div>
          <p className={s.kicker}>Knie-Check</p>
          <h1 className={s.h1}>{sessionName}</h1>
        </div>
        <Button variant="quiet" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>

      <JarvisLine text={line} />

      {plan.kneeCheck.questions.map((q) => (
        <div key={q.id} className={s.stack}>
          <p className={s.text}>{q.text}</p>
          {q.type === 'scale' ? (
            <div className={m.scale} role="radiogroup" aria-label={q.text}>
              {Array.from({ length: (q.max ?? 10) - (q.min ?? 0) + 1 }, (_, i) => (q.min ?? 0) + i).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={answers[q.id] === n}
                  aria-label={`Schmerz ${n}`}
                  className={`${m.scaleBtn} num`}
                  onClick={() => answer(q.id, n)}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : (
            <Seg
              label={q.text}
              value={(answers[q.id] as string | undefined) ?? null}
              onChange={(v) => answer(q.id, v)}
              options={(q.options ?? []).map((o) => ({ value: o, label: o }))}
            />
          )}
        </div>
      ))}

      <Button variant="primary" block disabled={!isKneeCheckComplete(plan, answers)} onClick={() => onSubmit(answers)}>
        Knie-Check abschließen
      </Button>
    </main>
  )
}
