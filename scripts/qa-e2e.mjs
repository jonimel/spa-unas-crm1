// Recorrido de QA en el navegador (Playwright), como lo usaría un spa de uñas desde el celular (390 px).
//
//   node scripts/qa-e2e.mjs                      → contra http://localhost:3000, recorrido completo (crea citas y cobros de prueba)
//   BASE=http://localhost:3100 node scripts/qa-e2e.mjs
//   BASE=https://… node scripts/qa-e2e.mjs --readonly   → solo abre páginas (seguro en el sitio en internet)
//
// Necesita Playwright: `npm i -D playwright && npx playwright install chromium` (en Claude Code ya viene instalado).
// Usa los usuarios de prueba (dueño 3000, manicuristas 4000-7000, PIN 1111; o 1111 / 1111 para todas). Sale con código 1 si encuentra problemas.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const BASE = (process.env.BASE || 'http://localhost:3000').replace(/\/+$/, '')
const READONLY = process.argv.includes('--readonly')
const SLUG = process.env.SLUG || 'bella'
const PIN = process.env.PIN || '1111'
const OWNER = process.env.OWNER || '3000'
const BARBERS = (process.env.BARBERS || '4000,5000,6000,7000').split(',')

if (!READONLY && !/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error(`El recorrido completo crea citas y cobros. Contra ${BASE} usa --readonly.`)
  process.exit(2)
}

const problems = []
const ok = []
const check = (cond, what) => (cond ? ok.push(what) : problems.push(what))
const ID = /[0-9a-f]{8}-[0-9a-f-]{27}/g

const browser = await chromium.launch()

async function page(label) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO' })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => problems.push(`[${label}] error de JavaScript: ${e.message} (${p.url()})`))
  p.on('response', (r) => r.status() >= 500 && problems.push(`[${label}] el servidor respondió ${r.status()}: ${r.url()}`))
  return p
}

async function login(p, phone, rol = 'manicurista') {
  await p.goto(BASE + '/entrar/' + rol)
  await p.fill('input[name=phone]', phone)
  await p.fill('input[name=pin]', PIN)
  await Promise.all([p.waitForURL(/\/app/, { timeout: 15000 }), p.click('button[type=submit]')])
}

/** Abre todas las páginas alcanzables (una por tipo) y revisa errores, 404 y scroll horizontal. */
async function crawl(p, label, start) {
  const seen = new Set()
  const kinds = new Set()
  const queue = [...start]
  while (queue.length && seen.size < 60) {
    const u = queue.shift()
    const kind = u.replace(ID, ':id').split('?')[0]
    if (seen.has(u) || (kinds.has(kind) && !start.includes(u))) continue
    seen.add(u)
    kinds.add(kind)
    const r = await p.goto(BASE + u).catch((e) => problems.push(`[${label}] no abre ${u}: ${e.message}`))
    if (r && r.status() >= 400) problems.push(`[${label}] ${r.status()} en ${u}`)
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (overflow > 1) problems.push(`[${label}] se corre de lado ${overflow}px en ${u}`)
    const text = await p.locator('body').innerText()
    if (/undefined|NaN|\[object Object\]|Invalid Date/.test(text)) problems.push(`[${label}] texto roto (undefined/NaN) en ${u}`)
    for (const href of await p.$$eval('a[href^="/"]', (as) => as.map((a) => a.getAttribute('href'))))
      if (!href.startsWith('/api/') && !href.startsWith('/app/salir')) queue.push(href)
  }
  return seen.size
}

// ---------- 1. páginas públicas ----------
const anon = await page('público')
await crawl(anon, 'público', ['/', '/reservar', `/r/${SLUG}`, '/entrar', '/entrar/dueno', '/entrar/manicurista'])
await anon.goto(BASE + '/')
const home = await anon.locator('body').innerText()
if (!/localhost|127\.0\.0\.1/.test(BASE)) check(!/PIN \d{4}/.test(home), 'en internet la página de inicio no muestra los PIN de prueba')
check(/Registrar mi spa/.test(home), 'la página de inicio invita a registrar un spa')
check(/Reservar una cita/.test(home) && /Dueña \/ Administración/.test(home) && /Manicurista/.test(home), 'el inicio separa clientas (Reservar) del equipo (Dueña / Manicurista)')
await anon.goto(BASE + '/entrar')
const entrar = await anon.locator('body').innerText()
check(/Dueña \/ Administración/.test(entrar) && /Manicurista/.test(entrar), 'Entrar pide elegir Dueña / Administración o Manicurista')
for (const u of [`/r/${SLUG}`, '/reservar']) {
  await anon.goto(BASE + u)
  const t = await anon.locator('body').innerText()
  const staffLinks = await anon.locator('a[href^="/entrar"], a[href^="/app"], input[name=pin]').count()
  check(staffLinks === 0 && !/\bPIN\b/.test(t), `la pantalla de clientas ${u} no muestra nada del equipo`)
}
await anon.goto(BASE + '/reservar')
check((await anon.locator(`a[href="/r/${SLUG}"]`).count()) > 0, 'Reservar lista el spa y lleva a su link')
await anon.goto(BASE + '/reservar?q=zzzz-no-existe')
check(/No encontramos/.test(await anon.locator('body').innerText()), 'Reservar avisa cuando no encuentra el spa')
for (const u of ['/app/agenda', '/app/ajustes', '/app/analisis']) {
  await anon.goto(BASE + u)
  check(anon.url().includes('/entrar'), `sin sesión, ${u} manda a Entrar`)
}

// ---------- 1b. entrada común de la demo: 1111 / 1111 ----------
if (!process.env.OWNER) {
  const d = await page('demo 1111')
  await login(d, '1111', 'dueno')
  check(d.url().includes('/app'), '1111 / 1111 por "Dueña" entra a la dueña')
  const b = await page('demo 1111 manicurista')
  await b.goto(BASE + '/entrar/manicurista')
  await b.fill('input[name=phone]', '1111')
  await b.fill('input[name=pin]', '1111')
  await Promise.all([b.waitForURL(/\/entrar\/elegir/, { timeout: 15000 }), b.click('button[type=submit]')])
  const names = await b.locator('form button.role').count()
  check(names === BARBERS.length, `1111 / 1111 por "Manicurista" deja elegir entre las ${BARBERS.length} manicuristas`)
  await Promise.all([b.waitForURL(/\/app/, { timeout: 15000 }), b.locator('form button.role').nth(1).click()])
  await b.goto(BASE + '/app/cuenta')
  check(/Daniela Ospina/.test(await b.locator('body').innerText()), 'al elegir una manicurista entra con esa manicurista')
}

// ---------- 2. dueño y manicuristas: todas las páginas ----------
const owner = await page('dueño')
await login(owner, OWNER, 'dueno')
const n = await crawl(owner, 'dueño', ['/app/agenda', '/app/ajustes', '/app/analisis', '/app/comisiones', '/app/mensajes', '/app/clientes', '/app/nueva', '/app/cuenta'])
check(n > 10, `el dueño abre ${n} páginas`)

const barber = await page('manicurista')
await login(barber, BARBERS[0])
await crawl(barber, 'manicurista', ['/app/agenda', '/app/comisiones', '/app/clientes', '/app/nueva', '/app/cuenta'])
for (const u of ['/app/ajustes', '/app/analisis', '/app/mensajes']) {
  await barber.goto(BASE + u)
  check(!barber.url().endsWith(u), `la manicurista no entra a ${u}`)
}
const bk = await barber.request.get(BASE + '/api/backup', { maxRedirects: 0 })
check(!(bk.headers()['content-type'] || '').includes('gzip'), 'la manicurista no descarga la copia de seguridad')

if (!READONLY) {
  // ---------- 3. la clienta reserva ----------
  const client = await page('cliente')
  await client.goto(`${BASE}/r/${SLUG}`)
  const branchGroup = client.getByRole('group', { name: 'Sede' })
  if (await branchGroup.count()) await branchGroup.getByRole('button').first().click()
  // dos servicios + un adicional: la duración y el precio son la suma
  const svcs = client.getByRole('group', { name: 'Servicios' }).getByRole('button')
  await svcs.nth(0).click()
  await svcs.nth(2).click()
  const extras = client.getByRole('group', { name: 'Adicionales' }).getByRole('button')
  check((await extras.count()) > 0, 'después de elegir un servicio se ofrecen los adicionales')
  if (await extras.count()) await extras.first().click()
  const bar = await client.locator('.total-bar').innerText()
  check(/3 servicios/.test(bar) && /\$/.test(bar), `el total muestra 3 servicios y el precio (${bar.replace(/\s+/g, ' ')})`)
  await client.getByRole('button', { name: 'Continuar' }).click()
  await client.waitForSelector('.tslot', { timeout: 15000 })
  await client.locator('.tslot').first().click()
  await client.getByRole('button', { name: 'Continuar' }).click()
  await client.fill('#tel', '12345')
  await client.locator('#nom').click()
  check(/no válido/i.test(await client.locator('body').innerText()), 'celular mal escrito muestra "no válido"')
  const phone = '31' + String(Date.now()).slice(-8)
  await client.fill('#tel', phone)
  await client.fill('#nom', 'QA Cliente Prueba')
  await client.getByRole('button', { name: 'Solicitar cita' }).click()
  await client.waitForURL(/\/cita\//, { timeout: 15000 })
  const apptId = client.url().split('/').pop()
  check(/Solicitud enviada/i.test(await client.locator('body').innerText()), 'la reserva online queda como solicitud')

  // ---------- 4. solo su manicurista la ve y la confirma ----------
  let mine = null
  for (const ph of BARBERS) {
    const p = await page('manicurista ' + ph)
    await login(p, ph)
    const r = await p.goto(`${BASE}/app/cita/${apptId}`)
    if (r && r.status() === 200 && (await p.getByRole('button', { name: 'Confirmar' }).count())) mine = p
  }
  check(!!mine, 'la manicurista responsable ve "Confirmar"')
  if (mine) {
    await mine.getByRole('button', { name: 'Confirmar' }).click()
    await mine.waitForURL(/ok=/, { timeout: 15000 })
    await client.reload()
    check(/confirmada/i.test(await client.locator('body').innerText()), 'la clienta ve la cita confirmada')
    const ctext = await client.locator('body').innerText()
    check(/Agregar a mi calendario/.test(ctext) && /Escribir al spa por WhatsApp/.test(ctext) && /Cancelar mi cita|Faltan menos de 2 horas/.test(ctext), 'la clienta puede agregar la cita al calendario, escribir al spa o cancelar')
    const ics = await client.request.get(`${BASE}/api/r/${SLUG}/cita/${apptId}/calendario`)
    check(ics.ok() && /text\/calendar/.test(ics.headers()['content-type'] ?? '') && (await ics.text()).includes('BEGIN:VEVENT'), 'el .ics de la cita se descarga')

    // ---------- 5. cobrar: no antes de 3 h; luego doble toque en una clienta de paso ----------
    await mine.goto(`${BASE}/app/cita/${apptId}`)
    const chargeable = (await mine.getByRole('link', { name: /Cobrar visita/ }).count()) > 0
    if (!chargeable) {
      await mine.goto(`${BASE}/app/cobrar/${apptId}`)
      await mine.getByRole('button', { name: /Registrar pago/ }).click()
      await mine.waitForURL(/err=/, { timeout: 15000 })
      check(/3 horas antes/.test(await mine.locator('body').innerText()), 'una cita de más tarde no se deja cobrar antes de tiempo (aviso claro)')
    }
    // clienta de paso "ahora" (el dueño prueba con cada manicurista hasta encontrar una libre)
    let payPage = null
    let lastErr = ''
    const nOpts = await (async () => { await owner.goto(BASE + '/app/nueva'); return owner.locator('#barber option').count() })()
    for (let i = 0; i < nOpts && !payPage; i++) {
      await owner.goto(BASE + '/app/nueva')
      await owner.locator('#barber').selectOption({ index: i })
      await owner.fill('#name', 'QA Clienta de Paso')
      await owner.getByRole('button', { name: /Registrar y cobrar/ }).click()
      await owner.waitForURL(/cobrar|err=/, { timeout: 15000 }).catch(() => {})
      if (/\/app\/cobrar\//.test(owner.url())) payPage = owner
      else lastErr = decodeURIComponent(owner.url().split('err=')[1] ?? owner.url())
    }
    if (!payPage) {
      // todas ocupadas ahora: se cobra una cita de hoy que ya está en su hora (o por empezar)
      await owner.goto(BASE + '/app/agenda')
      const ids = await owner.locator('a.ap.is-confirmed, a.ap.is-pending').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
      for (const href of ids) {
        await owner.goto(BASE + href)
        if (await owner.getByRole('link', { name: /Cobrar visita/ }).count()) {
          await owner.goto(BASE + href.replace('/app/cita/', '/app/cobrar/'))
          payPage = owner
          break
        }
      }
    }
    check(!!payPage, `hay una visita lista para cobrar (clienta de paso o cita en su hora)${payPage ? '' : ` (${lastErr})`}`)
    if (payPage) {
      const pay = payPage.getByRole('button', { name: /Registrar pago/ })
      // el segundo toque puede llegar cuando la página ya se fue (la página sale apenas se registra el pago)
      await Promise.all([pay.click({ timeout: 10000 }).catch(() => {}), pay.click({ force: true, noWaitAfter: true }).catch(() => {})])
      await payPage.waitForURL(/agenda|cobrar/, { timeout: 15000 })
      await payPage.waitForTimeout(1500)
      check(/\/app\/agenda/.test(payPage.url()) && !/err=/.test(payPage.url()), 'doble toque en "Registrar pago" termina bien, sin error')
    }
  }

  // ---------- 6. WhatsApp (simulado) ----------
  await owner.goto(BASE + '/app/mensajes')
  const msgs = await owner.locator('body').innerText()
  check(msgs.includes('QA Cliente Prueba'), 'los mensajes de WhatsApp de la reserva aparecen en Mensajes')
  check(!/m\.\./.test(msgs), 'mensajes sin punto doble ("p. m..")')

  // ---------- 7. un spa nuevo se registra ----------
  const fresh = await page('registro')
  const stamp = String(Date.now()).slice(-6)
  await fresh.goto(BASE + '/registro')
  await fresh.fill('#shop', `QA Spa ${stamp}`)
  await fresh.fill('#city', 'Cali')
  await fresh.fill('#owner', 'Dueña QA')
  await fresh.fill('#phone', '32' + String(Date.now()).slice(-8))
  await fresh.fill('#pin', '2468')
  await fresh.fill('#pin2', '1357')
  await fresh.locator('form button[type=submit]').click()
  await fresh.waitForURL(/err=/, { timeout: 15000 })
  check((await fresh.inputValue('#shop')) === `QA Spa ${stamp}`, 'registro con PIN distintos avisa y no borra lo escrito')
  await fresh.fill('#pin', '2468')
  await fresh.fill('#pin2', '2468')
  await fresh.locator('form button[type=submit]').click()
  await fresh.waitForURL(/\/app\/ajustes/, { timeout: 15000 })
  check(/Tu spa está creado/.test(await fresh.locator('body').innerText()), 'el spa nuevo queda creado y el dueño adentro')
  await crawl(fresh, 'spa nuevo', ['/app/agenda', '/app/ajustes', '/app/analisis', '/app/comisiones', '/app/clientes', '/app/nueva'])
  await fresh.goto(BASE + '/app/ajustes')
  const link = (await fresh.locator('body').innerText()).match(/\/r\/(qa-spa-[a-z0-9-]+)/)?.[1]
  check(!!link, 'el spa nuevo tiene su link de reservas')
  if (link) {
    await fresh.goto(`${BASE}/r/${link}`)
    const txt = (await fresh.locator('body').innerText()).toLowerCase()
    check(txt.includes(`qa spa ${stamp}`) && !txt.includes('spa uñas bella'), 'la reserva muestra el nombre del spa nuevo, no Spa Uñas Bella')
    check(txt.includes('preparando nuestra agenda'), 'un spa sin manicuristas no deja a la clienta atascada (aviso + WhatsApp)')
  }
  await fresh.goto(BASE + '/app/clientes')
  check(!(await fresh.locator('body').innerText()).includes('Valentina Pérez'), 'el spa nuevo no ve clientas de Spa Uñas Bella')
  const dl = await fresh.request.get(BASE + '/api/backup')
  const body = await dl.text()
  check(dl.headers()['content-type']?.includes('json') && !body.includes('Spa Uñas Bella'), 'la copia del spa nuevo trae solo sus datos')

  // ---------- 8. PIN equivocado ----------
  await anon.goto(BASE + '/entrar/dueno')
  await anon.fill('input[name=phone]', OWNER)
  await anon.fill('input[name=pin]', '0000')
  await anon.click('button[type=submit]')
  await anon.waitForLoadState()
  check(anon.url().includes('/entrar'), 'PIN equivocado no deja entrar')
}

await browser.close()
console.log(`\n✓ ${ok.length} comprobaciones bien`)
for (const o of ok) console.log('  ✓ ' + o)
if (problems.length) {
  console.log(`\n✗ ${problems.length} problemas`)
  for (const p of [...new Set(problems)]) console.log('  ✗ ' + p)
  process.exit(1)
}
console.log('\nSin problemas.')
