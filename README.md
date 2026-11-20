# Barbar CRM

Agenda, reservas y clientes para barberías en Colombia. Móvil primero, en español, multi-barbería y con varias sedes.

## Cómo correrlo en tu computador (הוראות הפעלה)

<div dir="rtl">

**פעם ראשונה בלבד:**

1. להתקין **Node.js** (גרסה 20 ומעלה) מ-<https://nodejs.org> (כפתור LTS, התקנה רגילה).
2. להוריד את הקוד: ב-GitHub, בדף הריפו, `Code` ← `Download ZIP`, ולחלץ לתיקייה. (או `git clone https://github.com/jonimel/barbar-crm`.)
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

אין צורך להתקין מסד נתונים: הוא מובנה ונשמר בתיקייה `.data` בתוך הפרויקט. בהפעלה הראשונה נוצרת מספרה לדוגמה ("JP Barbar", סניף Villa Hermosa במדיין) עם כ־340 לקוחות וחצי שנה של היסטוריה, כדי שיהיה מה לראות בעמלות ובניתוח. זה לוקח כמה שניות, פעם אחת.

**משתמשי בדיקה** (מופיעים גם בעמוד הבית):

| תפקיד | טלפון | PIN |
|---|---|---|
| בעלים · Laura Gómez | 3000 | 1234 |
| ספר · Andrés Rojas | 4000 | 1234 |
| ספר · Camilo Díaz | 5000 | 1234 |
| ספר · Julián Mora | 6000 | 1234 |
| ספר · Mateo Ríos | 7000 | 1234 |

(קודים קצרים רק לנתוני הדוגמה. ספר אמיתי נכנס עם המספר הנייד שלו, 10 ספרות.)

לינק ההזמנה ללקוחות: <http://localhost:3000/r/jpbarbar> (הלינק הישן `/r/navaja` מפנה אליו).

**להתחיל מאפס** (מוחק את כל הנתונים ויוצר שוב את הדוגמה): `npm run reset` ואז שוב `npm run app`.

**גיבוי:** כל יום נשמר גיבוי אוטומטי בתיקייה `backups` (נשמרים 14 האחרונים), ואפשר להוריד גיבוי מ-Ajustes ← Copias de seguridad. **שחזור** (כשהשרת כבוי): `npm run restore` משחזר את הגיבוי האחרון, ו-`npm run restore -- backups/<קובץ>` משחזר גיבוי מסוים. מסד הנתונים הנוכחי לא נמחק אלא נשמר בצד בתוך `.data`.

**אבטחה:** אחרי 5 קודים שגויים ברצף לאותו טלפון, הכניסה נחסמת ל-10 דקות. לכל ספר אמיתי קובעים PIN אישי ב-Ajustes ← הספר.

**באינטרנט (Railway):** ראו [docs/railway.md](docs/railway.md).

**לנסות מהטלפון** באותה רשת Wi-Fi: כשמריצים `npm run dev` מופיעה בטרמינל השורה `📱 Desde el celular` עם הלינק המלא (למשל `http://192.168.1.25:3000/r/jpbarbar`). פותחים אותו בטלפון. אם Windows שואל על Firewall, מאשרים לרשתות פרטיות.

</div>

## Qué hace (fase 1)

- **Reserva online sin app** (`/r/<barbería>`): sede → servicio → día y hora (cada hora muestra qué barberos están libres, también 2–3 a la vez) → celular y nombre. Reconoce al cliente que vuelve. Mínimo 1 h de anticipación.
- **Aprobación del barbero**: la cita queda *pendiente*; el barbero confirma o rechaza. Plazo: 2 h desde la solicitud, o hasta 30 min antes de la cita si eso llega primero. Si no responde, el dueño recibe un aviso (en la agenda y por WhatsApp).
- **Agenda**: el barbero ve solo la suya; el dueño ve todo, con filtro por sede y por barbero.
- **Cancelar**: solo el barbero responsable o el dueño. Se avisa al cliente.
- **Cliente de paso / cita por teléfono** (`Nueva`): queda confirmada de una.
- **Cobro**: valor, propina y medio de pago (efectivo, Nequi, Daviplata, tarjeta, transferencia). Marcar "no vino".
- **Ficha de cliente**: historial completo, servicio y barbero habituales, notas. Los montos gastados solo los ve el dueño.
- **WhatsApp automático**: solicitud recibida, confirmada, rechazada, cancelada, recordatorio 2 h antes, aviso al barbero y al dueño. En local se simulan y se ven en la pestaña *WhatsApp*; ver [docs/whatsapp.md](docs/whatsapp.md) para conectarlo de verdad.
- **Ajustes del dueño**: barberos (acceso por celular + PIN, sede, horario semanal en dos bloques), servicios (duración, precio, visible/oculto), sedes, link de reservas.

## Qué hace (fase 2)

- **Comisiones, calculadas en cada cobro**: al registrar el pago queda guardado cuánto es del barbero (comisión + propina) y cuánto de la barbería, con la regla que se usó. Cambiar el esquema después no cambia lo ya cobrado.
- **Esquema por barbero** (dueño → *Pagos* → tocar al barbero): porcentaje general (o el de la barbería por defecto), excepciones por servicio (otro % o un monto fijo), monto fijo por servicio, o **arriendo de silla** (diario, semanal o mensual: el barbero se queda con todo y le paga el arriendo a la barbería). Muestra una simulación con los cobros de esta semana.
- **Reglas de la barbería**: comisión por defecto, propinas para el barbero o para la barbería, y descontar la comisión del datáfono en pagos con tarjeta.
- **Pagos a los barberos (cuenta de cada uno)**: el dueño ve cuánto le debe hoy a cada barbero (lo que ha ganado menos lo que ya se le pagó) y registra pagos y adelantos con el valor, cómo se pagó (efectivo, Nequi, Daviplata, transferencia), la fecha y una nota. Para el barbero de silla se registra el arriendo que paga; el arriendo se cuenta por periodo empezado. Cada movimiento queda en el historial y se puede anular si se registró por error (queda como anulado, no se borra). No importa cada cuánto se pague: el saldo siempre está al día.
- **Dueño**: lo que se debe hoy a todo el equipo y los arriendos por cobrar; y por periodo (esta semana, la pasada, este mes o el pasado) las ventas, lo que ganaron los barberos y lo que queda para la barbería (incluye arriendos).
- **Barbero** (*Mis pagos*): solo lo suyo: lo que tiene por cobrar hoy, hoy / semana / mes con desglose por servicio y propinas, y los pagos que ha recibido.
- **Análisis** (solo el dueño): hoy, semana o mes (y meses anteriores), toda la red o una sede. Ingresos, visitas, ticket promedio, ocupación, propinas, clientes nuevos, "no vino"; ingresos por día o por mes; mapa de ocupación por día y hora; qué se vende; cómo pagan; ranking de barberos; y **"Lo que vemos"**: hallazgos en frases simples (horario más pedido, horario flojo para una promoción, etc.).
- Las comparaciones son justas: el periodo en curso se compara con el mismo tramo del anterior (hoy hasta esta hora contra el mismo día de la semana pasada hasta la misma hora).

## Técnico

- Next.js 16 (App Router, server actions), TypeScript, sin Tailwind: el diseño viene del prototipo aprobado (`src/app/globals.css`).
- Base de datos: **PostgreSQL embebido (PGlite)** en `.data/pg`, sin instalar nada. El esquema (`db/migrations/*.sql`) es PostgreSQL estándar, así que el paso a Supabase/Postgres en producción es correr las mismas migraciones y cambiar `src/lib/db.ts`.
- Multi-barbería: todas las tablas llevan `tenant_id`; cada consulta filtra por la barbería del usuario.
- Tareas automáticas (avisos al dueño y recordatorios): corren cada minuto dentro del servidor (`src/instrumentation.ts`).
- Lógica de reservas: `src/lib/booking.ts`, `src/lib/availability.ts`, `src/lib/appointments.ts`.
- Comisiones: `src/lib/commission.ts` (la regla, sin base de datos), `src/lib/payroll.ts` (guardar la repartición, totales y la cuenta de cada barbero). Análisis: `src/lib/analytics.ts`.
- La cuenta de los barberos empieza el día en que se instala esta versión (`tenants.ledger_start`): lo ganado antes se da por pagado. Con `npm run reset` los datos de ejemplo traen seis meses de pagos semanales.

```
npm test          # pruebas (disponibilidad, doble reserva, permisos, avisos, recordatorios, comisiones, pagos a barberos, análisis)
npm run typecheck
npm run lint
npm run build && npm start
```

Variables opcionales (`.env.local`): `PUBLIC_URL` (para los links en los mensajes), `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_LANG`, `BARBAR_DATA_DIR`, `BARBAR_BACKUP_DIR`.

Railway: `railway.json` (build, start, healthcheck `/api/health`). Con un Volume, los datos y las copias van a `$RAILWAY_VOLUME_MOUNT_PATH/pg` y `/backups`; los links usan `RAILWAY_PUBLIC_DOMAIN` si no hay `PUBLIC_URL`. Sin Volume la app no arranca en Railway, para no perder datos. Ver [docs/railway.md](docs/railway.md).
