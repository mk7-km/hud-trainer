import { expect, test } from '@playwright/test'

test('App startet, lädt den Plan und macht keine fremden Anfragen', async ({ page, baseURL }) => {
  const foreign: string[] = []
  page.on('request', (req) => {
    const url = req.url()
    if (!url.startsWith(baseURL!) && !url.startsWith('data:') && !url.startsWith('blob:')) {
      foreign.push(url)
    }
  })
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'J.A.R.V.I.S. Trainer' })).toBeVisible()
  await expect(page.getByText(/Version \d+\.\d+\.\d+ · \d+ Einheiten/)).toBeVisible()
  await expect(page.getByText('bereit', { exact: true })).toBeVisible({ timeout: 15_000 })

  // Backup: Export als Datei, danach wieder einspielen
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Backup erstellen' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^trainer-backup-\d{4}-\d{2}-\d{2}\.json$/)
  await expect(page.getByText('Backup als Datei heruntergeladen.')).toBeVisible()
  const file = await download.path()
  await page.getByLabel('Backup-Datei wählen').setInputFiles(file)
  await page.getByRole('button', { name: 'Daten ersetzen' }).click()
  await expect(page.getByText('Backup eingespielt.')).toBeVisible()

  await page.screenshot({ path: 'e2e/screenshots/m1-status.png', fullPage: true })
  expect(foreign).toEqual([])
  expect(errors).toEqual([])
})
