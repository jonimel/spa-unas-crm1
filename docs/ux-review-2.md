# UX review 2: Spa Uñas CRM (branch spa/fase-1)

Walked every flow at 390px on a fresh database (`SPA_DATA_DIR=/tmp/pm2-data/pg`, port 3300) as:
- **client**: /r/bella booking end to end, confirmation page, confirmed page, returning visit;
- **manicurista**: agenda, confirm, cobrar, Mis pagos, client file, Nueva, Cuenta;
- **owner**: agenda, Nueva, Clientas, Análisis, Pagos, Ajustes, signup of a new spa and its empty screens.

Default answers used for the open questions: refill reminder at 15 / 21 days, commission applies to add-ons, all staff see allergies.

**Overall:** the app is already solid and feels like a nail spa.
- Feminine "clientas" is used almost everywhere.
- Services are grouped by Manos / Pies / Extensiones.
- "Cualquiera · El primero libre" is offered on step 2.
- The total is clear ("$130.000 · pagas en el spa").
- The allergy warnings are strong.

The gaps are mostly at the **edges**:
- what happens after the client books (change or cancel, WhatsApp contact, calendar);
- small grammar slips;
- masculine "dueño";
- the owner's Nueva form;
- empty states for a brand-new spa.

Owner: **dev** = markup or logic, **design** = CSS only.

---

## P1: must do (high impact, each about 1 h or less)

| # | Screen | Problem | Proposal | Owner |
|---|---|---|---|---|
| 1 | Client confirmation `/r/[slug]/cita/[id]` | "¿Necesitas cambiarla? Escríbenos por WhatsApp." is plain text, not a link. The client has no way to reach the spa or cancel. | Make it a button **"Escribir al spa por WhatsApp"** that opens `https://wa.me/57<owner phone>?text=Hola, quiero cambiar mi cita del <día hora> (<servicios>)`. Use the owner's phone, or the branch phone if one is added later. | dev |
| 2 | Client confirmation | No easy way to remember the visit. | Add **"Agregar a mi calendario"**: an `.ics` download via a small route (title = spa + services, location = branch address, duration = total). | dev |
| 3 | Client confirmation (production) | The "Lo que te llega por WhatsApp" card repeats the messages the client already got on WhatsApp. It is useful in the demo, noise in real use. | Show the card only when WhatsApp runs in simulated mode (`!process.env.WHATSAPP_TOKEN`). | dev |
| 4 | Booking step 2 (¿Con quién?) | The chips say **"0 libres"** and **"1 libres"**. That is wrong grammar, and a 0 chip invites a dead tap. | "1 hora libre" / "N horas libres". At 0, show "Sin horas este día" and dim the chip (keep it tappable for other days). `BookingFlow.tsx:402` | dev |
| 5 | Refill WhatsApp template | The text produces "desde tu **uñas acrílicas**" and "Es hora de tu retoque… desde tu **retoque de acrílico**". | "Hola {nombre} 💅 Ya van {dias} días desde tu última cita ({servicio}) en {spa}. ¿Agendamos tu retoque? {link}". Template `retoque` in `src/lib/whatsapp.ts`. | dev |
| 6 | Masculine "dueño" everywhere | Most nail-spa owners are women. "Dueño / Administrador", "Tú, el dueño", "Entrar como dueño", "Lo define el dueño", "pídele al dueño", the Mensajes label "Dueño", "Para el dueño". | Use **"Dueña / Administración"** on the role button, "Tus datos" in signup, "Entrar como dueña o administradora", "Lo define el spa", "pídele a la administración del spa". Files: `entrar/roles.ts`, `entrar/[rol]/page.tsx`, `entrar/elegir/page.tsx`, `registro/page.tsx`, `comisiones/page.tsx:146`, `mensajes/page.tsx:9`, `cita/[id]/page.tsx:194`, `cuenta/page.tsx:18`. | dev |
| 7 | Nueva (owner / manicurista) | About 15 service cards come first, and the client's phone and name sit at the very bottom. With "Ahora (de paso)" selected, Día and Hora are still shown, which needs a hint to explain. There is no running total. The button just says "Guardar". | (a) Hide Día/Hora unless "Otro día / hora" is selected (CSS `:has()` or a tiny client toggle). (b) Move **Clienta** (celular, nombre) to the top, right after ¿Cuándo?. (c) Make the sticky button read **"Agendar · 2 h 15 min · $103.000"**, live from the checked boxes (small client component, same math as BookingFlow's total bar). | dev |
| 8 | Booking page of a spa with no manicuristas yet (new signup) | The client can pick services and then gets stuck on step 2 with no hours. | If the tenant has no active manicurista with hours, show a friendly block on `/r/[slug]`: "Estamos preparando nuestra agenda online. Escríbenos por WhatsApp para reservar" (link as in #1). | dev |
| 9 | Pagos and Análisis on a new spa | The "MANICURISTAS" heading has nothing under it. | Empty state: "Todavía no tienes manicuristas. **Agregar manicurista →**" (link to Ajustes). The Agenda's "No hay citas este día" can add: "Comparte tu link de reservas →". | dev |
| 10 | Ajustes, link de reservas | The link is shown as plain text. The hint says "compártelo en Instagram y WhatsApp" but there is no button. | Two buttons under the link: **"Copiar link"** (`navigator.clipboard`) and **"Compartir por WhatsApp"** (`wa.me/?text=Reserva tu cita en <spa>: <link>`). | dev + design (button row) |

Estimated total for P1: about 6–8 h of developer time, split across 1 h items.

---

## P2: should do next

| # | Screen | Problem | Proposal | Owner |
|---|---|---|---|---|
| 11 | Booking, returning client | On the same phone, step 1 looks identical for a returning client. The greeting "¡Hola de nuevo!" only appears on step 3. | On step 1, if `localStorage` knows her: "¡Hola de nuevo, Sofía! **Repetir: Manicure semipermanente con Camila →**", which preselects the last services and manicurista. | dev |
| 12 | Booking step 1 | 10 services make a long scroll. A client looking for "pies" has to scroll past the extensions. | Sticky category chips at the top (Manos · Pies · Extensiones) that jump to each group. | dev + design |
| 13 | Booking step 3 / confirmation | No preparation tips, which matter for nails. | A short line under the summary when relevant: with a Retiro add-on, "Llega con tus uñas actuales, nosotras las retiramos". For acrylic or polygel, "Si traes acrílico de otro spa, agrega *Retiro*". Driven by a per-service `tip` field later, hard-coded by service kind for now. | dev |
| 14 | Nail art / Reparación "por uña" | The client sees "+$5.000"; the real price depends on how many nails. | Add-on text "desde $5.000 por uña", and in the booking total show "desde $X". Quantity can be adjusted at cobro (already possible). | dev |
| 15 | Appointment detail (manicurista) | "Escribir por WhatsApp" exists only in the client file, but the manicurista is usually looking at the appointment. | Add the same WhatsApp button next to the client's phone on `/app/cita/[id]`. | dev |
| 16 | Owner agenda | With 19 appointments, "Citas del día" is a long list sorted only by time, with the manicurista's name at the end of the line. | Default to grouping by manicurista when "Todos" is selected (a header with avatar and count per manicurista), or put the manicurista's initials chip at the left of each row. | dev + design |
| 17 | Client cancels herself | Only staff can cancel. Clients write in or simply don't show up. | Add "Cancelar mi cita" on the client's page, allowed up to X hours before (the link is already private via UUID). Notify the manicurista and the owner. | dev |
| 18 | Signup form | The "Sede" field puzzles a one-location spa ("Laureles · Laureles" on the booking page when sede = barrio). | Rename it "Barrio o nombre de la sede (ej.: Laureles)". Don't repeat it when it equals the address. | dev |
| 19 | Mis pagos (manicurista) | It is long, and the breakdown has 12 lines. | Collapse "Desglose por servicio" after 5 lines ("Ver todo"). | dev |

---

## P3: nice to have / phase 2

- **Photos of services and a portfolio**: an image per service on the booking page; work photos in the client file. Needs uploads and storage.
- **Deposit for long services** (acrylic, polygel, nail art of 2 h or more): "Para confirmar, envía un abono de $20.000 por Nequi". Start with just the text plus Nequi number in the confirmation message, no payment integration.
- **Pick a color when booking** (from inventory), and show the client's favorite colors to the manicurista on the agenda row.
- **Instagram**: a short link `/r/bella` plus a downloadable "Reserva aquí" story image and QR code in Ajustes.
- **Loyalty**: "Visita 10 gratis" counter in the client file.
- **Design**: on the confirmation page, use the soft plum check icon instead of the clock when the status is confirmed; give the success state a little celebration (💅 illustration).
- **Time input locale**: Nueva shows "06:30 PM" (browser default). Set `lang="es-CO"` on the inputs or use a custom picker so it shows "6:30 p. m.".

---

## Already good (keep)

- "Tus manos, en buenas manos", the three-step progress bar, and "Paso 1 de 3 · ¿Qué te vas a hacer?". Warm and clear.
- Add-ons appear only after picking a service, and the sticky total "3 servicios · 2 h 30 min · $103.000" makes the total clear.
- "Cualquiera · El primero libre" plus a chip per manicurista, and full days marked "lleno".
- The phone error message is specific: "son 10 dígitos y empieza por 3".
- Allergies: the flag on the agenda row, the warning block on the appointment and cobro, never sent in WhatsApp.
- Cobro: the amount is prefilled with the sum, tip chips, the payment-method grid, and double-tap protection.
- Owner agenda: the "Sin respuesta de la manicurista" alert and the countdown "Responde en 1 h 34 min".
- Análisis "Lo que vemos": plain-language insights a spa owner can act on.
