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

  await page.screenshot({ path: 'e2e/screenshots/m0-status.png' })
  expect(foreign).toEqual([])
  expect(errors).toEqual([])
})
