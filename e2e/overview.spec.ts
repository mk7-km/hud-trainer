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
}

test('Übersichten mit Beispieldaten, Korrektur, Löschen und Wiederherstellen', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  const file = seedFile()
  await page.clock.setFixedTime(new Date(`${TODAY}T18:00:00+01:00`))
  await page.goto('./')
  await importSeed(page, file)

  // HOME
  await expect(page.getByText('Nächste Mission')).toBeVisible()
  await expect(page.getByText('OP in 64 T')).toBeVisible()
  await shot(page, 'm3-home')

  // WOCHE
  await page.getByRole('button', { name: 'WOCHE' }).click()
  await expect(page.getByText(/Woche 8 · Block 2/)).toBeVisible()
  await expect(page.getByText('Verlauf')).toBeVisible()
  await shot(page, 'm3-week')

  // STATUS
  await page.getByRole('button', { name: 'STATUS' }).click()
  await expect(page.getByText('Nächste Stufe')).toBeVisible()
  const pointsRow = page.locator('div', { hasText: /^Punkte gesamt/ }).last()
  const pointsOf = async () => (await pointsRow.innerText()).replace(/\D/g, '')
  const before = await pointsOf()
  await shot(page, 'm3-status-top')
  await page.getByRole('heading', { name: 'Knie-Protokoll' }).scrollIntoViewIfNeeded()
  await shot(page, 'm3-status-knee')
  await page.getByRole('heading', { name: 'Körpergewicht' }).scrollIntoViewIfNeeded()
  await shot(page, 'm3-status-weight')
  await page.getByRole('heading', { name: 'Übungsverlauf' }).scrollIntoViewIfNeeded()
  await shot(page, 'm3-status-exercise')

  // Wägung speichern
  await page.getByRole('textbox', { name: 'Gewicht' }).fill('89,9')
  await page.getByRole('button', { name: 'Wägung speichern' }).click()
  await expect(page.getByText('11.11.2026 · 89,9 kg')).toBeVisible()

  // Abgeschlossene Einheit öffnen und einen Satz korrigieren (rechtes Bein drastisch schwächer → Bestwert-Bonus entfällt)
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
  const after = await pointsOf()
  expect(Number(after)).toBe(Number(before) - 25) // Bestwert-Bonus rechts entfällt

  // SYSTEM: Export, alles löschen, wieder einspielen → gleicher Punktestand
  await page.getByRole('button', { name: 'SYSTEM' }).click()
  await shot(page, 'm3-system')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Backup erstellen' }).click()])
  const backupPath = await download.path()
  await page.getByRole('button', { name: 'Alle Daten löschen' }).click()
  await page.getByRole('button', { name: 'Ohne Backup fortfahren' }).click()
  await page.getByRole('button', { name: 'Endgültig löschen' }).click()
  await expect(page.getByText('Einrichtung', { exact: true })).toBeVisible()
  await importSeed(page, backupPath)
  await page.getByRole('button', { name: 'STATUS' }).click()
  expect(await pointsOf()).toBe(after)

  expect(errors).toEqual([])
})
