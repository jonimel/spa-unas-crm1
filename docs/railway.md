# Railway: האתר באינטרנט

<div dir="rtl">

האתר רץ ב-Railway כשירות אחד, עם **Volume** (דיסק קבוע) שבו נשמרים מסד הנתונים והגיבויים. אין צורך בשירות Postgres נפרד: אותו מסד נתונים מובנה (PGlite) שרץ במחשב, רק שהקבצים שלו יושבים על ה-Volume.

## הקמה (פעם אחת)

1. להיכנס ל-<https://railway.com> ← `Login` ← `Login with GitHub`, ולאשר.
2. `New Project` ← `Deploy from GitHub repo` ← לבחור `jonimel/barbar-crm`. אם הריפו לא מופיע: `Configure GitHub App` ולתת גישה לריפו.
3. Railway מתחיל לבנות מיד. הפריסה הראשונה **תיכשל בכוונה** (אין עדיין Volume), זה תקין.
4. ללחוץ על השירות ← `Settings` ← `Source` ← `Branch`: לבחור את הענף שבו נמצאת הגרסה (עד שה-PRs ימוזגו ל-`main`).
5. **Volume:** בתוך הפרויקט, קליק ימני על השירות (או `+ Create`) ← `Volume` ← לחבר לשירות, ו-`Mount path` = `/data`.
6. **כתובת:** `Settings` ← `Networking` ← `Generate Domain`. מתקבלת כתובת כמו `https://barbar-crm-production.up.railway.app`.
7. `Deploy` (או `Redeploy`). אחרי 2–3 דקות האתר עולה, עם המספרה לדוגמה JP Barbar.

לא צריך להגדיר משתנים (Variables): הכתובת לקישורים וההגדרות של ה-Volume מגיעות אוטומטית מ-Railway.

## משתנים אופציונליים (`Variables`)

| משתנה | מתי |
|---|---|
| `PUBLIC_URL` | כשמחברים דומיין משלכם (למשל `https://reservas.jpbarbar.co`), כדי שהקישורים בהודעות יהיו עליו |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_LANG` | כשמחברים WhatsApp אמיתי ([whatsapp.md](whatsapp.md)) |

## חשוב לדעת

- **האתר ציבורי.** כל מי שיש לו את הכתובת רואה בעמוד הבית את קודי הדוגמה (3000 / 1234). לא לשלוח את הכתובת ללקוחות אמיתיים לפני שמחליפים PIN לכל המשתמשים.
- **עדכונים:** כל שינוי שנכנס לענף שנבחר ב-Railway עולה לבד תוך כמה דקות. בזמן העדכון האתר לא זמין כחצי דקה.
- **גיבויים:** נשמרים כל יום על ה-Volume, ואפשר להוריד גיבוי מ-Ajustes ← Copias de seguridad. כדאי להוריד אחד מדי פעם למחשב.
- **שירות אחד בלבד:** לא להגדיל ל-2 Replicas. מסד הנתונים המובנה עובד מתוך תהליך אחד.
- **עלות:** Railway גובה לפי שימוש; לאתר כזה בדרך כלל מספיקה תוכנית Hobby ‏(5$ לחודש).

</div>
