# Entscheidungen

## Technik

- **CSP nur im Build.** Die Policy wird per Vite-Plugin beim Build als Meta-Tag injiziert. Der Dev-Server braucht Inline-Skripte (React Fast Refresh) und bliebe sonst leer.
- **`style-src 'self' 'unsafe-inline'`.** React setzt dynamische Werte (Balkenbreiten, SVG-Transformationen) als `style`-Attribut. Skripte bleiben strikt `self`. Kein Fremdhost erlaubt.
- **`base: './'`** statt festem `/<repo>/`. Funktioniert unabhängig vom Repo-Namen, Manifest (`start_url`, `scope`) ist ebenfalls relativ.
- **`plan.json` nicht im Precache**, sondern Workbox `NetworkFirst` (Timeout 4 s, dann Cache). Zusätzlich hält die App ab M1 die letzte *gültige* Version in IndexedDB, damit ein kaputter Plan den Cache nicht vergiften kann.
- **Service Worker `registerType: 'prompt'`**, Registrierung über das gebündelte `virtual:pwa-register/react` (kein Inline-Skript, CSP-konform).
- **Fonts:** nur das `latin`-Subset von Rajdhani 600/700 und Barlow 400/500 (enthält ä ö ü ß und „“).
- **Icons** werden mit `sharp` aus `public/favicon.svg` erzeugt und eingecheckt; der Build braucht `sharp` nicht.
- **Testdateien** (`*.test.ts`) laufen über `tsconfig.node.json` (Node-Typen), App-Code bleibt frei von Node-Typen.
- **`PROMPT.md` und `.claude/` sind in `.gitignore`**, weil der Auftragstext persönliche Angaben enthält und das Repo öffentlich ist. Commits laufen mit der GitHub-noreply-Adresse.
- **`user-scalable=no`** im Viewport plus `touch-action: manipulation`: iOS ignoriert Ersteres teilweise, zusammen verhindern sie Doppeltipp-Zoom.

## Auslegung des Datenmodells (plan.json)

Wo der Plan Spielraum lässt, gilt bis zu einer Klärung mit der Physiotherapeutin die jeweils vorsichtigere Lesart.

1. **`kneeCheck.derive` ist Prosa, kein Ausdruck.** Die Ableitung wird als feste Regel im Code umgesetzt (Fragen-IDs `swelling`, `pain`, `stiffness`, `givingWay48h`, `locking`); die Schwellen (5, 3–4) stehen nur im Text. Das ist die eine Stelle, an der Schwellenwerte nicht aus einem Datenfeld lesbar sind. Das zod-Schema prüft, dass die erwarteten Fragen-IDs existieren; fehlen sie, gilt der Plan als ungültig.
2. **Übungen ohne `yellow`/`red`** (alle mit `kneeLoad: "none"`) gelten als `keep`.
3. **Rot + Oberkörper:** `red: "skip"` entfernt dort `knee_iso_legext` und `calf_raise_stepper`. Rot + Bonuseinheit: Ausdauer entfällt, nur der Mobility-Block (`category: "mobility"`) bleibt und bringt `redReplacementMobility` Punkte statt `bonusSession`.
4. **Kalibrierung und `setsBySide`:** `maxSets` deckelt jede Seite einzeln (R 4 → 2, L 2 → 2). Deload/Taper: Faktor je Seite, aufgerundet (R 4 → 2, L 2 → 1).
5. **Taper + Deload gleichzeitig:** Faktoren werden nicht multipliziert, es gilt der Taper.
6. **Checklisten und Ausdauer zählen als je ein „Satz“** für die 80-%-Schwelle (Checkliste erfüllt, wenn alle Punkte abgehakt sind). Das Aufwärmen zählt nicht.
7. **Doppelte Progression bei `weight_time`:** „obere Wiederholungszahl“ wird als oberer Sekundenwert gelesen. „Bei Ziel-RIR“: Ist ein RIR geloggt, muss er ≥ unterem Ziel-RIR sein; ohne geloggten RIR gilt die Bedingung als erfüllt. Bei `lastSetToFailureAllowed` wird der RIR des letzten Satzes nicht geprüft.
8. **`technique`: „höchstens +5 kg pro Woche“** = Summe der Steigerungen innerhalb einer Programmwoche je Übung/Variante.
9. **Varianten ohne Vorgeschichte** (Blockwechsel): keine Lastempfehlung, Hinweis „Last finden“, wie in der Kalibrierung.
10. **`bridge` Block 1** ist über die Variante `unilateral: true`, in Block 2/3 nicht. Historie läuft ohnehin getrennt pro `variantId`.
11. **e1RM:** nur `weight_reps`-Sätze mit `reps <= 15`, Gewicht > 0, nicht `schonmodus`.
12. **Baseline:** bestes e1RM je Seite aus Programmwoche 1–2; `baselineCaptured` ist erfüllt, wenn für alle Symmetrie-Übungen beide Seiten einen Wert haben. `rightGain` nutzt das „aktuelle beste e1RM“ im selben 14-Tage-Fenster wie die Symmetrie.
13. **Gruppenwerte „Strecker“/„Beuger“** = Mittelwert der Übungswerte der Gruppe; der Gesamtindex ist der Mittelwert über Übungen (nicht über Gruppen), wie in `symmetry.index` beschrieben.
14. **`newRightLegRecord`:** höchstens einmal je Übung und Einheit, nur Symmetrie-Übungen, nur reguläre Sätze, erst nachdem eine Baseline existiert (sonst wäre jeder erste Satz ein Rekord).
15. **`calmDaysMin`:** zusammenhängende ruhige Tage bis heute, gezählt frühestens ab Programmstart.
16. **Serien:** Die laufende Woche bricht eine Serie erst nach Sonntag 23:59. Wochen im Reparaturmodus und die OP-Woche zählen weder positiv noch negativ.
17. **`givingWay`-Text „48 Stunden kein Beintraining“** wird nicht als zusätzliche Sperre umgesetzt: Die Frage `givingWay48h` führt ohnehin zu Rot.
