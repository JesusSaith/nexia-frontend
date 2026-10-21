# Nexia: cómo funciona el proyecto

Nexia es un sistema de reservas en línea para negocios que atienden con cita: salones de belleza y de uñas, barberías, spas, consultorios, clínicas dentales, veterinarias y estudios. Cada negocio tiene una página pública donde sus clientas reservan y un panel donde la dueña administra agenda, clientas, cobros y reportes.

Este documento explica cómo está armado, cómo fluye cada proceso y qué queda pendiente. Al final está el [historial de cambios](#10-historial-de-cambios).

---

## 1. Arquitectura

| Pieza | Tecnología | Carpeta |
|---|---|---|
| Frontend | Angular 22 (componentes standalone, signals), Tailwind v4, Angular Material (diálogos, menús e íconos) | `nexia-frontend` |
| Backend (API) | FastAPI + SQLModel (SQLAlchemy) | `nexia-backend` |
| Base de datos | SQLite en desarrollo (`nexia_dev.db`), PostgreSQL en producción | — |
| Correo | Resend (bienvenida, recuperar contraseña, avisos a la dueña) | — |

**Varios negocios, una instalación.** Todos los negocios viven en la misma base. Cada fila pertenece a un `business_id`, y la página pública se identifica por el `slug` del negocio (`/salon-ana/book`).

**Cómo se conectan**
- En local, el frontend llama a `http://localhost:8000/api` (`src/app/core/config/api-base-url.ts`).
- Publicado, llama a `/api` de su propio dominio, y Vercel reenvía esas peticiones al backend (`vercel.json`). Así la cookie de sesión es del mismo sitio y no hay problemas de CORS.
- La sesión es un JWT en una cookie `httpOnly` (`access_token`).

**Roles:** `owner` (dueña), `admin`, `staff` (colaboradora, con acceso solo a su agenda y su perfil) y `super_admin` (plataforma). La creación de cuentas para colaboradoras está apagada por ahora.

---

## 2. Alta y acceso de la dueña

Código: `src/app/features/auth/`, `src/app/features/legal/` y, en el backend, `app/routers/auth.py`.

### Registro (`/auth/register`)
- **Cabe en una sola pantalla.** Primero el negocio y después la cuenta:
  - **Tipo de negocio** en botones (Salón de belleza, Salón de uñas, Barbería, Spa, Consultorio, Clínica dental, Veterinaria, Estudio, Otro). La lista vive en `src/app/core/business-kinds.ts` y es la misma que usa Configuración.
  - **Nombre del negocio**, con la vista previa del enlace real (`…/salon-ana/book`), que pide a `GET /api/auth/slug-preview` (agrega `-2` si el nombre ya existe).
  - **WhatsApp del negocio**: solo números, 10 dígitos; si pegan `+52` se quita.
  - **"¿Le pagas comisión a tu equipo?"** (Sí / No, obligatorio). Se guarda en `businesses.uses_commissions` (ver "Comisiones" en la sección 4).
  - **Tu nombre, correo y contraseña** (mínimo 8).
  - **Casilla obligatoria** de términos y aviso de privacidad.
- **Errores en su campo:** el correo repetido ofrece "Inicia sesión" con el correo ya escrito, y al enviar con errores el foco salta al primero.
- **En el backend todo va en una transacción** (`POST /api/auth/register`):
  - crea el negocio y la cuenta, guarda teléfono, giro y la **zona horaria del navegador**, y registra cuándo se aceptaron los términos (`users.terms_accepted_at`);
  - el giro define cómo se llama al personal (Estilista, Manicurista, Barbero…; `app/core/catalog.py`);
  - deja **servicios sugeridos del giro, apagados**, para que ningún precio inventado salga al público hasta que la dueña los revise y active;
  - manda un **correo de bienvenida** con su enlace.
- **Al terminar el registro** la dueña llega al **asistente de bienvenida** (`/admin/bienvenida`, ver abajo), no a un panel vacío.
- Los slugs que chocarían con rutas de la app (`admin`, `auth`, `terminos`…) reciben el sufijo `-negocio`.

### Asistente de bienvenida (`/admin/bienvenida`)
- **Tres pasos** con barra de avance (`src/app/features/admin/pages/welcome/`):
  1. **Quién atiende:** "Yo atiendo" (con su nombre) y "Tengo equipo" (nombres). Crea en Equipo a quien falte.
  2. **Horario:** días que abre y hora de apertura y cierre; se aplica a todo el equipo.
  3. **Servicios:** prende los sugeridos del giro y pone su precio. Se asignan a todo el equipo.
- Usa las mismas APIs que Equipo, Horarios y Servicios. Se puede saltar ("Lo hago después"); mientras falte algo para poder reservar, Inicio muestra **"Usar el asistente"**.

### Login y contraseña (`/auth/login`, `/auth/restablecer`)
- **"¿Olvidaste tu contraseña?"** cambia el mismo formulario a "Recupera tu contraseña" y pide solo el correo. La respuesta es igual exista o no la cuenta.
- El correo trae un enlace a `/auth/restablecer?token=…` que **vence en 1 hora y sirve una vez**: lleva una huella de la contraseña actual, y al cambiarla deja de valer. Al guardar la nueva, la dueña entra directo a su panel y le llega un aviso de "tu contraseña cambió". Un enlace vencido lleva al login ya en modo recuperar.
- Quien ya tiene sesión y abre login o registro va directo a su panel (`guestGuard`).

### Páginas legales de la plataforma
- `/terminos` y `/privacidad`: términos y aviso de privacidad de Nexia para las dueñas. El aviso que ven las clientas de cada negocio es otro (`/:negocio/privacidad`).
- Los datos de quien opera Nexia están como marcadores en `src/app/features/legal/legal-info.ts` (ver pendientes).

---

## 3. Flujo de la clienta (página pública)

Ruta: `/:negocio/book`. Código: `src/app/features/booking/pages/booking/`.

### Encabezado
- Logo, nombre, descripción y dirección. Si el negocio subió fotos de su trabajo, **la primera se usa como portada** arriba, con un degradado del color de la marca.
- **"Cómo llegar"** (plegado): mapa con el punto del local y botones a **Google Maps** y **Waze**. El mapa se carga solo al abrirlo. Sin punto en el mapa, los botones buscan la dirección escrita y no se muestra mapa (una dirección suelta puede caer en otra ciudad).

### Paso 1. Servicio
- Elige un servicio. Puede filtrar por categoría y sumar servicios extra a la misma cita.
- Si solo una colaboradora hace ese servicio, queda elegida sola. Si hay varias, aparece **"Cualquiera disponible"**.
- Al tocar una colaboradora (o "Cualquiera") avanza sola al paso 2.

### Paso 2. Horario
- **"Lo más pronto":** tres atajos con el primer horario libre de los próximos días.
- El calendario abre en el primer día con lugares, y salta al mes siguiente si el actual está lleno.
- Las horas aparecen agrupadas en Mañana, Tarde y Noche. Al tocar una, avanza al paso 3.
- Si el día no tiene lugares, puede anotarse en la **lista de espera**.
- Si el negocio está **en pausa** o tiene un **cierre** ese día (vacaciones, puente o festivo), la página lo dice y no deja reservar (la API también lo bloquea). Arriba de la página se avisa el próximo cierre solo si empieza en los siguientes 30 días.

### Paso 3. Datos
- Teléfono (10 dígitos), nombre, y correo o nota de forma opcional.
- **Servicios con precio variable (cotización):** campo "Qué necesitas" y hasta 3 **fotos de referencia**, que se comprimen en el celular.
- **Desglose de dinero:** cuánto paga hoy de anticipo, cuánto en la cita y el total, **qué métodos de pago acepta el negocio** ("Aceptamos efectivo y tarjeta") y la política de cancelación.
- Si el negocio **aprueba las citas a mano**, se avisa que revisará la solicitud y confirmará por WhatsApp.
- Aviso de privacidad, y un campo oculto que delata a los bots (*honeypot*).
- Si es clienta frecuente, sus datos ya aparecen llenos (se guardan en su navegador), con un botón "No soy yo" para borrarlos.

### Confirmación
- Si el negocio aprueba a mano: "Recibimos tu solicitud", con el horario ya apartado. La página de la cita muestra lo mismo hasta que la dueña responde.
- Botón de WhatsApp con un mensaje completo para el negocio: servicio, día, hora, colaboradora, nombre, notas, fotos y anticipo.
- **"Agregar a mi calendario":** Google Calendar o archivo `.ics`.
- **Cómo llegar:** al final, el mismo mapa con Google Maps y Waze. También aparece en la página de la cita mientras no haya pasado ni esté cancelada.
- Enlace para ver, cambiar o cancelar la cita (`/:negocio/manage/:token`).
- **Si hay anticipo:** cuenta para transferir, botón para subir el comprobante y la hora hasta la que se guarda el horario.
- **Si alguien ganó el horario** mientras llenaba sus datos: regresa sola al paso 2 con los horarios actualizados y conserva lo que escribió.

### Página de la cita (`/:negocio/manage/:token`)
- Ver, cambiar o cancelar la cita, confirmar asistencia, aceptar la cotización y subir el comprobante de pago.
- Después de la cita (estado completada): **dejar una opinión** con estrellas.

### Otras rutas públicas
- `/:negocio/privacidad`: el aviso de privacidad propio del negocio, o uno genérico si no escribió el suyo.
- `/s/:negocio` (la sirve el backend): enlace para compartir con **vista previa**, con logo y nombre en WhatsApp e Instagram, que redirige a la reserva.

---

## 4. Flujo de la dueña (panel `/admin`)

**Navegación:** en escritorio, un **menú lateral oscuro fijo** con el logo y el nombre del negocio, las secciones en dos bloques (el día a día y "Tu negocio") y, abajo, el tema y la cuenta. En celular hay una barra superior oscura y una barra inferior con **Inicio · Agenda · Clientes · Más**; "Más" abre el mismo menú como cajón.

| Pestaña | Para qué sirve |
|---|---|
| **Inicio** | Ordenado por urgencia. Arriba, **4 números** que llevan a donde se resuelven: citas hoy, **por cobrar hoy** (precio o cotización menos anticipo), sin confirmar y **por resolver**. Después, **"Por resolver"** (aprobar solicitud, revisar comprobante, falta el anticipo; 5 y "Ver más") y la lista "Pon tu negocio en marcha" (oculta, deja solo los avisos como "falta tu CLABE"). Columna principal: **Hoy**, con avance ("3 de 6 atendidas"), la cita de **Ahora** y la que **Sigue**, cada fila abre la cita, WhatsApp para pedir confirmación y **Cobrar** (abre la Agenda ya en el cobro con `?cita=…&cobrar=1`; se vuelve el botón principal cuando la cita ya terminó); las cobradas se quedan atenuadas. Debajo, Avisos (8 por página). Columna lateral: **Mañana** con "Recordar a Ana" uno por uno, cumpleaños, **"Les toca volver"** y **"Esta semana"** (lo cobrado de lunes a hoy contra los mismos días de la semana pasada, con enlace a Reportes). Solo las citas son indispensables: si falla otra petición, su tarjeta queda vacía; si fallan las citas, aparece "Reintentar". |
| **Agenda** | Vistas Mes, Semana y Día. Abre en la **última vista elegida** (la primera vez: Día en celular, Semana en escritorio). La cuadrícula abarca **del turno más temprano al más tarde** del equipo visible, y se amplía si hay citas fuera de turno. Las citas que **coinciden en hora van lado a lado**. Hay una **línea de "ahora"** y, al abrir hoy, la pantalla baja sola a la hora actual. En celular, el Día es una **lista por hora** en lugar de columnas. En Mes, cada día lleva puntos del color de cada colaboradora y el número de citas. **Día libre** cierra el día para la colaboradora del filtro o para todo el equipo: pregunta antes, avisa si ya hay citas y se puede deshacer. Tocar un bloqueo muestra qué es y quién, y quitarlo es un botón aparte. "Cambiar día u hora" ofrece **solo horas libres**. La ficha muestra la fecha legible y el teléfono se toca para llamar. En Nueva cita, servicio, colaboradora y hora van primero en celular, y la clienta se busca por nombre o teléfono. Un color por colaboradora. Permite crear una cita (busca a la clienta por nombre o teléfono), **aprobar o rechazar** las solicitudes "Por aprobar" (se ven con contorno punteado y la etiqueta "Por aprobar" sin abrir la ficha), un **resumen del día** ("6 citas · $3,200 por cobrar"), **cambiar día u hora**, **cobrar y completar** con monto y método de pago (solo los que acepta el negocio, más "Paquete"), pedir la opinión, marcar "no llegó" o cancelar, repetir cada 3 o 4 semanas, bloquear horarios, marcar días libres y compartir una imagen con la disponibilidad del mes. |
| **Clientes** | Una sola lista con **buscador arriba** y **filtros**: Todos, Mejores (por gasto), Dejaron de venir (más de 45 días **y sin cita próxima**, con "Invitar"), Cancelan seguido (2 o más cancelaciones o faltas), Cumpleaños de los próximos 7 días (con "Felicitar") y Con paquete. Orden por nombre, última visita, gasto o visitas. Cada fila dice la **próxima cita** o hace cuánto fue la última. Los 3 números de arriba abren su filtro. **Agregar cliente** a mano (`POST /api/clients`) y **Descargar** la lista en CSV. La ficha (se cierra con Escape): WhatsApp, Llamar, **Nueva cita** (igual que la última si hay), **editar nombre y teléfono** (`PATCH /api/clients/{id}`, 409 si el teléfono ya es de otro), **paquetes** (agregar, ±1 visita y quitar: `PATCH`/`DELETE /api/packages/{id}`), cumpleaños, **notas que se guardan solas** (al salir del campo o al cerrar) e historial, donde una cita pasada sin cobrar dice "Sin cobrar" y no "Próxima". `GET /api/clients` ya **no borra** fichas repetidas al leer (las muestra como una), lee solo las columnas necesarias y trae `next_visit` y `no_show_count`. |
| **Reportes** | Abre en **Mes** y recuerda el último periodo. Arriba, **4 números contra el periodo anterior** (ingresos, ganancia, citas completadas y ticket promedio, con ↑/↓ en %). Debajo: gráfica por día (en "Día" no se dibuja), **cómo te pagaron**, faltas, anticipos pendientes, servicio más pedido **Ocupación** (qué % del horario de trabajo se llenó hasta hoy, en total y por colaboradora, con una sugerencia), **clientas nuevas vs. que regresan**, **servicios que más dejan** (top 5 por ingreso), **días y horas más fuertes** (mapa de calor) y **Resultado** (ingresos − gastos − comisiones, con el **punto de equilibrio**: cuánto hay que ingresar en el periodo para cubrir gastos y comisiones, en pesos y en citas, con barra de avance). Debajo de los 4 números, la **proyección**: "Llevas $X y tienes $Y agendados (N citas); si se cumplen, cierras en ~$Z" (y el % de la meta si hay meta en pesos). Los **gastos llevan categoría** (renta, nómina, insumos, luz/agua/internet, publicidad, otros) y la gráfica de Gastos se agrupa por categoría. Pestaña **Corte de caja**: por día, lo cobrado por método, el efectivo que debe haber, el que se contó, la diferencia ("Faltan $50") y una nota; se guarda un corte por día con historial (`GET/PUT /api/shop/cash`, tabla `cash_counts`). La **meta de ganancia** se esconde hasta que la dueña toca "Poner meta"; puesta, muestra una barra de avance. Pestañas de ingresos por colaboradora, comisiones y gastos. Un solo botón **Descargar** (Excel del periodo, Excel con todo y PDF). Sin movimientos en el periodo, muestra un aviso con "Ir a la agenda" en lugar de ceros. |
| **Servicios** | Lista en el **orden de la página de reservas** (flechas para subir y bajar, `PUT /api/services/order`), buscador (más de 8), chips de categoría y, por servicio: **quién lo hace** (aviso "Nadie lo hace" si está activo sin colaboradora), lo que **deja por hora** en los últimos 90 días ("Más rentable", "Deja poco"), **Pausar/Activar** con texto y "Deshacer", y menú ⋯ con Editar, **Duplicar** (`POST /api/services/{id}/duplicate`, queda pausada) y **Borrar** (`DELETE ...?permanent=true`; con citas responde 409 y pide pausarlo). **Subir precios** en % a todos o una categoría (`POST /api/services/raise`). **Categorías**: renombrar y borrar (sus servicios quedan sin categoría). El formulario va por grupos (lo básico, precio, opciones, tiempo con atajos de 30–120 min, "Opciones avanzadas" cerradas), con **vista previa** de cómo lo ve la clienta, **destacar** ("El más pedido"), **opciones/variantes** con su precio y duración, **limpieza al terminar** y **espera dentro del servicio** (la colaboradora puede atender a otra en ese rato: `busy_spans` en `app/core/booking.py`). |
| **Equipo** | Arriba: activos, **sin horario** (abre Horarios) y **sin servicios**. Cada fila dice su **horario de la semana** ("Lun a vie · 09:00–18:00"), cuántos servicios hace, **sus números del mes** (citas, ventas y % de su meta) y su **color de la agenda**; si está activa y le falta horario o servicios: "No recibe citas: …". Menú ⋯: editar, poner o cambiar su horario, **vacaciones o días libres** (bloquea cada día del periodo solo para ella), ver sus números y **desactivar** (pide confirmación, avisa cuántas citas próximas tiene y se puede deshacer). El formulario va por grupos: **perfil público** (foto, nombre, puesto y **descripción pública**, antes "Notas"), pago (comisión, meta y escalonada), contacto (no se publica), **color en la agenda** (`staff_members.color`; sin elegir, el de la paleta por orden, `src/app/core/staff-colors.ts`) y servicios con **Todos/Ninguno** agrupados por categoría. |
| **Horarios** | Por persona (llega directo con `?staff=ID` desde Equipo). Si no tiene horario guardado lo dice ("no recibe citas") y muestra una sugerencia. Atajos: **plantillas** (Lun a vie 9–18, Lun a sáb 10–20…), **copiar el horario de otra persona** y **usarlo para todo el equipo**. Cada día: abre, cierra, descanso, "Igual que el día anterior" y lo que verán las clientas; los días cerrados quedan en una línea. "Copiar el lunes a los días abiertos". **Opciones avanzadas** (cerradas): solo a horas fijas, para todos los días o uno, cada uno con su propio selector. **Horario especial de un día** (para esta persona o todo el equipo): se guarda como bloqueos antes de abrir y después de cerrar. **La semana del equipo**: quién trabaja cada día y avisa "Nadie trabaja". Barra de guardar fija con "Cambios sin guardar"; avisa al cambiar de persona o salir con cambios. |
| **Mi negocio** | Para atraer clientas. Arriba: **reservas por tu página este mes**, **% que llegan solas** (sin capturarlas; `by_source` del reporte) y **calificación promedio**. "Antes de compartir / Completa tu perfil" con un enlace por pendiente. Enlace con copiar, WhatsApp y **personalizar el enlace** (`PUT /api/settings/slug`; el anterior se guarda en `businesses.old_slugs` y sigue funcionando, la página pública redirige al nuevo). **Kit para compartir**: textos para bio de Instagram, estado y respuesta automática de WhatsApp y Facebook; guías para el botón "Reservar" en Google Maps, Instagram y WhatsApp Business; código de **botón para su sitio web**. **QR generado en la app** (librería `qrcode`, sin servicios externos): descargar en alta calidad y **cartel para imprimir** (carta o media carta). **Opiniones** con promedio, recientes y responder, y el **enlace para opinar en Google** (`businesses.google_review_url`): en su página de la cita, quien califica con 4 o 5 estrellas ve "Opinar en Google". "Cómo te encuentran" con horario general, contacto y "Editar" a su sección. **Ver como clienta**: la página de reservas en un marco de celular. |
| **Configuración** | Ver la sección siguiente. |

### Configuración (`/admin/settings`)
- **Franja de estado arriba:** "Tu página está recibiendo reservas", "Tu página no está tomando citas" o "Cierras del 20 al 27 oct", con un interruptor y el botón **"Ver mi página"**.
- **La pausa se aplica al momento:** el interruptor (arriba o en Pausa y vacaciones) guarda solo `bookings_paused`, sin arrastrar otros cambios pendientes, y avisa con un mensaje.
- **Vista previa en vivo** (solo en pantallas muy anchas, 1536 px o más): a la derecha, el encabezado de la página de reservas con lo que se lleva escrito, sin guardar: portada, logo, nombre, color, anuncio, pausa o próximo cierre, métodos de pago y un servicio de ejemplo. El índice lateral de secciones se queda siempre en escritorio; los chips son solo para celular.
- **Llegar directo a lo que falta:** `/admin/settings?sec=anticipo` abre y baja a esa sección. Los avisos de Inicio y Mi negocio usan esa dirección.
- **Nueve secciones**, cada una con un **resumen visible aunque esté cerrada** (por ejemplo, "$200 · 3 h para pagar · falta la cuenta"):
  1. **Tu negocio:** nombre, tipo, descripción, WhatsApp (10 dígitos), dirección, redes y **ubicación en el mapa** (ver "Ubicación del local").
  2. **Apariencia:** logo, **colores del logo** (se sacan al subirlo; cada uno se asigna a botones, detalles o fondo), color de **botones**, de **detalles** (chips, horas y tarjetas elegidas) y de **fondo**, **temas listos** (Claro, Suave, Intenso), **forma** de botones (píldora, redondeado, recto), **relleno** (sólido o contorno), **letra** (moderna, elegante, cálida) y **encabezado** (con portada, de color o liso). El texto de los botones se pone blanco u oscuro solo, según el color (`src/app/core/theme.ts`), y avisa si el color casi no se ve sobre el fondo. **Vista previa en vivo** en un mini celular, en todas las pantallas. Fotos del trabajo (hasta 3). Se guarda en `businesses.accent_color`, `canvas_color`, `button_shape`, `button_fill`, `font_style` y `header_style`; la página de reservas los lee como variables de CSS (`--booking-on`, `--booking-accent`, `--booking-radius`).
  3. **Reglas de reserva:** opciones rápidas en vez de números sueltos (anticipación, días a futuro, tiempo entre citas, hasta cuándo cancelar), **aprobar cada cita a mano**, mensaje sobre cancelaciones, zona horaria y salas o equipos.
  4. **Anticipo y pagos:** **métodos de pago que acepta** (efectivo, transferencia, tarjeta; al menos uno), monto fijo, porcentaje para servicios por cotizar, cuenta o CLABE, tiempo para pagarlo y enlace de pago. **Avisa si falta la CLABE**, porque sin ella el anticipo no se cobra.
  5. **Promociones:** anuncio en la página (con fecha de fin), premio por visitas y cupones.
  6. **Mensajes de WhatsApp:** los textos editables. Ver más abajo.
  7. **Pausa, vacaciones y festivos:** "No tomar citas por ahora" y una **lista de cierres** (un día o un periodo, con nombre). Sugiere los **días festivos de México** de los próximos 12 meses (oficiales, Semana Santa, Día de Muertos, 12 de diciembre…), uno por uno o "Cerrar todos", y permite limpiar los cierres que ya pasaron.
  8. **Avisos por correo:** qué avisos le llegan a la dueña (ver más abajo).
  9. **Privacidad y datos:** aviso de privacidad propio y "Descargar copia".
- **Un solo guardado:** todo va en una petición (`PATCH /api/settings/business`).
- **Barra de cambios:** solo aparece si hay algo por guardar ("3 cambios sin guardar · Descartar · Guardar cambios"). Si intentas salir de la pantalla o cerrar la pestaña con cambios, pregunta antes.
- **Errores:** al guardar con errores, la pantalla te lleva a la primera sección con problemas; si el error viene del servidor, abre la sección del campo que falló. En escritorio hay un índice lateral, y en celular una fila de chips deslizable; ambos marcan las secciones con errores o con un dato faltante.
- **Nada se descarta sin avisar:** cupón sin código, repetido o con un porcentaje fuera de rango; premio por visitas incompleto; anuncio con fecha ya pasada; anticipo negativo; foto que ya no cabe. Cada caso muestra su error y bloquea el guardado.
- **Fotos:** botón para quitar (visible también en celular) y flecha para cambiar el orden; la primera es la que más se ve.
- **Facebook:** basta con el nombre de la página; se guarda como `facebook.com/nombre`.
- **Contador de cambios:** cambiar el color cuenta como un solo cambio (el fondo derivado ya no suma).

### Mensajes de WhatsApp
- **De dónde salen:** los 16 mensajes que la dueña manda desde el panel (recordatorio, cita agendada, solicitud aprobada, solicitud rechazada, te toca volver, anticipo recibido, comprobante ilegible, cotización, escribirle por su cita, citas repetidas, pedir opinión, cumpleaños, te extrañamos, ofrecer horario libre, lista de espera y compartir enlace) salen de plantillas en `src/app/core/message-templates.ts`.
- **Cómo se editan:** en Configuración, con botones para insertar variables (`{nombre}`, `{servicio}`, `{dia}`, `{hora}`, `{equipo}`, `{enlace}`…), vista previa tipo burbuja de WhatsApp y "Volver al de fábrica". El backend guarda solo los que cambian (`businesses.message_templates`) y no los expone en la página pública.
- **Reglas al llenarlos:**
  - `{nombre}` vacío se quita y se acomoda la puntuación ("¡Hola!");
  - cualquier otra variable vacía quita su línea entera;
  - las fechas salen como "jueves 16 de octubre";
  - a los números de 10 dígitos se les antepone el 52.
- **Para agregar un mensaje nuevo:** súmalo a `MESSAGE_TEMPLATES` y a `MESSAGE_KEYS` (`app/core/messages.py`), y ármalo con `copy.message(clave, datos)` y `whatsappLink(teléfono, texto)`.
- Los 2 mensajes que la clienta escribe al negocio desde la página de reservas no son editables.

### En pausa (código listo, oculto)
Están programados y probados, pero **apagados y sin mostrarse** hasta decidir encenderlos. En el código se buscan con `FUTURE_PHASE_WHATSAPP` y `FUTURE_PHASE_SPEI`. (El inventario ya se encendió.)
- **WhatsApp automático** (recordatorios con botones e invitación automática de "Te toca"): el ciclo y el webhook están comentados en `app/main.py`, y el bloque "Envío automático" está comentado en Configuración. Las columnas (`auto_reminders`, `reminder_hours`, `auto_return`) existen, pero no hacen nada.
- **Anticipo con Banxico:** `SPEI_CHECK=false` por defecto, así que la API responde `spei_check=false`. Están comentados el botón "Ya transferí" (confirmación y página de la cita) y el aviso de CLABE en Configuración.
- **Para encenderlos:** descomentar esos bloques y, para SPEI, poner `SPEI_CHECK=true`. Antes, hacer lo de "Para encender lo automático" en la sección 9.

### Recordatorios automáticos con "Confirmo / Cambiar" (en pausa)
- **Qué hace:** si la dueña lo enciende (Configuración → Mensajes → Envío automático), cada cita agendada recibe un WhatsApp **1 día, 12 h o 3 h antes** con dos botones. **"Confirmo"** marca la cita como confirmada en la agenda (aviso "confirmó por WhatsApp") y le responde a la clienta. **"Cambiar"** le manda su enlace para moverla o cancelarla.
- **Cómo funciona:** el ciclo de 10 minutos de la API (`app/core/auto_messages.py`) busca citas `scheduled`, ya aprobadas, sin `reminder_sent_at` y dentro de la ventana. No recuerda las agendadas hace menos de 2 h. Manda la plantilla `nexia_recordatorio` con los botones `confirm:<token>` y `change:<token>`. El webhook `POST /api/whatsapp/webhook` (`app/routers/whatsapp.py`) recibe el botón; valida la firma de Meta con `WHATSAPP_APP_SECRET`.
- **Requisito:** la API oficial de WhatsApp conectada en el servidor (`app/core/whatsapp.py`, variables en `.env.example`). Sin ella, Configuración dice "Aún no está conectada" y nada sale; los recordatorios uno por uno desde Inicio siguen igual.

### "Te toca volver"
- **De dónde sale:** cada servicio tiene "Vuelven cada (días)" (`services.return_days`). Si está vacío, se calcula con el historial del negocio: la mediana de días entre visitas de la misma clienta a ese servicio, con al menos 3 casos, entre 7 y 180 días (`app/core/returns.py`).
- **A quién:** la última visita completada de cada clienta por servicio. Aparece 3 días antes de que le toque y hasta 60 días después (más tarde ya está en "Dejaron de venir"). No aparece si ya tiene una cita próxima.
- **Horario sugerido:** el primer horario libre con la misma colaboradora desde el día que le toca (busca 14 días).
- **En Inicio:** tarjeta "Les toca volver" con **Invitar** por WhatsApp (mensaje `due`, con el día y hora sugeridos). Al tocarlo queda marcada (`appointments.return_invited`) y baja en la lista. API: `GET /api/clients/due` y `POST /api/clients/due/{cita}/invited`.
- **Automático (en pausa):** con "Te toca volver" encendido en Envío automático, el día que le toca saldría la plantilla `nexia_te_toca`, una sola vez por visita.

### Anticipo confirmado con Banxico (SPEI) (en pausa)
- **Cuándo aplica:** la cuenta del anticipo es una **CLABE válida** (18 dígitos con dígito verificador y banco conocido) y `SPEI_CHECK` está encendido. Configuración lo indica junto al campo.
- **Qué hace la clienta:** en la confirmación o en su página de cita, "Ya transferí: confirmar al instante". Pone banco de origen, **clave de rastreo**, fecha y monto (`src/app/shared/components/spei-check/`).
- **Qué hace la API:** `POST /api/public/appointments/{token}/spei` consulta el **CEP de Banxico** (`app/core/spei.py`: `valida.do` y luego `descarga.do?formato=XML`). Si la transferencia existe, llegó a la CLABE del negocio y es por el anticipo o más, la cita pasa a `scheduled` sola, se guarda la clave (`appointments.spei_tracking`, no se puede usar dos veces) y la dueña recibe el aviso "Banxico confirmó el anticipo".
- **Si algo falla:** si Banxico aún no la encuentra (a veces tarda minutos), si no responde o si el monto o la cuenta no cuadran, se dice por qué y la clienta puede subir la captura como antes.
- **Bancos:** la lista vive en `app/core/spei.py` y `src/app/core/spei-banks.ts` (clave de participante SPEI).

### Avisos por correo a la dueña
- **Qué llega:** los mismos avisos de Inicio, ahora también por correo (cita nueva, cancelación, cambio de horario, comprobante o pago de anticipo, anticipo vencido, lista de espera y confirmación), cada uno con el botón "Ver en mi agenda". Más un **resumen de las citas de mañana a las 8 p. m.**, hora del negocio.
- **Configuración:** la dueña elige cuáles en Configuración → Avisos por correo. Todos vienen encendidos menos las confirmaciones.
- **Cómo funciona** (`app/core/alerts.py`):
  - cada aviso (`add_notice`) lleva un tipo;
  - el correo se encola en la sesión y **sale solo si el commit se confirma**, en un hilo aparte para no hacer esperar a la clienta;
  - lo que provoca la propia dueña desde el panel no manda correo.
- **El resumen** lo revisa un ciclo cada 10 minutos dentro de la API; en el plan gratis de Render, si la API está dormida, sale cuando despierta.

### Qué le falta al negocio
- **Una sola lista** para Inicio y Mi negocio (`app/core/readiness.py`, `GET /api/settings/readiness`), con tres tipos de paso:
  - **para poder reservar:** servicios activos, equipo, horarios y compartir el enlace;
  - **para dar confianza:** logo, descripción, dirección e Instagram;
  - **avisos:** "falta tu CLABE" o "tu página está en pausa". Se muestran en Inicio aunque se haya ocultado la lista.
- Cada paso trae `section` (la sección de Configuración donde se resuelve), y el enlace se arma con `?sec=…`.
- **"Comparte tu enlace"** se guarda en el negocio (`link_shared`), no en el navegador.

### Ubicación del local
- **Dónde se guarda:** `businesses.latitude` y `businesses.longitude` (van juntas o ninguna; la API responde 422 si llega solo una). Salen en `GET /api/businesses/{slug}` y en la página de la cita (`address`, `latitude`, `longitude`).
- **Dos proveedores, según haya llave.** Con `GOOGLE_MAPS_KEY` (`src/app/core/config/google-maps.ts`) todo es de **Google Maps**, que tiene los datos más completos y al día de México. Sin llave se usa **OpenStreetMap**, gratis pero con menos detalle.
- **Cómo la marca la dueña** (Configuración → Tu negocio):
  - **Con Google** (`src/app/shared/components/google-map-picker/`): buscador de Google (Places, `PlaceAutocompleteElement`, solo México: encuentra direcciones y negocios por nombre), **"Estoy en el local"** o tocar el mapa; el pin se arrastra (`AdvancedMarkerElement`, necesita `GOOGLE_MAP_ID`). El script se carga solo en esa pantalla (`src/app/core/google-maps.ts`).
  - **Sin llave** (`src/app/shared/components/map-picker/`): Leaflet con OpenStreetMap; busca con Nominatim o lee el punto de un enlace largo de Google Maps (`pointFromLink`). Su CSS va dentro del componente (por eso el límite de estilos por componente subió a 12 kB).
  - En los dos, el punto se guarda con el botón de siempre.
- **Lo que ve la clienta** (`src/app/shared/components/place-map/`, enlaces en `src/app/core/maps.ts`): un **mapa fijo**, sin librería ni iframe, para que cargue rápido en celular: con llave, una sola imagen de Google (Maps Static API, `googleStaticMapUrl`, pin del color de la marca); sin llave o si esa imagen falla, 15 imágenes de OpenStreetMap (`staticMap`). Tocarlo abre Google Maps; debajo, botones a Google Maps y Waze.
- **Para encender Google:**
  1. En Google Cloud, crear un proyecto con facturación y activar **Maps JavaScript API**, **Maps Static API** y **Places API (New)**.
  2. Crear una llave y **restringirla** a "Sitios web" (el dominio de Vercel y `localhost:*`) y a esas 3 APIs. Va en el navegador, así que la restricción es lo que la protege.
  3. En Gestión de mapas, crear un **ID de mapa** de tipo JavaScript y ponerlo en `GOOGLE_MAP_ID` (`DEMO_MAP_ID` solo sirve para probar).
  4. **Costo:** desde marzo de 2025, cada API tiene un tope mensual gratis (unas 10,000 cargas de mapa, de mapa fijo y de búsquedas); con pocos negocios no se paga. Poner una alerta de presupuesto en Google Cloud.
- **Qué le falta:** el paso "Marca tu local en el mapa" (`location`) se suma a "para dar confianza".

### Comisiones (encender o apagar)
- **Dónde:** `businesses.uses_commissions`. Se elige al registrarse y se cambia en Configuración → Tu negocio ("Le pago comisión a mi equipo"). Los negocios que ya existían quedan encendidos.
- **Apagado:** Equipo no muestra el % ni la comisión escalonada (la meta de venta sí); Reportes esconde la pestaña Comisiones, el aviso de "comisión por pagar", la línea de Comisiones en Resultado, la columna en "Lo que deja cada servicio" y la hoja del Excel. El backend calcula todo con 0% aunque haya porcentajes guardados (`pays` en `app/routers/shop.py`), así que la ganancia y el punto de equilibrio no restan comisiones, y el correo mensual no las menciona. La página pública no expone la opción.
- **En el panel:** `BusinessCopy.commissions()` (se llena desde `GET /api/businesses/me`).

### Métodos de pago
- Se guardan en `businesses.payment_methods` (JSON); vacío significa los tres. Lógica en `app/core/payment_methods.py` y `src/app/core/payment-methods.ts`.
- **Paquete** no se elige: es pagar con visitas de un paquete y siempre aparece al cobrar.
- Reportes agrupa por el método con que se cobró cada cita, con las mismas etiquetas; si un método se desactiva, sus cobros pasados siguen apareciendo.

### Cierres y días festivos
- Se guardan en `businesses.closures` (JSON `[{from, to, label}]`, hasta 40, ordenados). Los cierres de un día son festivos; los de varios días, vacaciones.
- Al arrancar, `init_db` pasa el cierre único viejo (`closed_from`/`closed_to`) a la lista con el nombre "Vacaciones".
- Los festivos se calculan en el navegador (`src/app/core/holidays.ts`, Semana Santa con el algoritmo de Pascua); el backend solo guarda lo que la dueña eligió.

### Aprobar citas a mano
- Interruptor en Reglas de reserva (`businesses.approve_bookings`). Con él encendido, cada reserva de la página se crea con `needs_approval = true`: **el horario queda apartado** (nadie más lo toma) y el aviso dice "pidió … · falta que la apruebes".
- En Agenda: **Aprobar** (`POST /api/appointments/{id}/approve`) abre el WhatsApp "Solicitud aprobada"; **Rechazar** cancela la cita (con "Deshacer") y abre el WhatsApp "Solicitud rechazada" con el enlace para reservar otro horario.
- Si la reserva también pide anticipo, ambos procesos van por separado: aprobar no marca el anticipo como recibido.
- Las citas que crea la dueña nunca quedan por aprobar.

### Ciclo de una cita
```
Reserva (clienta o dueña)
  ├─ si el negocio aprueba a mano → needs_approval ── Aprobar / Rechazar (cancela)
  ├─ con anticipo → awaiting_deposit ── comprobante ── la dueña acepta ──┐
  └─ sin anticipo → scheduled ←────────────────────────────────────────┘
        ├─ recordatorio (Inicio) → la clienta confirma (client_confirmed)
        ├─ cambiar hora / cancelar / no llegó
        └─ Cobrar y completar → completed (precio final + método) → pedir opinión
```
- Si el anticipo no llega en `deposit_hold_hours` (3 h por defecto), el horario se libera solo, **salvo** que la clienta ya haya subido comprobante o dicho "Ya pagué": entonces espera a que la dueña lo revise.
- **"Ya pagué"** (cuando el negocio tiene enlace de pago) **no confirma la cita**: marca `paid_claim`, avisa a la dueña ("dice que ya pagó: revisa tu cuenta") y en Agenda aparece "Dice que pagó". La dueña la acepta con "Depósito recibido" después de revisar su cuenta.
- Las fotos de referencia se borran automáticamente 30 días después de la cita.

### Otras funciones del panel
- **Ficha de la cita como hoja deslizable** en celular, con Cobrar, WhatsApp y Mover al alcance del pulgar.
- **Deshacer al cancelar:** aparece "Cita cancelada · Deshacer" durante 5 segundos, en lugar de pedir confirmación antes.
- **Cambios al instante:** la cita se ve cobrada, movida o cancelada sin esperar a que la agenda se recargue.
- **Cobro con anticipo:** el campo es el **precio del servicio** (se guarda completo en `final_price` y es lo que cuenta en Reportes), y el resumen resta el anticipo ya pagado: "Anticipo ya pagado −$200 · **Cobra ahora $300**". El botón dice lo que se cobra en caja.
- **Cobro completo:** monto, método de pago, **propina** (se suma a la comisión de la colaboradora), **productos vendidos** y **nota privada de la visita**. La nota aparece como "Última visita" la próxima vez que se abre una cita de esa clienta.
- **Cotizar en un paso:** desde el aviso se abre la cita con las fotos de referencia y el precio, y queda listo el WhatsApp con el precio.
- **Repetir la última cita** desde la ficha de la clienta: mismo servicio y misma colaboradora, solo falta elegir el día.
- **Cumpleaños:** fecha opcional en la ficha; Inicio y Clientes avisan el día del cumpleaños con un WhatsApp de felicitación listo.
- **Promociones:** **cupones** por código (con opción de que solo valgan en la primera visita) y **premio por visitas** (cada N visitas cobradas, la siguiente tiene X% de descuento). El descuento lo calcula el backend al reservar y se guarda en `discount_percent`.
- **Página de reservas:** la tarjeta "Tus próximas citas" (tomadas de los enlaces guardados en el dispositivo; no hay búsqueda por teléfono, por seguridad), y la foto, el puesto y la descripción de cada colaboradora, junto con la calificación general del negocio.
- **El panel se instala como app (PWA)** y tiene **modo oscuro** (Claro, Oscuro o Sistema); la página pública de reservas siempre se ve en claro.
- **Datos de ejemplo** con un botón (Inicio → "Llenar con ejemplo"), para demos. Reutiliza los servicios sugeridos en vez de duplicarlos, y al quitarlos los vuelve a apagar.

---

## 5. Seguridad y protección

- **Arranque seguro:** con `ENVIRONMENT=production`, la API no arranca si `JWT_SECRET` es el de ejemplo, si `COOKIE_SECURE` es falso, si la base es SQLite o si `FRONTEND_URL` no usa `https`. Si falta `RESEND_API_KEY`, avisa en el log.
- **Contra citas falsas:**
  - campo trampa (*honeypot*);
  - máximo 6 intentos por **negocio + IP** cada 10 minutos (en memoria, `app/core/throttle.py`);
  - máximo 3 citas próximas por teléfono.
- **Contra registros en masa y abuso de cuentas:** registro, "olvidé mi contraseña" y restablecer usan el mismo límite por IP.
- **IP real:** el primer valor de `X-Forwarded-For` lo puede inventar cualquiera, así que la IP se lee contando desde la derecha `TRUSTED_PROXY_HOPS` saltos (0 en local; 2 detrás de Vercel → Render).
- **Cookie de sesión:** respeta `COOKIE_SECURE` y `COOKIE_SAMESITE` del `.env` al iniciar sesión, al registrarse, al restablecer la contraseña y al cerrar sesión.
- **Tokens separados:** un enlace de recuperación no sirve como sesión, ni una sesión como enlace de recuperación.
- **Enlaces en correos:** se arman con la dirección desde la que se abrió la app solo si es de confianza (`app/core/origins.py`): en local, cualquier `localhost`; en producción, únicamente `FRONTEND_URL`. Así nadie puede mandarte un enlace de recuperación a un sitio falso.
- **CORS:** en producción solo se acepta el dominio de `FRONTEND_URL`; en desarrollo, cualquier puerto de `localhost`.
- **Pausa y cierres:** la API también los respeta (disponibilidad, reservas y cambios de cita de la clienta) con `app/core/shop_note.py`. Las citas que crea la dueña no se bloquean.
- **Validaciones en la API:** teléfono de 10 dígitos, enlace de pago con `https://`, fechas de cierre completas y en orden, fotos solo como imágenes pequeñas (hasta 3), mensajes de hasta 1000 caracteres.
- **Privacidad:** aviso por negocio; borrar los datos de un cliente desde su ficha (sus citas pasadas quedan anónimas); las fotos de referencia se borran a los 30 días; los datos de la clienta se recuerdan solo en su propio dispositivo; los mensajes personalizados de la dueña no salen en la página pública.
- **Monitoreo opcional:** si se define `SENTRY_DSN` en el `.env` (requiere instalar `sentry-sdk`), los errores llegan a Sentry.

---

## 6. Diseño (frontend)

El sistema de diseño está en `src/styles.css`. Usa **siempre** estos nombres y no colores sueltos:

- **Colores:** `bg-canvas`, `bg-surface`, `border-line`, `border-line-strong`, `text-ink`, `text-ink-soft`, `text-muted`, `accent` (`text-accent`, `bg-accent-soft`). El color de marca de cada negocio es `--primary`.
- **Tamaños de letra:** el cuerpo es de **15 px** (`text-sm` está redefinido a 0.9375rem en `@theme`) y lo más chico de 13 px (`text-xs`). Ayudas, etiquetas y chips van a 14 px. Botones y campos miden 44 px de alto. No bajes de `text-xs`.
- **Contraste:** `text-muted` (#6b645e) cumple 4.5:1 sobre blanco y sobre el fondo del panel (#f2efeb). Si cambias un gris o el fondo, revisa que siga cumpliendo.
- **Enfoque:** al navegar con teclado, enlaces, botones, interruptores y selectores muestran un anillo del color de la marca (`:focus-visible`). Los campos usan su propio borde con halo.
- **Estructura:** `.page-head` (encabezado de página), `.card` (con sombra suave, `--nx-card-shadow`) y `.card-title` (15 px, en letra normal y sin mayúsculas, con una rayita del color de la marca), `.card-head` + `.sec-icon` (título con ícono), `.card-tint` (tarjeta destacada con tinte de la marca).
- **Números:** `.stat` con `.stat-icon` y un color según el estado (`stat-accent`, `-ok`, `-warn`, `-bad`, `-info`), más `.stat-value` y `.stat-label`.
- **Listas y personas:** `.avatar` (iniciales con el tono de la marca), `.row-hover` (filas tocables).
- **Formularios del panel:** `.label` + `.input`, `.chip` / `.chip-on` (opciones rápidas) y `.switch` (interruptor con `role="switch"` y `aria-checked`). En login y registro: `.field`, `.field-label`, `.field-input`, `.field-hint` y `.field-error`.
- **Botones y etiquetas:** `.btn` con `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-danger` y `btn-whatsapp`; `.badge-ok`, `-warn`, `-bad`, `-info` y `-neutral`; `.empty` (pantalla vacía) y `.nums` (números alineados).
- **Menú lateral:** `.nx-rail`, `.nx-rail-link`, `.nx-rail-on` y tokens `--nx-rail-*`.
- **Ayudas bajo demanda:** en un formulario con `class="nx-quiet"` (Configuración), la ayuda de cada campo (`span.field-hint` junto al campo) se esconde y aparece al enfocarlo; la etiqueta lleva un ⓘ. Los errores, los avisos y las descripciones de interruptores (`p.field-hint`) se ven siempre. Si una ayuda debe verse siempre, usa `p` en lugar de `span`.
- **Avisos en páginas públicas:** usan los mismos tokens que el panel (`badge-ok`, `-warn`, `-info`, `--nx-bad-fg`, `bg-accent-soft`), no colores sueltos de Tailwind (`rose-50`, `amber-50`, `emerald-700`…).
- **Espacio:** 24 px entre tarjetas (`gap-6`, `mb-6`) en Inicio; 16 px entre secciones de Configuración. Las cifras que se buscan con la mirada van más grandes: horas en la lista del día (`text-base`), monto al cobrar (`text-lg`) y montos de Reportes (`text-base font-semibold`).
- **Huecos:** para tarjetas de alturas distintas lado a lado, usa columnas independientes (`grid items-start` con un `flex flex-col gap-4` por columna), no una rejilla de filas.
- **Modo oscuro:** solo con tokens; no agregues `bg-white`. Los menús desplegables viven fuera del panel, así que también deben usar `bg-surface`.
- **Confirmaciones:** el servicio `Confirm` (`src/app/shared/components/confirm/`). No usar `window.confirm`.
- **Textos para cualquier negocio:** nada de un giro en particular ni en femenino. Se dice "cliente/clientes" (o `copy.text().client` cuando el giro lo cambia: paciente, tutor, alumno), "tu equipo" o `copy.text().person` para el personal, y los ejemplos (nombre del negocio, descripción, servicio, descripción del personal) salen de `examplesFor(giro)` en `src/app/core/business-kinds.ts`.
- **Tipografía:** Plus Jakarta Sans. **Íconos:** Material Symbols (`<mat-icon>`). Sin emojis en la interfaz; en los mensajes de WhatsApp sí se usan.

---

## 7. Desarrollo local

```bash
# Backend
cd nexia-backend
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
.venv/bin/python -m pytest tests          # pruebas (base temporal; no tocan tus datos)
.venv/bin/python scripts/backup_db.py      # respaldo manual

# Frontend
cd nexia-frontend
npx ng serve --port 4200
npx ng test --watch=false
```

- **Variables de entorno:** están explicadas en `nexia-backend/.env.example`. Las más recientes son las de WhatsApp (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`) y `SPEI_CHECK`.
- **Correos en local:** sin `RESEND_API_KEY` no se envían; se escriben en la terminal del backend, con su enlace, para probar recuperar contraseña o los avisos.
- **El puerto del frontend puede ser cualquiera.** Los enlaces que arma el backend (correos y `/s/:negocio`) usan la dirección desde la que se abrió la app.
- **Migraciones:** las columnas nuevas se agregan solas al arrancar (`app/db/init_db.py`); no hay herramienta de migraciones. Ahí también se pasan a sus columnas los datos que quedaron con el formato viejo, empaquetados dentro de `resources`.
- **Zona horaria:** las citas se guardan como hora local del negocio, sin zona. Para "ahora" y "hoy" usa siempre `local_now(business)` / `local_today(business)` de `app/core/clock.py`, nunca `datetime.now()` ni `date.today()`: el servidor corre en UTC. La zona se toma del navegador al registrarse y se cambia en Configuración → Reglas de reserva.
- **Piezas del backend que conviene conocer** (`app/core/`):

  | Archivo | Para qué |
  |---|---|
  | `clock.py` | Hora local de cada negocio |
  | `throttle.py` | Límite de intentos por IP |
  | `origins.py` | Dirección de confianza para enlaces |
  | `mailer.py`, `emails.py` | Envío con Resend y textos de los correos |
  | `alerts.py` | Avisos por correo y resumen diario |
  | `readiness.py` | Qué le falta al negocio |
  | `shop_note.py` | Pausa y lista de cierres |
  | `payment_methods.py` | Métodos de pago que acepta el negocio |
  | `whatsapp.py` | Envío por la API oficial de WhatsApp |
  | `auto_messages.py` | Recordatorios y "Te toca" automáticos |
  | `returns.py` | A quién le toca volver y horario sugerido |
  | `spei.py` | CLABE y verificación con el CEP de Banxico |
  | `catalog.py` | Giros, etiqueta del personal y servicios sugeridos |
  | `messages.py` | Claves de los mensajes de WhatsApp |

---

## 8. Publicación (plan actual)

| Pieza | Para demos ($0) | Para negocios reales |
|---|---|---|
| Frontend | Vercel | Vercel |
| API | Render (plan gratis; se duerme tras unos 15 minutos sin uso) | Railway (~$5 USD/mes) o un plan de pago de Render |
| Base | Neon (PostgreSQL gratis) | La base de Railway o un plan de pago |
| Correo | Resend (plan gratis) | Resend con dominio propio |

- **Todos los negocios usan la misma instalación**; cada uno se registra en `/auth/register`.
- **Ya está listo:** `render.yaml` (con `TRUSTED_PROXY_HOPS=2`), el endpoint `/api/health`, la compatibilidad con PostgreSQL y `vercel.json`, que apunta a `https://nexia-api.onrender.com`. Los pasos están en `nexia-backend/DEPLOY.md`.
- **Pendiente antes de las demos:**
  - confirmar en los logs de Render que `X-Forwarded-For` llega como `clienta, vercel` (si llega con otro número de saltos, ajustar `TRUSTED_PROXY_HOPS`);
  - ajustar `render.yaml` para usar Neon como base.
- **Riesgo que queda:** quien llame directo a `nexia-api.onrender.com` (sin pasar por Vercel) todavía puede inventar la IP. Cerrarlo del todo pide un proxy propio que agregue un encabezado secreto, o poner Cloudflare delante.
- **Correo en producción:** crear cuenta en Resend, verificar el dominio y poner `RESEND_API_KEY` y `MAIL_FROM` (p. ej. `Nexia <hola@tudominio.mx>`) en Render. Sin dominio verificado, Resend solo entrega a tu propio correo.
- **Resumen diario:** en el plan gratis de Render llega tarde si la API está dormida a las 8 p. m.; en un plan de pago sale a tiempo.
- **Respaldos:** programar `scripts/backup_db.py` cada día y guardar las copias fuera del servidor.

---

## 9. Pendientes y planes futuros

**Antes de abrir a negocios reales**
- Llenar razón social, domicilio, correo y ciudad en `src/app/features/legal/legal-info.ts`, y pedir a un abogado que revise `/terminos` y `/privacidad`. La sección "Precio del servicio" de los términos es genérica: confirmar si Nexia va a cobrar.
- Configurar Resend con el dominio y verificar `TRUSTED_PROXY_HOPS` en Render (ver la sección 8).
- Crear la llave de Google Maps y el ID de mapa (ver "Ubicación del local" en la sección 4) y probar en el navegador el buscador, el pin y el mapa fijo.
- Recorrer en el navegador: el registro en celular, recuperar contraseña con un correo real y los menús del selector de hora en modo oscuro.

**Para encender lo automático** (hoy en pausa; ver "En pausa" en la sección 4)
- Crear la app de Meta y conectar un número de WhatsApp Business. Aprobar las plantillas `nexia_recordatorio` (con los botones rápidos "Confirmo" y "Cambiar") y `nexia_te_toca` (textos en `.env.example`). Registrar el webhook `/api/whatsapp/webhook` y poner las 4 variables en Render. Cada plantilla enviada tiene costo en Meta.
- **Plan de pago:** el envío automático es el candidato natural. Hoy cualquier negocio lo puede encender; falta el cobro y limitarlo a ese plan.
- **SPEI:** probar con una transferencia real y su clave de rastreo. El CEP es el formulario público de Banxico; si cambia su formato, ajustar `app/core/spei.py`. Otra opción más estable es un proveedor con webhook de depósitos (por ejemplo, una CLABE por negocio en STP).

**Siguientes mejoras de Configuración** (en este orden)
1. **Regla para clientas que faltan:** pedir anticipo de forma automática a quien falta seguido.
2. ~~**Enlace personalizado**~~ (hecho: Mi negocio → Personalizar el enlace).
3. **Tope de citas por día** (por negocio o por colaboradora) y **qué pasa con el anticipo si la clienta cancela**.
4. **Mensajes agrupados** por momento (antes de la cita, después, para atraer clientas).

**Corto plazo**
- Una sola opinión por cita.
- **Inicio:** cumpleaños desde el backend (hoy descarga todas las clientas para filtrar), avisos con tipo y "visto" en lugar de leer el texto con expresiones regulares, y "Ocultar" la lista de arranque guardado en el negocio (hoy en el navegador).
- Limpiar el código muerto: formularios con `@if (false…)`, la sección de huecos de Inicio y el código de reseñas sin usar en la página de reservas.
- Pasar el límite de intentos a Redis si algún día hay varios servidores.
- Que la agenda use la zona horaria del negocio y no la del navegador (hoy coinciden casi siempre).

**Según lo que pidan los primeros negocios** (ya hechos: notas por visita, propinas, venta de productos al cobrar, cupones, premio por visitas, cumpleaños, PWA, modo oscuro, avisos por correo, mensajes editables, métodos de pago, cierres con festivos y aprobar citas a mano)
- Formularios de ingreso y consentimiento (consultorios, spas, tatuajes).
- Clases con cupo visible ("quedan 3 lugares").
- Paquetes y membresías a la venta desde la página de reservas.
- Sincronización con Google Calendar para cada colaboradora.
- Recordatorios automáticos con la API oficial de WhatsApp Business (con costo por mensaje).
- Varias sucursales por dueño.
- Botón "Reservar" en Google Maps e Instagram.
- Guardar las fotos en un servicio de archivos (S3 o similar) en lugar de dentro de la base, cuando crezca el volumen.

---

## 10. Historial de cambios

### 15 de octubre de 2026

| Repositorio | Commit | Qué cambió |
|---|---|---|
| backend | `7493b8c` | **Cuentas.** Registro en una transacción (perfil, giro, zona horaria, términos, servicios sugeridos apagados), vista previa del slug, slugs reservados, recuperar contraseña por correo, correo de bienvenida con Resend, enlaces con la dirección de confianza, cookie que respeta `COOKIE_SECURE`, límite por IP que no se puede falsificar (`TRUSTED_PROXY_HOPS`). |
| backend | `9f1f995` | **Zona horaria.** "Ahora" y "hoy" en la hora de cada negocio en todo el backend (antes usaba la del servidor, en UTC). |
| backend | `7bb6e50` | **Configuración y avisos.** Un solo guardado con validaciones, pausa y vacaciones respetadas por la API, avisos por correo a la dueña con resumen diario, lista única de "qué te falta", datos de ejemplo sin duplicar servicios. |
| backend | `02262e9` | **Columnas propias** para pausa, cierre, anuncio y fotos (antes iban empaquetados en `resources`), con migración automática. |
| backend | `e59321d` | **Mensajes de WhatsApp** personalizados guardados por negocio. |
| frontend | `1752dee` | **Registro en una pantalla**, recuperar contraseña desde el login, `/auth/restablecer`, páginas `/terminos` y `/privacidad`, `guestGuard`, tipos de negocio compartidos. |
| frontend | `1abc25e` | **Rediseño del panel:** menú lateral oscuro, fondo con más tono, tarjetas con sombra e íconos de color, todas las pantallas sin huecos, arreglos de modo oscuro. |
| frontend | `e80014d` | **Configuración nueva** (franja de estado, secciones con resumen, opciones rápidas, barra de cambios, aviso al salir), sección de avisos por correo, Inicio y Mi negocio con la misma lista. |
| frontend | `4c6d592` | La página de reservas y Configuración leen pausa, cierre, anuncio y fotos de sus campos nuevos. |
| frontend | `7748e79` | **Mensajes de WhatsApp editables** con variables y vista previa; textos unificados, fechas legibles y prefijo 52 en todos los números. |

Pruebas al cerrar el día: backend 40, frontend 26, todas pasando.

### 16 de octubre de 2026

| Repositorio | Commit | Qué cambió |
|---|---|---|
| backend | `5fcdf90` | `readiness.py`: cada paso dice qué sección de Configuración abrir (`section`). |
| backend | `5fcdf90` | **Métodos de pago** (`payment_methods`), **lista de cierres** (`closures`, con migración del cierre único) y **aprobar citas a mano** (`approve_bookings`, `appointments.needs_approval`, `POST /appointments/{id}/approve`); 2 mensajes nuevos (`approved`, `declined`). |
| frontend | `261f727` | **Métodos de pago** en Configuración, Agenda, página de reservas y Reportes; **cierres y festivos de México** sugeridos; **aprobar o rechazar** solicitudes en Agenda e Inicio, con avisos a la clienta en la confirmación y en su página de cita. |
| frontend | `261f727` | **Configuración, flujo y arreglos:** avisos que abren su sección (`?sec=`), pausa instantánea, chips de secciones en celular, validación visible de cupones, premio por visitas, anuncio y anticipo, fotos con quitar y reordenar, Facebook normalizado, errores del servidor que llevan a su sección, el color cuenta como un cambio. |
| frontend | `77f5830` | **Interfaz:** vista previa en vivo en Configuración, portada con la primera foto en la página de reservas, citas "Por aprobar" con contorno punteado y resumen del día en Agenda. |

| backend | `4669926` | **Recordatorios automáticos con "Confirmo / Cambiar"** (API de WhatsApp y webhook), **"Te toca volver"** (`return_days`, cálculo por historial, horario sugerido, invitación automática) y **anticipo confirmado con Banxico** (CEP, CLABE, clave de rastreo única). |
| frontend | `b20f23d` | Envío automático en Configuración, aviso de CLABE con Banxico, "Vuelven cada" en Servicios, tarjeta "Les toca volver" en Inicio, "Ya transferí: confirmar al instante" en la confirmación y en la página de la cita. |

| backend, frontend | `4641384`, `295a8da` | **En pausa:** WhatsApp automático y anticipo con Banxico quedan comentados y ocultos (`FUTURE_PHASE_WHATSAPP`, `FUTURE_PHASE_SPEI`; `SPEI_CHECK=false`). "Les toca volver" manual sigue activo. |

| frontend | `97f81fd` | **Lectura más cómoda:** letra base de 15 px, ayudas y etiquetas de 14 px, títulos de tarjeta sin mayúsculas, gris con contraste suficiente, fondo del panel más claro, controles de 44 px y anillo de enfoque. |

| frontend | `782f129` | **Pantallas más limpias:** ayudas de Configuración bajo demanda (ⓘ), avisos de la página de reservas y de la cita con los tokens del sistema, más espacio entre tarjetas en Inicio y cifras más grandes en Agenda, Cobro y Reportes. |

| backend | `88ee51c` | **"Ya pagué" ya no confirma solo:** queda como aviso para que la dueña revise (`paid_claim`). Los anticipos con comprobante o con "Ya pagué" no se liberan al vencer. |
| frontend | `46134f6` | "Dice que pagó" en Agenda e Inicio; la clienta ve que el negocio lo está revisando. |
| frontend | `1005403` | **Asistente de bienvenida** de 3 pasos después del registro. **Revisión en el navegador:** Agenda legible en modo oscuro (bloques y franja de horario con tokens), Semana con los 7 días visibles en laptop y ayudas bajo demanda funcionando. |

| frontend | `4b0396c` | **Reportes más claros:** abre en Mes, 4 números con comparación contra el periodo anterior, meta escondida hasta ponerla, un solo botón de descarga, sin la tarjeta repetida "Cierre de hoy", pestañas que caben en celular y aviso cuando no hay movimientos. |

| backend, frontend | `3c097b7`, `d3f4d7e` | **Reportes, paso 2:** ocupación hasta hoy (total y por colaboradora), clientas nuevas vs. que regresan (nueva = sin cita completada antes del periodo), top 5 de servicios por ingreso y mapa de días y horas. Todo sale de `GET /api/shop/report` (`occupancy`, `new_clients`, `returning_clients`, `top_services`, `busy_hours`). |

| backend, frontend | `3352378`, `a47fa2e` | **Control del negocio:** proyección con lo agendado, punto de equilibrio, categorías de gastos y corte de caja diario. |

Pruebas: backend 52 (1 omitida a propósito: el webhook en pausa), frontend 30, todas pasando.

### 20 de octubre de 2026

| Repositorio | Commit | Qué cambió |
|---|---|---|
| frontend | (sin commit) | **Inicio rediseñado:** orden por urgencia ("Por resolver" arriba, Hoy en la columna principal), 4 números con "Por cobrar hoy", filas de Hoy con Ahora/Sigue, avance del día, Cobrar directo y WhatsApp de confirmación; recordatorio de mañana en una sola tarjeta; "Esta semana" en lugar de "Más pedidos"; colores con tokens y botones de 44 px. |
| frontend | (sin commit) | **Arreglos de Inicio:** el aviso "falta tu CLABE" ya se ve con la lista oculta; una petición fallida ya no tumba la página (botón "Reintentar"); se quitaron reseñas, horarios libres y estadísticas que se pedían sin mostrarse. |
| frontend | (sin commit) | **Paquetes** pasan de Inicio a Clientes, con etiquetas y validación. **Agenda:** `?cobrar=1` abre la ficha ya en el cobro, y "por cobrar" del resumen del día ahora suma también las citas sin anticipo ni cotización (antes contaban $0). |
| frontend | (sin commit) | **Agenda, errores:** el cobro ya no pide el anticipo otra vez ("Cobra ahora" = precio − anticipo + productos + propina); cuadrícula según los horarios del equipo (antes fija de 8:00 a 20:00); citas al mismo tiempo lado a lado en Semana y Día; "Día libre" para el filtro o todo el equipo, con confirmación, aviso de citas y deshacer (antes cerraba solo a la primera colaboradora); se quitó "Marcar recibido" anidado dentro del bloque; tocar un bloqueo ya no lo borra con `window.confirm`. |
| frontend | (sin commit) | **Agenda, flujo y diseño:** recuerda la vista, línea de "ahora", lista por hora en celular, mover solo a horas libres, fecha legible y teléfono para llamar en la ficha, búsqueda de clientas propia (sin `datalist`), "Nueva cita" con lo importante primero en celular, avisos temporales. Tokens en lugar de colores sueltos, texto mínimo de 13 px, controles de 44 px y campos con `.input` y `.chip`. Los campos compartidos de fecha, hora y selección (`when-field`) miden ahora 44 px en toda la app. |

| backend, frontend | (sin commit) | **Clientes rediseñado:** lista única con filtros y orden, conteos correctos (antes recortados a 15 y 10), "Dejaron de venir" sin quien ya tiene cita, alta a mano, CSV, ficha con edición, paquetes, notas automáticas y "Sin cobrar". Backend: `GET /api/clients` sin borrar datos y con próxima cita y faltas; `POST /api/clients`; `PATCH /api/clients/{id}` acepta nombre y teléfono; `PATCH`/`DELETE /api/packages/{id}`. |

| backend, frontend | (sin commit) | **Fichas repetidas y borrado:** al arrancar, `init_db` une las fichas con el mismo teléfono (`merge_duplicates` en `app/models/client.py`: se queda la más antigua y conserva notas, correo y cumpleaños de la otra). **Borrar sus datos** en la ficha (`DELETE /api/clients/{id}`, derechos ARCO): borra ficha, fichas gemelas y paquetes; sus citas pasadas quedan anónimas ("Cliente eliminado") para no perder ingresos; con citas por venir responde 409. |

| backend, frontend | (sin commit) | **Ficha más útil:** próxima cita arriba (abre la Agenda), o "Le toca el …" según cada cuánto viene; pide más, la atiende, ticket promedio y frecuencia (mediana de días entre visitas cobradas); notas de cada visita en el historial y "Ver más" después de 8. **Etiquetas** propias (`clients.tags`, texto separado por comas, hasta 10 de 30 caracteres) que filtran la lista. **Cumpleaños de los próximos 7 días** en lugar de solo hoy. **Importar CSV** (`POST /api/clients/import`): detecta columnas de nombre, teléfono, correo y cumpleaños, con coma o punto y coma; salta teléfonos repetidos o sin 10 dígitos. |

| backend, frontend | (sin commit) | **Reportes:** "Resultado" sube debajo de los 4 números; la gráfica muestra el monto al tocar cada punto. Nuevas tarjetas en Ingresos: **lo que deja cada servicio** (ingreso − comisión, y por hora de trabajo; sin insumos), **faltas y cancelaciones** en %, **que regresen** (re-reserva, gasto promedio de una clienta, % que reserva por la página, anticipación, cupones usados) y **últimos 12 meses**. Por colaboradora: **tabla comparativa** (vendió, citas, ticket, ocupación, por hora, propinas, faltas/cancelaciones y % que regresan). Comisiones: **pagos parciales** (se guarda el total pagado; ya no cuenta como pagado completo un pago que abarca el periodo) y **recibo por WhatsApp**. Gastos: fecha, formulario con etiquetas y **% de ingresos por categoría con cambio contra el periodo anterior**. Citas nuevas guardan su origen (`appointments.source`: `page` o `admin`); las viejas quedan sin dato. Todo sale de `GET /api/shop/report` (`service_stats`, `cancelled_count`, `no_show_count`, `rebooked`, `client_value`, `discount_count`, `discount_amount`, `by_source`, `lead_days`, `months`, y por colaboradora `no_shows`, `cancels`, `clients`, `returning`). |

| backend, frontend | (sin commit) | **Reportes, paso 4:** **material por servicio** (`services.supply_cost`, se resta en "lo que deja cada servicio"); gráfica con **línea del periodo de comparación** (`daily` en el reporte) y **comparar con el periodo anterior o hace un año**; **meta mensual por colaboradora** y **comisión escalonada** (`staff_members.goal`, `tier_amount`, `tier_percent`: desde ese monto vendido, toda la comisión usa el % más alto); **CSV para el contador** (`GET /api/shop/accounting?year=`: por mes, cobrado por método, gastos por categoría, comisiones, propinas y ganancia); **correo mensual** el día 1 desde las 8 a. m. (`send_monthly_reports` en `app/core/alerts.py`, `businesses.monthly_sent_on`); **alertas en Inicio** ("Para tu negocio", `GET /api/shop/alerts`: semana ±15%, franja más floja de 8 semanas, colaboradoras con 3+ faltas de clientas en el mes, productos con 3 o menos). **Inventario encendido:** ruta `/admin/caja` y menú "Inventario"; las ventas de productos suman a ingresos y las compras restan a la ganancia (ya no hay `FUTURE_PHASE_INVENTORY`). |

| backend, frontend | (sin commit) | **Servicios:** borrar de verdad, duplicar, ordenar, subir precios, categorías editables, quién lo hace, rentabilidad en la lista, formulario agrupado con vista previa. Columnas nuevas en `services`: `sort_order`, `featured`, `cleanup_minutes`, `wait_start`, `wait_minutes`, `variants` (JSON). La disponibilidad y los choques usan tramos ocupados (`busy_spans`): la espera libera a la colaboradora y la limpieza la ocupa después. **Página de reservas:** respeta el orden, muestra "El más pedido", y si el servicio tiene opciones la clienta elige una (cambia precio y duración; se manda como `variant` en disponibilidad y al reservar, y queda en `answers` como "Opción: …"). |

| backend, frontend | (sin commit) | **Equipo:** fila con horario, servicios, números del mes, color y aviso de "No recibe citas"; desactivar con confirmación, citas próximas y deshacer; vacaciones por persona; formulario agrupado con descripción pública y color elegible (`staff_members.color`, que también usa la Agenda); servicios con Todos/Ninguno por categoría. Borrar un servicio con colaboradoras asignadas ya no falla (se borran primero sus filas de `staff_services`). |

| frontend | (sin commit) | **Horarios:** aviso de cambios sin guardar (al cambiar de persona, salir o cerrar la pestaña), selectores de hora fija independientes por día (antes compartían el valor), aviso "aún sin horario guardado", `?staff=ID` desde Equipo, "Copiar el lunes a los días abiertos", validar solo días abiertos, plantillas, copiar de otra persona, aplicar a todo el equipo, horas fijas en opciones avanzadas, horario especial de un día (bloqueos) y la semana del equipo. |

| backend, frontend | (sin commit) | **Horarios, paso 2:** antes de guardar avisa cuántas citas próximas quedan fuera del horario nuevo (y deja enlace a la Agenda). **Horarios especiales** propios en el backend (tabla `special_hours`: un día o un periodo, de una persona o de todo el equipo, con horas o cerrado; `GET/POST/DELETE /api/schedules/special`), con lista y "Quitar"; mandan sobre el turno normal en la disponibilidad (`special_for` en `app/core/booking.py`). **Horario general del negocio** (`business_hours`: de lo que trabaja el equipo activo) en la página de reservas (`hours` en `GET /api/businesses/{slug}`) y en la vista previa del enlace. Horas por semana por persona y total, **cobertura contra demanda** (cruza quién trabaja con las citas de las últimas 8 semanas), editar desde la semana del equipo, botones ±30 min y pista para dos turnos (usar el descanso). **Corrección de textos:** sin horario propio, una persona sí recibe citas (todos los días de 9:00 a 18:00, `DEFAULT_START`/`DEFAULT_END`); Equipo y Horarios ya lo dicen así. |

| backend, frontend | (sin commit) | **Mi negocio:** se borró el formulario escondido; números de presencia, pendientes con su enlace, enlace personalizado (`old_slugs`), kit para compartir, botón para sitio web, QR propio y cartel, opiniones con respuesta, enlace de Google (también en la página de la cita tras 4–5 estrellas) y vista previa en celular. Dependencia nueva en el frontend: `qrcode`. Arreglo: la alerta de Inicio "buen momento para una promoción" llevaba a `?sec=promos` (no existe); ahora `?sec=promociones`. |

| backend, frontend | (sin commit) | **Apariencia:** tema completo de la página de reservas a partir de los colores del logo (botones, detalles, fondo, temas listos, forma, relleno, letra y encabezado), contraste automático del texto de los botones con aviso y vista previa en vivo. |

Pruebas: backend 65 (1 omitida a propósito), frontend 30, todas pasando.

| backend, frontend | (sin commit) | **Ubicación del local:** `businesses.latitude`/`longitude` (con migración y validación de que lleguen juntas), en la página pública, en la de la cita y en "qué te falta" (`location`). Configuración → Tu negocio: mapa con pin arrastrable (Leaflet + OpenStreetMap), "Estoy en el local", buscar dirección y pegar enlace de Google Maps. Página de reservas: "Cómo llegar" plegado en el encabezado y al confirmar; página de la cita: "Cómo llegar". Dependencia nueva: `leaflet`. |
| frontend | (sin commit) | **Mapas más rápidos:** la clienta ve un mapa fijo de imágenes de OpenStreetMap en lugar del iframe de Google; el CSS de Leaflet va dentro del componente (antes dependía de reiniciar `ng serve` y, sin él, el mapa salía roto). |
| frontend | (sin commit) | **Google Maps:** con llave (`GOOGLE_MAPS_KEY`), la dueña marca su local con el mapa y el buscador de Google, y la clienta ve una imagen de Google con el pin del color de la marca. Sin llave sigue OpenStreetMap. Dependencia nueva: `@types/google.maps`. |

| backend, frontend | (sin commit) | **Comisiones opcionales:** pregunta al registrarse y switch en Configuración (`businesses.uses_commissions`); apagadas, Equipo y Reportes las esconden y el backend calcula con 0%. |
| frontend | (sin commit) | **Textos para cualquier negocio:** "clienta(s)" → "cliente(s)" en todo el panel, la página pública y lo legal; ejemplos por giro (`examplesFor`) en el registro, Configuración, Equipo y la vista previa de mensajes; sin ejemplos de uñas, tinte o cabello en Servicios ni en la reserva. Backend: aviso de faltas y correo mensual en neutro. |

Pruebas: backend 68 (1 omitida a propósito), frontend 33, todas pasando.
