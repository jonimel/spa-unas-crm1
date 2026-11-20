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
