# HUD Trainer

Persönliche Trainings-PWA (iPhone, Safari, Home-Bildschirm) für genau einen Nutzer. Führt durch einen festen Trainingsplan, protokolliert Sätze, steuert die Belastung nach festen Regeln (Knie-Ampel, Progression, Deload, Taper) und motiviert über Punkte, Wochenreaktor und Mark-Stufen. Optik: eigenständiges HUD in Cyan/Blau. Sprache der App: Deutsch.

Der Nutzer ist kein Entwickler. Nie darum bitten, Code zu bearbeiten. Schritte mit Login Klick für Klick auf Deutsch erklären.

## Harte Rahmenbedingungen

1. **Kein Backend, kein Konto, kein Tracking.** Nutzerdaten nur lokal (IndexedDB). Zur Laufzeit keine Anfragen an fremde Hosts; Fonts, Icons, Sounds liegen im Projekt. Strikte CSP (nur `self`, wird beim Build injiziert, siehe `vite.config.ts`).
2. **Offline-fähig** nach dem ersten Laden.
3. **Hosting:** GitHub Pages aus öffentlichem Repo, Deployment per GitHub Actions. Deshalb: kein Klarname, keine Krankengeschichte, keine persönlichen Daten in Code, Commits, README. Commits nur mit der GitHub-noreply-Adresse. `PROMPT.md` ist absichtlich in `.gitignore`. `noindex,nofollow` bleibt gesetzt.
4. **Keine Marvel-Assets.** Alle Grafiken sind selbst gezeichnetes SVG, Töne synthetisch (Web Audio).
5. **Trainingsinhalte sind Daten, nicht Code.** Planwechsel nur über `public/plan.json`. Keine Übungs-IDs, Satzzahlen oder Schwellenwerte im Code. `plan.json` und `src/content/jarvis.de.json` inhaltlich nicht verändern.
6. **Abgeleitete Werte werden berechnet, nicht gespeichert** (Punkte, Reaktor, Symmetrie, Mark-Fortschritt = reine Funktionen über Logs + Plan). Einzige Ausnahme: höchste erreichte Mark-Stufe mit Datum.

## Architektur

- `public/plan.json` – Trainingsplan, zur Laufzeit network-first geladen (Workbox `NetworkFirst`), mit zod validiert.
- `src/content/jarvis.de.json` – alle J.A.R.V.I.S.-Texte; J.A.R.V.I.S. spricht nur mit diesen Zeilen.
- `src/domain/` – UI-freie Fachlogik (Kalender, Wochentyp, Ampel, Satzregeln, Progression, e1RM/Symmetrie, Punkte, Serien, Marks, Körpergewicht). Reine Funktionen, vollständig mit Vitest getestet.
- `src/db/` – Dexie-Schema, Backup-Export/Import mit Migrationen.
- `src/platform/` – Browser-APIs (Standalone, Wake Lock, Audio, Stimme, Share).
- `src/ui/`, `src/screens/` – React-Komponenten, CSS-Module, Tokens in `src/styles/global.css`.
- Service Worker über `vite-plugin-pwa` (`registerType: 'prompt'`, Update per Tipp).
- Vite `base: './'` und relatives Manifest, weil Pages unter `/<repo>/` ausliefert.

## Befehle

Unter Windows ist nach frischer Installation evtl. `C:\Program Files\nodejs` noch nicht im PATH der Sitzung.

- `npm run dev` – Entwicklungsserver
- `npm test` – Unit-Tests (Vitest)
- `npm run lint` – ESLint
- `npm run build` – Typprüfung + Produktionsbuild (muss ohne Warnungen laufen)
- `npm run e2e` – Playwright-Smoke-Test und Screenshots bei 390 × 844 (vorher `npm run build`)
- `npm run icons` – PNG-Icons aus `public/favicon.svg` erzeugen
- Deploy: `git push` auf `main`, der Workflow `.github/workflows/deploy.yml` baut, testet und veröffentlicht.

## Planänderungen

> Neuer Plan: `public/plan.json` durch die gelieferte Datei ersetzen, Schema-Validierung und Tests laufen lassen, committen, pushen. Das Deployment läuft automatisch. Am iPhone App öffnen, Hinweis „Neuer Trainingsplan geladen“ abwarten.

## Pflege

Entscheidungen und Abweichungen vom Auftrag in `DECISIONS.md` festhalten. Vor jedem Meilenstein: Tests, Build, Screenshots selbst ansehen.
