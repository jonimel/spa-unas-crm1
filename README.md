# Spa Uñas CRM

Agenda, reservas y clientas para spas de uñas en Colombia. Móvil primero, en español, varios spas en el mismo servidor y con varias sedes.

## Cómo correrlo en tu computador (הוראות הפעלה)

<div dir="rtl">

**פעם ראשונה בלבד:**

1. להתקין **Node.js** (גרסה 20 ומעלה) מ-<https://nodejs.org> (כפתור LTS, התקנה רגילה).
2. להוריד את הקוד: ב-GitHub, בדף הריפו, `Code` ← `Download ZIP`, ולחלץ לתיקייה (או `git clone` של הריפו).
3. לפתוח טרמינל בתוך התיקייה ולהריץ:

```
npm install
```

**בכל פעם שרוצים להפעיל (שימוש רגיל, מהיר):**

```
npm run app
```

ואז לפתוח בדפדפן: <http://localhost:3000>. ההפעלה לוקחת כדקה, כי האתר נבנה מחדש בכל פעם. אחר כך הוא מהיר, בלי התראות של מפתחים.

`npm run dev` הוא מצב פיתוח: נפתח מהר יותר, אבל האתר איטי יותר ומציג התראות טכניות.

אין צורך להתקין מסד נתונים: הוא מובנה ונשמר בתיקייה `.data` בתוך הפרויקט. בהפעלה הראשונה נוצר ספא ציפורניים לדוגמה ("Spa Uñas Bella", סניף El Poblado במדיין) עם 4 מניקוריסטיות, קטלוג שירותים ותוספות במחירים של מדיין, כ־300 לקוחות וחצי שנה של היסטוריה (כולל תורים עם כמה שירותים), כדי שיהיה מה לראות בעמלות ובניתוח. זה לוקח כמה שניות, פעם אחת.

**משתמשי בדיקה** (מופיעים גם בעמוד הבית):

| תפקיד | טלפון | PIN |
|---|---|---|
| כולם (כניסה משותפת של הדוגמה) | 1111 | 1111 |
| בעלים · Laura Gómez | 3000 | 1111 |
| מניקוריסטית · Camila Restrepo | 4000 | 1111 |
| מניקוריסטית · Daniela Ospina | 5000 | 1111 |
| מניקוריסטית · Mariana Zapata | 6000 | 1111 |
| מניקוריסטית · Valeria Henao (משכירה עמדה) | 7000 | 1111 |

עם 1111 / 1111: דרך "Dueño" נכנסים כבעלים, ודרך "Manicurista" בוחרים עם איזו מניקוריסטית להיכנס. (קודים קצרים רק לנתוני הדוגמה. מניקוריסטית אמיתית נכנסת עם המספר הנייד שלה, 10 ספרות.)

לינק ההזמנה ללקוחות: <http://localhost:3000/r/bella>. כניסת הצוות: <http://localhost:3000/entrar/manicurista> (הלינק הישן `/entrar/barbero` מפנה אליו).

**להתחיל מאפס** (מוחק את כל הנתונים ויוצר שוב את הדוגמה): `npm run reset` ואז שוב `npm run app`.

**גיבוי:** כל יום נשמר גיבוי אוטומטי בתיקייה `backups` (נשמרים 14 האחרונים), ואפשר להוריד גיבוי מ-Ajustes ← Copias de seguridad. **שחזור** (כשהשרת כבוי): `npm run restore` משחזר את הגיבוי האחרון, ו-`npm run restore -- backups/<קובץ>` משחזר גיבוי מסוים. מסד הנתונים הנוכחי לא נמחק אלא נשמר בצד בתוך `.data`.

**אבטחה:** אחרי 5 קודים שגויים ברצף לאותו טלפון, הכניסה נחסמת ל-10 דקות. לכל מניקוריסטית אמיתית קובעים PIN אישי ב-Ajustes ← Manicuristas.

**באינטרנט (Railway):** ראו [docs/railway.md](docs/railway.md).

**לנסות מהטלפון** באותה רשת Wi-Fi: כשמריצים `npm run dev` מופיעה בטרמינל השורה `📱 Desde el celular` עם הלינק המלא (למשל `http://192.168.1.25:3000/r/bella`). פותחים אותו בטלפון. אם Windows שואל על Firewall, מאשרים לרשתות פרטיות.

</div>

## Qué hace (fase 1)

- **Reserva online sin app** (`/r/<spa>`): sede → uno o varios servicios (por ejemplo *Manicure semipermanente* + *Pedicure spa*) y **adicionales** opcionales (retiro, nail art, reparación…) → día y hora (cada hora muestra qué manicuristas están libres para la duración total) → celular y nombre. Duración y precio = la suma. Reconoce a la clienta que vuelve. Mínimo 1 h de anticipación.
- **Aprobación de la manicurista**: la cita queda *pendiente*; la manicurista confirma o rechaza. Plazo: 2 h desde la solicitud, o hasta 30 min antes de la cita si eso llega primero. Si no responde, el dueño recibe un aviso (en la agenda y por WhatsApp).
- **Agenda**: la manicurista ve solo la suya; el dueño ve todo, con filtro por sede y por manicurista.
- **Cancelar**: solo la manicurista responsable o el dueño. Se avisa al cliente.
- **Clienta de paso / cita por teléfono** (`Nueva`): con varios servicios y adicionales; queda confirmada de una.
- **Cobro**: el detalle de los servicios, valor (sugerido: la suma), propina y medio de pago (efectivo, Nequi, Daviplata, tarjeta, transferencia). Marcar "no vino".
- **Ficha de la clienta**: historial completo, servicio y manicurista habituales, **colores favoritos**, **alergias o sensibilidades** (se muestran bien visibles en la agenda, la cita y el cobro) y notas. Los montos gastados solo los ve el dueño.
- **WhatsApp automático**: solicitud recibida, confirmada, rechazada, cancelada, recordatorio 2 h antes, aviso a la manicurista y al dueño, y **"es hora de tu retoque"**: al cobrar un servicio con días de retoque (semipermanente 15, acrílico 21…), N días después se le escribe a la clienta con el link de reservas, si no tiene otra cita. En local se simulan y se ven en la pestaña *WhatsApp*; ver [docs/whatsapp.md](docs/whatsapp.md) para conectarlo de verdad.
- **Ajustes del dueño**: manicuristas (acceso por celular + PIN, sede, horario semanal en dos bloques), servicios (duración, precio, visible/oculto, **adicional** sí/no, **días para el retoque**), sedes, link de reservas.

## Qué hace (fase 2)

- **Comisiones, calculadas en cada cobro**: al registrar el pago queda guardado cuánto es de la manicurista (comisión + propina) y cuánto del spa, con la regla que se usó. Cambiar el esquema después no cambia lo ya cobrado.
- **Esquema por manicurista** (dueño → *Pagos* → tocar a la manicurista): porcentaje general (o el del spa por defecto), excepciones por servicio (otro % o un monto fijo; en una cita con varios servicios cada uno usa su regla), monto fijo por servicio, o **arriendo de puesto** (diario, semanal o mensual: la manicurista se queda con todo y le paga el arriendo al spa). Muestra una simulación con los cobros de esta semana.
- **Reglas del spa**: comisión por defecto, propinas para la manicurista o para el spa, y descontar la comisión del datáfono en pagos con tarjeta.
- **Pagos a las manicuristas (cuenta de cada una)**: el dueño ve cuánto le debe hoy a cada manicurista (lo que ha ganado menos lo que ya se le pagó) y registra pagos y adelantos con el valor, cómo se pagó (efectivo, Nequi, Daviplata, transferencia), la fecha y una nota. Para la manicurista de puesto se registra el arriendo que paga; el arriendo se cuenta por periodo empezado. Cada movimiento queda en el historial y se puede anular si se registró por error (queda como anulado, no se borra). No importa cada cuánto se pague: el saldo siempre está al día.
- **Dueño**: lo que se debe hoy a todo el equipo y los arriendos por cobrar; y por periodo (esta semana, la pasada, este mes o el pasado) las ventas, lo que ganaron las manicuristas y lo que queda para el spa (incluye arriendos).
- **Manicurista** (*Mis pagos*): solo lo suyo: lo que tiene por cobrar hoy, hoy / semana / mes con desglose por servicio y propinas, y los pagos que ha recibido.
- **Análisis** (solo el dueño): hoy, semana o mes (y meses anteriores), toda la red o una sede. Ingresos, visitas, ticket promedio, ocupación, propinas, clientas nuevas, "no vino"; ingresos por día o por mes; mapa de ocupación por día y hora; qué se vende (cada servicio y adicional de la cita con su parte del valor); cómo pagan; ranking de manicuristas; y **"Lo que vemos"**: hallazgos en frases simples (horario más pedido, horario flojo para una promoción, etc.).
- Las comparaciones son justas: el periodo en curso se compara con el mismo tramo del anterior (hoy hasta esta hora contra el mismo día de la semana pasada hasta la misma hora).

## Técnico

- Next.js 16 (App Router, server actions), TypeScript, sin Tailwind: el diseño viene del prototipo aprobado (`src/app/globals.css`).
- Base de datos: **PostgreSQL embebido (PGlite)** en `.data/pg`, sin instalar nada. El esquema (`db/migrations/*.sql`) es PostgreSQL estándar, así que el paso a Supabase/Postgres en producción es correr las mismas migraciones y cambiar `src/lib/db.ts`.
- Varios spas: todas las tablas llevan `tenant_id`; cada consulta filtra por el spa del usuario.
- Servicios de cada cita: `appointment_services` (una línea por servicio; `appointments.price` y `ends_at` son la suma). Al cobrar, el valor se reparte entre las líneas según su precio y la comisión se calcula por línea. En la base, la manicurista sigue llamándose `barber` (`barber_id`, `role = 'barber'`): solo cambió lo que se ve.
- Tareas automáticas (avisos al dueño, recordatorios y retoques): corren cada minuto dentro del servidor (`src/instrumentation.ts`).
- Lógica de reservas: `src/lib/booking.ts`, `src/lib/availability.ts`, `src/lib/appointments.ts`.
- Comisiones: `src/lib/commission.ts` (la regla, sin base de datos), `src/lib/payroll.ts` (guardar la repartición, totales y la cuenta de cada manicurista). Análisis: `src/lib/analytics.ts`.
- La cuenta de las manicuristas empieza el día en que se instala esta versión (`tenants.ledger_start`): lo ganado antes se da por pagado. Con `npm run reset` los datos de ejemplo traen seis meses de pagos semanales.

```
npm test          # pruebas (disponibilidad, varios servicios, adicionales, doble reserva, permisos, avisos, recordatorios, retoques, comisiones por servicio, pagos a manicuristas, análisis)
npm run typecheck
npm run lint
npm run build && npm start
```

Variables opcionales (`.env.local`): `PUBLIC_URL` (para los links en los mensajes), `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_LANG`, `SPA_DATA_DIR`, `SPA_BACKUP_DIR` (siguen sirviendo los nombres de antes `BARBAR_DATA_DIR` / `BARBAR_BACKUP_DIR`), `DEMO_LOGIN=0` (apaga la entrada 1111 / 1111), `SHOW_DEMO_LOGINS`.

Railway: `railway.json` (build, start, healthcheck `/api/health`). Con un Volume, los datos y las copias van a `$RAILWAY_VOLUME_MOUNT_PATH/pg` y `/backups`; los links usan `RAILWAY_PUBLIC_DOMAIN` si no hay `PUBLIC_URL`. Sin Volume la app no arranca en Railway, para no perder datos. Ver [docs/railway.md](docs/railway.md).
