# Diseño · Spa Uñas CRM

Se ve suave, elegante y femenino-premium, y sigue siendo rápido de leer para el equipo. La estructura es la misma de antes (móvil primero, 390 px; en escritorio la app es una columna de 480 px sobre un fondo rosa). Lo que cambió es el estilo.
Todo el CSS está en `src/app/globals.css` y usa variables. **No escribas colores fijos en los componentes:** usa siempre las variables.

## Paleta

Las variables conservan algunos nombres de la versión de barbería (`--brass`, `--pole`) para no romper componentes. **`--brass` es el acento ciruela, no dorado.**

| Variable | Claro | Oscuro | Uso |
|---|---|---|---|
| `--bg` | `#fbf6f1` marfil cálido | `#1b1117` | fondo de la app |
| `--frame` | `#f1e4dc` | `#120b0f` | fondo alrededor de la app en escritorio |
| `--surface` | `#ffffff` | `#251820` | tarjetas, campos |
| `--surface-2` | `#f6ece7` | `#2f2029` | bloques secundarios, pista del segmentado |
| `--blush` | `#f3dcd8` rosa nude | `#3a2631` | avatares, círculos de íconos, degradados |
| `--line` | `#eddcd4` | `#3e2b36` | divisores, bordes de tarjeta |
| `--line-strong` | `#9a8a91` | `#8d7682` | bordes de campos (≥3:1) |
| `--fg` | `#2e1b26` tinta ciruela | `#f7ecee` | texto |
| `--muted` | `#6f5863` | `#c4aeb8` | texto secundario (6:1) |
| `--faint` | `#7d6871` | `#b39ca7` | marcadores de posición, pestañas inactivas (≥4.5:1) |
| `--brass` | `#7a2f55` ciruela | `#eaa9c4` rosa | acento: botones, selección, links |
| `--brass-rgb` | `122, 47, 85` | `234, 169, 196` | para `rgba(var(--brass-rgb), .3)` |
| `--brass-ink` | `#ffffff` | `#2a0e1d` | texto sobre el acento |
| `--brass-soft` | ciruela 8 % | rosa 12 % | fondo de lo seleccionado |
| `--rose-gold` | `#b57c69` | `#d9a594` | **solo decoración** o texto ≥18 px (aros del logo, barra de pasos, adornos) |
| `--ok` / `--ok-soft` | `#2c7150` / `#e4f1e9` | `#82c9a0` | confirmada, éxito |
| `--warn` / `--warn-soft` / `--warn-line` | `#8a4f00` / `#fbeed6` / `#e5b15e` | `#f0bf6a` | pendiente, **alergias** |
| `--bad` / `--bad-soft` | `#b0302a` / `#fbe5e2` | `#f3988d` | cancelada, no vino, errores |
| `--info` / `--info-soft` | `#3d5a8a` / `#e7edf7` | `#a9c1ec` | estado neutro extra (`.pill.info`) |
| `--wa` / `--wa-text` | `#25d366` / `#1a7f43` | `#4fdc87` | botón de WhatsApp / texto verde sobre claro |

Contraste revisado: el texto normal es ≥4.5:1 en claro y en oscuro (fg/bg 15:1, ciruela/blanco 8.9:1, muted/bg 6:1, warn/warn-soft 5.7:1). El modo oscuro sale automático con `prefers-color-scheme`. Los logos tienen colores fijos y se ven igual en los dos modos.

Otras variables: radios `--r-sm` 12 · `--r` 16 · `--r-lg` 22 · botones redondos del todo (99px); sombras `--shadow-1` (tarjetas) y `--shadow-2` (hover, hojas); `--ring` (foco de campos); `--ease`.

## Tipografía

Las dos fuentes se cargan con `next/font/google` en `layout.tsx`, que las sirve desde la propia app (sin parpadeo):

- **Cormorant Garamond** 500/600/700 + itálica (`--f-display`): títulos (`.top h1`, `.hero-title`, `.brand b`), números grandes (KPI, precios, saldos, número del día). La itálica en ciruela sirve para resaltar (`<em>` dentro de `.hero-title` o `.welcome h2`).
- **DM Sans** (`--f-body`): todo lo demás. 14 px de base, 16 px en los campos (así iOS no hace zoom).

Los títulos van en tipo oración, no en mayúsculas. Las mayúsculas espaciadas quedan solo para los rótulos chicos (`.eyebrow`, `.tgroup`, `.svc-cat`).

## Marca

- `ShopMark` (en `src/components/ShopLogo.tsx`): para `bella`, una yema de dedo con uña ciruela sobre un disco nude con aro de oro rosa. Para otro spa, sus iniciales en Cormorant ciruela. Sin spa, el frasco de esmalte de Spa Uñas CRM. Las props no cambiaron. `JP_SLUG` (= `DEMO_SLUG`) ahora es `'bella'`, y `PRODUCT` es `'Spa Uñas CRM'`.
- `ShopBadge`: el sello redondo "Bella · Spa de uñas".
- El favicon (`src/app/icon.svg`) es el frasco de esmalte.
- Íconos nuevos en `Icon.tsx`: `polish`, `nail`, `hand`, `sparkle`, `heart`, `drop`, `gift`, `leaf` y `alert`. Todos los anteriores siguen. Usa `polish` donde antes iba `sc` (tijeras) para el equipo.

## Componentes nuevos (clases)

| Clase | Para qué |
|---|---|
| `.welcome` (+ `h2` con `<em>`, `p`, `.meta > span`) | bienvenida arriba de la página de reservas |
| `.svc` en un `.opt` | tarjeta de servicio: el precio va en serif ciruela, alineado arriba |
| `.svc-meta` + `.dur` (con `<Icon name="clock">`) | pastilla con la duración dentro de la tarjeta |
| `.svc-cat` | encabezado de categoría con línea (Manos, Pies, Extensiones, Adicionales) |
| `.opt.multi` (+ `.on` o un `input:checked` adentro) | servicios que se pueden combinar: casilla cuadrada en vez del círculo ✓ |
| `.opt.addon` | adicional en forma de tarjeta (borde punteado hasta que se elige) |
| `.chip.chip-addon` (+ `.on`; precio en `<span class="price">`) | adicional en forma de chip: "+" que pasa a "✓" |
| `.total-bar` (`span` + `b`) | total y duración encima del botón de `.cta` |
| `.alert-allergy` (`<Icon name="alert">` + `<div><b>Alergia</b>texto</div>`) | bloque visible en la ficha, el detalle de la cita y el cobro |
| `.flag-allergy` (`<Icon name="alert">` + texto corto) | etiqueta corta en filas de agenda y listas |
| `.ap.is-pending / is-confirmed / is-completed / is-cancelled / is-rejected / is-no_show` | franja de color por estado a la izquierda de cada cita (no vino = franja punteada; cancelada = nombre tachado) |
| `.pill.info`, `.pill.plain` | pastilla azul neutra / pastilla sin punto. Las pastillas llevan un punto de color, salvo si ya tienen un ícono |
| `.done-mark` (`<Icon name="check">`) | círculo grande de "listo" en la confirmación de cita |
| `.ornament` | separador decorativo |
| `.empty` | ya existía. Ahora lleva un ícono de brillo arriba; `.empty.plain` lo quita |

También cambió el estilo de lo que ya existía: los botones son píldoras con sombra suave y tienen estados de hover, activo (escala .98), deshabilitado y foco; el día elegido queda en ciruela lleno; la pestaña activa lleva una barra; las hojas y avisos aparecen con una animación corta. Con `prefers-reduced-motion` todas las transiciones se apagan.

## Sí / No

- **Sí:** variables siempre, también en los estilos en línea (`rgba(var(--brass-rgb), .4)`, `var(--ok-line)`).
- **Sí:** ciruela para una sola acción principal por pantalla; las demás, `.btn.ghost`.
- **Sí:** para los estados, el color siempre con texto o forma (pastilla con palabra, franja punteada para "no vino").
- **Sí:** zonas táctiles de 44 px como mínimo (ya lo dan `.btn`, `.chip`, `.seg`, `.day`, `.tslot`).
- **No:** colores hex en los componentes, sobre todo los dorados viejos (`201,163,92`).
- **No:** oro rosa para texto pequeño (no llega a 4.5:1). Es solo decoración.
- **No:** `textTransform: 'uppercase'` en textos con la fuente de títulos. La serif se ve mejor en tipo oración.
- **No:** emojis como íconos de la interfaz (en los mensajes de WhatsApp sí).

## Notas de UX para el desarrollador (cambios en los componentes)

1. **Reserva, paso de servicios** (`BookingFlow.tsx`): agregar la clase `svc` a cada `.opt` y mostrar la duración como `<div className="svc-meta"><span className="dur"><Icon name="clock" />{fmtDuration(...)}</span></div>` en lugar de "1 h · descripción". Agrupar con `<div className="svc-cat">Manos</div>` (Manos / Pies / Extensiones / Retiros y extras): son 15 servicios y la lista plana es larga. Si se pueden elegir varios, usar `opt svc multi` con `aria-pressed`, y mostrar `.total-bar` en el `.cta` ("2 servicios · 1 h 20 min · $57.000").
2. **Bienvenida**: en el primer paso, debajo de la barra de pasos, poner un `.welcome` con `<h2>Tus manos, <em>en buenas manos</em></h2>`, una línea ("Elige tu servicio y la hora. Te confirmamos por WhatsApp.") y `.meta` con la sede y el horario.
3. **Adicionales** (nail art, parafina, retiro): mejor como `.chip.chip-addon` debajo del servicio elegido que como servicios aparte.
4. **Alergias**: en la ficha de la clienta, el detalle de la cita y **cobrar**, usar el bloque `.alert-allergy` arriba de todo. En la agenda ya usas `.flag-allergy`, bien; el texto largo que va al lado conviene ponerlo en su propia línea (`<div className="small" style={{color:'var(--warn)'}}>`) para que no se parta alrededor de la etiqueta.
5. **Agenda**: agregar `is-${status}` a cada `.ap` para tener la franja de color (`ui.tsx` / página de agenda).
6. **Colores fijos que quedan**: `app/analisis/page.tsx` (mapa de calor, `rgba(201,163,92,…)` → `rgba(var(--brass-rgb),…)`), `app/clientes/[id]/page.tsx` (`rgba(201,163,92,.45)`), `BookingFlow.tsx` (`rgba(115,176,131,.4)` → `var(--ok-line)`). Sin este cambio, en el mapa de calor las celdas llenas tienen texto blanco sobre dorado claro y casi no se leen.
7. **Nombres en mayúsculas**: `clientes/[id]/page.tsx` y `r/[slug]/cita/[id]/page.tsx` ponen `textTransform: 'uppercase'` en textos con la fuente de títulos. Quitarlo.
8. **Equipo**: usar `<Icon name="polish" />` para el rol de manicurista (inicio, Entrar, ajustes) en lugar de `sc`.
9. **Confirmación de cita** (`r/[slug]/cita/[id]`): un `.done-mark` arriba del título se ve como "listo, te esperamos".

## Ronda 2: lo que ya cambió en el CSS (no requiere markup)

- **Tarjeta de servicio** (`.opt.svc`): ahora es una cuadrícula. Arriba van el nombre y la casilla; debajo, la descripción a todo el ancho; al pie, la duración a la izquierda y el precio grande a la derecha. Los adicionales (`.opt.svc.addon`) van en una sola fila: nombre, +precio y casilla. La casilla hace un pequeño "pop" al marcarla.
- **Barra inferior** (`.cta`): es una barra sólida con desenfoque, borde y sombra. El contenido ya no se ve por detrás del total ni del botón.
- **Botón deshabilitado**: es plano, de color `--surface-2` con texto `--faint`, en lugar de semitransparente. Antes dejaba ver el contenido de atrás.
- **Pastillas**: el punto de color queda solo en los estados `ok`, `warn` y `bad`. Las pastillas informativas (`brass`, `dim`), como "45 % general", ya no lo llevan.
- **`<details>` desplegables** (`details.more.card`, `details.tbl`): tienen una flecha que gira al abrir. En Ajustes no se notaba que los servicios y las sedes se despliegan.
- **`.btn.wa`**: pasa a verde suave (fondo `--wa-soft`, texto `--wa-text`). El verde neón chocaba con la paleta, y sigue reconociéndose como WhatsApp.
- **Tarjeta de pendiente** (`.pending`): más compacta. Barra de 4 px, avatar de 38 px y avatar alineado arriba.
- **Hora libre** (`.tslot`): 17 px y sin cortes de línea en la hora.
- **Bienvenida** (`.welcome`): el aro decorativo ya no tapa el título, y el título se reparte en líneas parejas (`text-wrap: balance`).

### Clases nuevas de la ronda 2

| Clase | Uso |
|---|---|
| `.confirm` > `.confirm-mark` (`.ok` / `.bad`) + `h2` + `p` | momento de confirmación. Círculo rosa con brillos de oro rosa; `ok` = verde, `bad` = rojo |
| `.ticket` > `.ticket-head`, `.ticket-time`, `.ticket-who`, `.ticket-cut`, `.kv`… | resumen de la cita como "ticket": hora grande, línea perforada y el total en serif ciruela |
| `.profile-head` > `.av` + `div > h2 + .small` | encabezado de la ficha de la clienta |
| `.group` > `details.more` (sin `.card`) o `.li` | lista agrupada: varias filas en una sola tarjeta (Ajustes) |
| `.chips.fit` | chips en una fila de columnas iguales (propinas) |

## Ronda 2: pedidos al desarrollador

1. **Confirmación de la reserva**, `src/app/r/[slug]/cita/[id]/page.tsx`:
   - Reemplazar el `<div style={{textAlign:'center'…}}>` (círculo con estilos en línea y `h2.hero-title`) por esto (el ícono `sparkle` es para "pendiente": se ve como celebración en lugar de alerta):
     ```tsx
     <div className="confirm">
       <div className={'confirm-mark' + (ok ? ' ok' : pending ? '' : ' bad')}>
         <Icon name={pending ? 'sparkle' : ok ? 'check' : 'x'} />
       </div>
       <h2>{pending ? '¡Listo! Solicitud enviada' : …}</h2>
       <p>…</p>
     </div>
     ```
   - Cambiar el `.card` que sigue por `.ticket`:
     - fila de arriba → `<div className="ticket-head">`;
     - hora → `<div className="ticket-time">` (quitar el `style` en línea);
     - "con …" → `<div className="ticket-who">con {barbero} · {sede}</div>`;
     - antes de las líneas de servicio, poner `<div className="ticket-cut" />`.
2. **Ficha de la clienta**, `src/app/app/clientes/[id]/page.tsx` (alrededor de la línea 44): el bloque `row` con el avatar y el nombre (nombre en `fontFamily` en línea) pasa a ser `<div className="profile-head"><Avatar …/><div><h2>{c.name}</h2><div className="small muted">…</div></div></div>`. Hoy el nombre y el teléfono quedan pegados.
3. **Ajustes → Servicios**, `src/app/app/ajustes/page.tsx` (alrededor de las líneas 103–121): poner los `details.more.card` dentro de un solo `<div className="group">` por bloque (principales / adicionales) y quitarles `card`. Así 15 tarjetas sueltas pasan a ser dos listas compactas. Lo mismo con Sedes.
4. **Cobrar**, `src/app/app/cobrar/[id]/page.tsx`: al contenedor de las propinas agregarle `fit` (`className="chips fit"`) para que las 4 opciones queden en una fila. Hoy se parten en 2 líneas.
5. **Agenda, "Por aprobar"**, `src/app/app/agenda/page.tsx` (alrededor de la línea 115): con 6 a 9 pendientes, la agenda del día queda muy abajo.
   - Mostrar las 2 primeras y el resto dentro de `<details className="more"><summary className="link small">Ver N más</summary>…</details>`.
   - También se puede usar un resumen de una línea.
6. **Duraciones**: la agenda y Ajustes muestran "150 min", "105 min". Usar `fmtDuration` ("2 h 30 min"), como ya se hace en las reservas.
7. **Medios de pago** (`cobrar` y `.pay`): Nequi y Daviplata usan el mismo ícono de celular. Se puede dejar así, o usar `phone` para Nequi y `card` para tarjeta, y agregar una pastilla de color con la marca. Es opcional.
8. **Entrar como dueño / manicurista**, `src/app/entrar/[rol]/page.tsx`: arriba del ícono del rol, mostrar el `ShopMark` (sin `slug`, sale el frasco). Hoy la pantalla de login es la única sin marca.
