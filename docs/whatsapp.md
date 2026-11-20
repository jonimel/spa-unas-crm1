# Conectar WhatsApp (Meta Cloud API)

Mientras no haya credenciales, los mensajes se guardan como *simulados* y se ven en la pestaña **WhatsApp** de la dueña o el dueño del spa.

Para enviarlos de verdad:

1. Crear una app en <https://developers.facebook.com> con el producto **WhatsApp** y un número de WhatsApp Business verificado.
2. En **WhatsApp Manager → Plantillas**, crear estas plantillas (categoría *Utilidad*, idioma *Español (COL)*). El texto de cada una está en `src/lib/whatsapp.ts`; los `{nombre}` se reemplazan por variables `{{1}}`, `{{2}}`… en el mismo orden:

| Plantilla | Para | Variables en orden |
|---|---|---|
| `solicitud_recibida` | clienta | nombre, spa, servicio, fecha, hora, manicurista, plazo |
| `cita_confirmada` | clienta | nombre, fecha, hora, manicurista, sede, dirección |
| `cita_rechazada` | clienta | nombre, fecha, hora, link |
| `cita_cancelada` | clienta | nombre, fecha, hora, link |
| `cancelada_por_clienta` | clienta | nombre, fecha, hora, link |
| `recordatorio` | clienta | nombre, hora, manicurista, sede |
| `retoque` | clienta | nombre, spa, servicio, días, link |
| `manicurista_nueva_solicitud` | manicurista | manicurista, cliente, servicio, fecha, hora, límite |
| `manicurista_cita_cancelada` | manicurista | manicurista, cliente, fecha, hora |
| `dueno_sin_respuesta` | dueña | manicurista, cliente, fecha, hora |

El recordatorio de retoque (`retoque`) sale a las 10 a. m. del día que toca (los días se configuran por servicio en Ajustes → Servicios), solo si la clienta no tiene otra cita después. Las variables `{servicio}` y `{dias}` dicen qué se hizo y hace cuánto.

3. Crear `.env.local` en la raíz del proyecto:

```
WHATSAPP_TOKEN=...            # token permanente de un usuario del sistema
WHATSAPP_PHONE_NUMBER_ID=...  # ID del número (no el número)
WHATSAPP_LANG=es_CO
PUBLIC_URL=https://tu-dominio  # para el link de reservas dentro de los mensajes
```

4. Reiniciar `npm run dev`. La pestaña WhatsApp mostrará "Conectado" y cada mensaje quedará como *enviado* o *falló* (con el error de Meta).
