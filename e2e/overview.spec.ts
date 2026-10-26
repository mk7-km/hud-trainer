import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { buildSeed } from '../src/dev/seedData'
import { parsePlan } from '../src/domain/plan'

const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/${name}.png` })
const TODAY = '2026-11-11' // Mittwoch, Programmwoche 8 (Block 2)

function seedFile(): string {
  const parsed = parsePlan(JSON.parse(readFileSync(path.join(process.cwd(), 'public/plan.json'), 'utf8')))
  if (!parsed.ok) throw new Error('plan.json ungültig')
  const dir = path.join(process.cwd(), 'test-results')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'seed-backup.json')
  writeFileSync(file, JSON.stringify(buildSeed(parsed.plan, { today: TODAY, weeksBack: 7, opDate: '2027-01-14' })))
  return file
}

async function importSeed(page: Page, file: string) {
  await page.getByLabel('Backup-Datei wählen').setInputFiles(file)
  await page.getByRole('button', { name: 'Daten ersetzen' }).click()
  // Import abwarten, bevor der Test weitergeht (sonst Reload mitten in der Transaktion)
  await page.getByRole('button', { name: 'HOME' }).click()
  await expect(page.getByRole('heading', { name: /Einheiten diese Woche/ })).toBeVisible()
}

// Tagebuch-Modus (Standard): kein Knie-Check, keine Timer, keine Punkte, Einheit als eigener Tab.
test('Tagebuch: Übersichten, Vorschau, freie Übungswahl, Korrektur, Löschen und Wiederherstellen', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  const file = seedFile()
  await page.clock.setFixedTime(new Date(`${TODAY}T18:00:00+01:00`))
  await page.goto('./')
  await importSeed(page, file)

  // HOME: nüchtern, Empfehlung nach recommendedOrder (Unterkörper B, 48 h nach Montag erfüllt)
  await expect(page.getByRole('heading', { name: '2 / 4 Einheiten diese Woche' })).toBeVisible()
  await expect(page.getByText('Nächste Einheit')).toBeVisible()
  await expect(page.getByText('OP in 64 T')).toBeVisible()
  await expect(page.getByText('Unterkörper B · ca. 55 min')).toBeVisible()
  await expect(page.getByText('Mark IV')).toHaveCount(0)
  await shot(page, 'v12-home')

  // Vorschau einer Einheit: Übungen mit letzten Werten, von dort starten
  await page.getByRole('button', { name: 'Rumpf: Vorschau' }).click()
  await expect(page.getByRole('heading', { name: 'Rumpf' })).toBeVisible()
  await expect(page.getByText(/Zuletzt 06\.11\./).first()).toBeVisible()
  await shot(page, 'v12-preview')
  await page.getByRole('button', { name: 'Einheit starten' }).click()

  // Kein Knie-Check, kein Aufwärmen bei Rumpf: direkt die erste Übung, Tab-Leiste bleibt sichtbar
  await expect(page.getByRole('heading', { name: 'Rudern breit, Langhantel' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'EINHEIT' })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveCount(0)

  // Während der Einheit eine andere Einheit nachlesen und zurückkehren
  await page.getByRole('button', { name: 'WOCHE' }).click()
  await page.getByRole('button', { name: 'Unterkörper B: Vorschau' }).click()
  await expect(page.getByText('Zuerst die laufende Einheit „Rumpf“ beenden.')).toBeVisible()
  await page.getByRole('button', { name: 'EINHEIT' }).click()
  await expect(page.getByRole('heading', { name: 'Rudern breit, Langhantel' })).toBeVisible()

  // Freie Übungswahl: zur Bauchübung springen, Namen wählen, Satz speichern
  await page.getByRole('button', { name: 'Zur Übersicht' }).click()
  await page.getByRole('button', { name: /Bauch \(freie Wahl\)/ }).click()
  await expect(page.getByText('Welche Bauchübung, Sir?')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crunch am Kabel' })).toBeVisible()
  await shot(page, 'v11-free-choice')
  await page.getByRole('textbox', { name: 'Übungsname' }).fill('Plank mit Gewicht')
  await page.getByRole('button', { name: 'Übung übernehmen' }).click()
  await expect(page.getByRole('heading', { name: 'Plank mit Gewicht' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Gewicht' }).fill('10')
  await page.getByRole('button', { name: 'Satz speichern' }).click()
  await expect(page.getByText('10,0 kg × 10')).toBeVisible()
  await expect(page.getByRole('timer')).toHaveCount(0)

  // Einheit mit nur einem Satz beenden: zählt als erledigt (Tagebuch)
  await page.getByRole('button', { name: 'Zur Übersicht' }).click()
  await page.getByRole('button', { name: 'Einheit beenden' }).click()
  await expect(page.getByText('Einheit gespeichert')).toBeVisible()
  await expect(page.getByText('Punkte')).toHaveCount(0)
  await shot(page, 'v12-summary')
  await page.getByRole('button', { name: 'Fertig' }).click()
  await expect(page.getByRole('heading', { name: '3 / 4 Einheiten diese Woche' })).toBeVisible()

  // WOCHE
  await page.getByRole('button', { name: 'WOCHE' }).click()
  await expect(page.getByText(/Woche 8 · Block 2/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Rumpf vom 11\.11\. öffnen/ })).toContainText('erledigt')
  await expect(page.getByText('Verlauf')).toBeVisible()
  await shot(page, 'm3-week')

  // STATUS ohne Mark und Punkte; Zuwachs als Konsistenzwert
  await page.getByRole('button', { name: 'STATUS' }).click()
  await expect(page.getByText('Nächste Stufe')).toHaveCount(0)
  await expect(page.getByText('Punkte gesamt')).toHaveCount(0)
  const gainRow = page.locator('div', { hasText: /^Zuwachs rechts gegenüber Baseline/ }).last()
  const gainOf = async () => (await gainRow.innerText()).replace(/\s+/g, ' ')
  const before = await gainOf()
  await shot(page, 'm3-status-top')
  await page.getByRole('heading', { name: 'Körpergewicht' }).scrollIntoViewIfNeeded()
  await shot(page, 'm3-status-weight')
  await page.getByRole('heading', { name: 'Übungsverlauf' }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('combobox')).toContainText('Plank mit Gewicht')
  await shot(page, 'm3-status-exercise')

  // Wägung speichern
  await page.getByRole('textbox', { name: 'Gewicht' }).fill('89,9')
  await page.getByRole('button', { name: 'Wägung speichern' }).click()
  await expect(page.getByText('11.11.2026 · 89,9 kg')).toBeVisible()

  // Abgeschlossene Einheit öffnen und Sätze korrigieren (rechtes Bein drastisch schwächer → Zuwachs ändert sich)
  await page.getByRole('button', { name: 'WOCHE' }).click()
  await page.getByRole('button', { name: /Unterkörper A.*vom 09\.11\. öffnen/ }).click()
  await expect(page.getByText('Einheit korrigieren')).toBeVisible()
  await page.getByRole('button', { name: /Beinpresse einbeinig/ }).click()
  for (const n of [1, 2, 3]) {
    await page.getByRole('button', { name: `Rechts Satz ${n} ändern` }).click()
    await page.getByRole('textbox', { name: 'Gewicht' }).fill('10')
    await page.getByRole('button', { name: 'Änderung speichern' }).click()
    await expect(page.getByRole('button', { name: `Rechts Satz ${n} ändern` })).toContainText('10,0 kg')
  }
  await shot(page, 'm3-review')
  await page.getByRole('button', { name: 'Zur Übersicht' }).click()
  await page.getByRole('button', { name: 'Schließen' }).click()
  await page.getByRole('button', { name: 'STATUS' }).click()
  const after = await gainOf()
  expect(after).not.toBe(before)

  // SYSTEM: Export, alles löschen, wieder einspielen → gleicher Stand
  await page.getByRole('button', { name: 'SYSTEM' }).click()
  await expect(page.getByRole('radio', { name: 'Tagebuch' })).toBeChecked()
  await shot(page, 'm3-system')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Backup erstellen' }).click()])
  const backupPath = await download.path()
  await page.getByRole('button', { name: 'Alle Daten löschen' }).click()
  await page.getByRole('button', { name: 'Ohne Backup fortfahren' }).click()
  await page.getByRole('button', { name: 'Endgültig löschen' }).click()
  await expect(page.getByText('Einrichtung', { exact: true })).toBeVisible()
  await importSeed(page, backupPath)
  await page.getByRole('button', { name: 'STATUS' }).click()
  expect(await gainOf()).toBe(after)

  expect(errors).toEqual([])
})
