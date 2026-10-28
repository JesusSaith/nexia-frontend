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

**Roles:** `owner` (dueña), `admin`, `staff` (colaboradora, con acceso solo a su agenda, sus clientes —en su menú— y su perfil) y `super_admin` (plataforma). La creación de cuentas para colaboradoras está apagada por ahora. Los permisos se aplican en la API, no solo ocultando pantallas (ver "Roles y permisos" en la sección 5).

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

### Acceso del equipo (Equipo → "Acceso al panel")
- La dueña o una administradora da acceso a una persona de su equipo desde **Equipo → ⋯ → Acceso al panel**: escribe el correo y el sistema crea una cuenta `staff` con una **contraseña temporal** (10 caracteres sin 0/O ni 1/l/I) que se muestra **una sola vez**, con "Copiar mensaje" (texto listo para WhatsApp con la liga, el correo y la contraseña). No depende del correo electrónico.
- Con una cuenta ya creada, el mismo panel ofrece **Crear contraseña nueva** (cierra sus sesiones abiertas) y **Quitar acceso** (borra la cuenta; la persona sigue en el equipo y su historial se queda). La fila muestra "Con acceso". La cuenta de la dueña no se administra desde aquí.
- Quien entra con contraseña temporal (`users.must_change_password`) llega a `/auth/cambiar-contrasena` y **no puede usar el panel** hasta elegir la suya: el frontend la redirige (`passwordChosenGuard`) y el backend responde 403 "Cambia tu contraseña para continuar" en las rutas del negocio. `POST /api/auth/change-password` pide la contraseña actual (con límite de intentos), cierra las otras sesiones y renueva la actual. Olvidar la contraseña por correo también apaga la marca.
- API: `POST /api/staff/{id}/account` (correo; contraseña opcional), `POST /api/staff/{id}/account/reset`, `DELETE /api/staff/{id}/account`, solo `owner`/`admin`. Pruebas en `tests/test_team_access.py`.

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

*(En celular, al elegir un servicio la página baja sola a lo que sigue; del paso 2 en adelante el encabezado del negocio se compacta.)*
- Elige un servicio. Puede filtrar por categoría y sumar servicios extra a la misma cita.
- Si solo una colaboradora hace ese servicio, queda elegida sola y aparece como "Te atiende: …" en una línea. Si hay varias, aparece **"Cualquiera disponible"**.
- Al tocar una colaboradora (o "Cualquiera") avanza sola al paso 2.

### Paso 2. Horario
- **"Lo más pronto":** tres atajos con el primer horario libre de los próximos días.
- El calendario abre en el primer día con lugares, y salta al mes siguiente si el actual está lleno.
- Las horas aparecen agrupadas en Mañana, Tarde y Noche. Al tocar una, avanza al paso 3.
- Si el día no tiene lugares, puede anotarse en la **lista de espera**.
- Si el negocio está **en pausa** o tiene un **cierre** ese día (vacaciones, puente o festivo), la página lo dice y no deja reservar (la API también lo bloquea). Arriba de la página se avisa el próximo cierre solo si empieza en los siguientes 30 días.

### Paso 3. Datos
- Teléfono (10 dígitos; acepta espacios, guiones y lada +52), nombre, y correo o nota de forma opcional. La API lo valida igual en reservas y en la lista de espera: con otro formato responde "Escribe tu teléfono a 10 dígitos".
- **Se guardan limpios:** el teléfono se guarda siempre con sus 10 dígitos ("+52 55 0000-1020" queda "5500001020"; `ten_digit_phone`, tanto en la página como en las citas que crea la dueña) y el nombre sin etiquetas HTML ni signos < > (`clean_person_name` en `app/schemas/appointment.py`, también en la lista de espera); un nombre que solo trae etiquetas responde 422. Las citas y clientes viejos conservan su formato; las búsquedas y el límite de 3 citas comparan por `phone_key`, que ya ignora espacios y lada.
- **Servicios con precio variable (cotización):** campo "Qué necesitas" y hasta 3 **fotos de referencia**, que se comprimen en el celular.
- **Desglose de dinero:** cuánto paga hoy de anticipo, cuánto en la cita y el total, **qué métodos de pago acepta el negocio** ("Aceptamos efectivo y tarjeta") y la política de cancelación.
- Si el negocio **aprueba las citas a mano**, se avisa que revisará la solicitud y confirmará por WhatsApp.
- Aviso de privacidad, y un campo oculto que delata a los bots (*honeypot*).
- Si es clienta frecuente, sus datos ya aparecen llenos (se guardan en su navegador), con un botón "No soy yo" para borrarlos.

- **Después de reservar** se esconden las pestañas de pasos (Servicio, Horario, Datos): ya no sirven y estorbaban en la confirmación. Al cancelar desde la página de la cita solo sale el aviso rojo "Cita cancelada" (antes salía dos veces).
- **Botón Atrás:** cada paso (Servicio, Horario, Datos) es una entrada del historial del navegador; "Atrás" del celular o del navegador regresa un paso y conserva lo elegido en vez de salir de la página. El botón "Atrás" de la página usa el mismo historial.
- **WhatsApp del negocio:** los botones de la página (contacto y "Mandar por WhatsApp") usan `whatsappLink`, que antepone 52 a los números de 10 dígitos; antes abrían el chat de otro país.

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
- **Errores en la página de la cita:** si el enlace no abre, la página dice que no es válido; si falla una acción (cancelar, cambiar, subir comprobante, "Sí voy"…), el aviso rojo sale **dentro de la cita** con el motivo que da la API y la persona no pierde lo que estaba viendo. Cancelar pide confirmación con el diálogo de la app, que muestra la política de cancelación del negocio. **Mientras la cita espera el anticipo** (`awaiting_deposit`) la persona sí puede **cancelarla** (libera el horario y avisa al negocio; `POST /api/public/appointments/{token}/cancel` acepta ese estado), pero **no ve "Cambiar fecha u hora"**: cambiar la hora exige una cita confirmada (la API responde 409). Antes los dos botones salían y fallaban con "Esta cita ya no se puede cambiar".
- **Qué muestra la página de la cita:** servicio y opción elegida, **extras**, fecha y hora, **duración real** (de `starts_at` a `ends_at`, con extras), con quién y el total. Cuando la cita ya está confirmada y se había pedido anticipo, aparece "Anticipo recibido: $X. En tu cita pagas $Y". La API pública manda `extra_label`, `option_name` y `business_phone` además de lo anterior. Si la cita ya no se puede cambiar (`changes_locked`, por las horas mínimas de cancelación), dice "Ya no se puede cambiar esta cita desde aquí" y ofrece **"Escribir a [negocio]"**, un WhatsApp con el mensaje ya escrito (solo si el negocio tiene teléfono de 10 dígitos). La pantalla de confirmación al reservar también muestra extras, duración y total.
- **Horarios al cambiar la cita:** la lista sale de `GET /api/public/appointments/{token}/slots?date=…`, que usa la duración real de la cita, la misma persona y no cuenta el horario que la cita ya ocupa (así se puede mover un rato). Si la cita ya pasó o está cancelada, la lista viene vacía.
- **Cambiar la cita** conserva su duración real (opción elegida y extras, no solo la del servicio base) y respeta lo mismo que al reservar: días máximos de anticipación, anticipación mínima, cierres y pausa. Si cambia de persona, esa persona debe hacer el servicio. Si el horario ya no cabe, responde que ya no está disponible.
- Después de la cita (estado completada): **dejar una opinión** con estrellas, una sola por cita (la opinión viaja con el enlace de la cita y la API la rechaza si la cita no está completada o ya tiene una).

### Otras rutas públicas
- `/:negocio/privacidad`: el aviso de privacidad propio del negocio, o uno genérico si no escribió el suyo.
- **Cualquier otra dirección** muestra "No encontramos esta página" con un botón "Ir al inicio" (`NotFoundComponent`, ruta `**`), en lugar de una pantalla en blanco.
- `/s/:negocio` (la sirve el backend): enlace para compartir con **vista previa**, con logo y nombre en WhatsApp e Instagram, que redirige a la reserva.

---

## 4. Flujo de la dueña (panel `/admin`)

**Navegación:** en escritorio, un **menú lateral oscuro fijo** con el logo y el nombre del negocio, las secciones en dos bloques (el día a día y "Tu negocio") y, abajo, el tema y la cuenta. En celular hay una barra superior oscura y una barra inferior con **Inicio · Agenda · Clientes · Más**; "Más" abre el mismo menú como cajón.

| Pestaña | Para qué sirve |
|---|---|
| **Inicio** | Ordenado por urgencia. Arriba, **4 números** que llevan a donde se resuelven: citas hoy, **cobrado hoy** (con "Faltan $X" por cobrar, precio o cotización menos anticipo), **sin confirmar** y **por resolver**; estos dos últimos tienen ícono distinto y, en cero, se ven apagados para que resalte lo que sí pide atención. Debajo, **acciones rápidas**: Clientes, Copiar mi enlace de reservas y Ver reportes (cobrar se hace desde cada cita de Hoy, por eso no hay botón aparte). Después, **"Por resolver"** (aprobar solicitud, revisar comprobante, falta el anticipo; 5 y "Ver más") y la lista "Pon tu negocio en marcha" (oculta, deja solo los avisos como "falta tu CLABE"). Columna principal: **Hoy**, con avance ("3 de 6 atendidas"), la cita de **Ahora** y la que **Sigue**, cada fila abre la cita, WhatsApp para pedir confirmación y **Cobrar** (abre la Agenda ya en el cobro con `?cita=…&cobrar=1`; se vuelve el botón principal cuando la cita ya terminó); las cobradas se quedan atenuadas. Debajo, **Avisos**: se juntan los repetidos ("2 veces"), los nuevos llevan un punto, solo se ven 3 con "Ver todos" y "Marcar como vistos" los atenúa (la marca se guarda en el servidor, `POST /api/notices/seen`, y cada aviso lleva su tipo, la cita y los datos en columnas: `kind`, `appointment_id`, `data`, `seen`; ya no se lee el texto con expresiones regulares). La barra de avance de Hoy se pone verde al terminar. Columna lateral: **Mañana** con "Recordar a Ana" uno por uno, cumpleaños (de `GET /api/clients/birthdays`, solo los próximos días y no toda la lista), **"Les toca volver"**, **"A quién escribirle hoy"** (clientes que dejaron de venir hace más de 45 días y sin cita próxima, sin repetir a los de "Les toca volver" ni a quien se invitó en las últimas 2 semanas; primero quienes más han gastado; "Invitar" abre WhatsApp y lo anota en `client_contacts`) y **"Esta semana"** (lo cobrado de lunes a hoy contra los mismos días de la semana pasada, con enlace a Reportes). El aviso "Para tu negocio" ahora dice los pesos ("llevas $2,222, arriba de los $1,050…") en vez de un porcentaje. Solo las citas son indispensables: si falla otra petición, su tarjeta queda vacía; si fallan las citas, aparece "Reintentar". |
| **Agenda** | Vistas Mes, Semana y Día. Abre en la **última vista elegida** (la primera vez: Día en celular, Semana en escritorio). La cuadrícula abarca **del turno más temprano al más tarde** del equipo visible, y se amplía si hay citas fuera de turno. Las citas que **coinciden en hora van lado a lado**. Hay una **línea de "ahora"** y, al abrir hoy, la pantalla baja sola a la hora actual. En celular, el Día es una **lista por hora** en lugar de columnas. En Mes, cada día lleva puntos del color de cada colaboradora y el número de citas. **Día libre** cierra el día para la colaboradora del filtro o para todo el equipo: pregunta antes, avisa si ya hay citas y se puede deshacer. Tocar un bloqueo muestra qué es y quién, y quitarlo es un botón aparte. "Cambiar día u hora" ofrece **solo horas libres**. La ficha muestra la fecha legible y el teléfono se toca para llamar. En Nueva cita, servicio, colaboradora y hora van primero en celular, y la clienta se busca por nombre o teléfono. Un color por colaboradora, y cada cita lleva además un **ícono de estado** (confirmó, sin confirmar, cobrada, cancelada, no llegó). En el panel del día, cada fila trae **Cobrar** (abre la ficha ya en el cobro) y **WhatsApp para pedir confirmación**, y "Horarios libres" abre Nueva cita con esa hora. Permite crear una cita (busca a la clienta por nombre o teléfono), **aprobar o rechazar** las solicitudes "Por aprobar" (se ven con contorno punteado y la etiqueta "Por aprobar" sin abrir la ficha), un **resumen del día** ("6 citas · $3,200 por cobrar"), **cambiar día u hora**, **cobrar y completar** con monto y método de pago (solo los que acepta el negocio, más "Paquete"), pedir la opinión, marcar "no llegó" o cancelar, repetir cada 3 o 4 semanas, bloquear horarios, marcar días libres y compartir una imagen con la disponibilidad del mes. |
| **Clientes** | Una sola lista con **buscador arriba** y **filtros**: Todos, Mejores (por gasto), Dejaron de venir (más de 45 días **y sin cita próxima**, con "Invitar"), Cancelan seguido (2 o más cancelaciones o faltas), Cumpleaños de los próximos 7 días (con "Felicitar") y Con paquete. Orden por nombre, última visita, gasto o visitas. Cada fila dice la **próxima cita** o hace cuánto fue la última. Los 3 números de arriba abren su filtro. **Mensajes anotados:** al tocar "Invitar" o "Felicitar" (aquí y en Inicio) o "Te toca" el mensaje queda anotado (`POST /api/clients/{id}/contacts`, tabla `client_contacts`, ligada al teléfono normalizado). La fila dice "Invitado hace 3 días", el botón cambia a "Invitar otra vez" y la ficha muestra "Mensajes que le mandaste". Al borrar la ficha se borran sus mensajes; si cambia el teléfono, el historial lo sigue. **Agregar cliente** a mano (`POST /api/clients`) y **Descargar** la lista en CSV. La ficha (se cierra con Escape): WhatsApp, Llamar, **Nueva cita** (igual que la última si hay), **editar nombre y teléfono** (`PATCH /api/clients/{id}`, 409 si el teléfono ya es de otro), **paquetes** (agregar, ±1 visita y quitar: `PATCH`/`DELETE /api/packages/{id}`), cumpleaños, **notas que se guardan solas** (al salir del campo o al cerrar) e historial, donde una cita pasada sin cobrar dice "Sin cobrar" y no "Próxima". `GET /api/clients` ya **no borra** fichas repetidas al leer (las muestra como una), lee solo las columnas necesarias y trae `next_visit` y `no_show_count`. |
| **Reportes** | Abre en **Mes** y recuerda el último periodo. Arriba, un **resumen de tres preguntas** (¿gané o perdí?, ¿qué me falta cobrar o pagar?, ¿a quién tengo que cuidar?), cada una con su respuesta y un botón a donde se resuelve; "por cobrar" y "por pagar" son de hoy en adelante y "a quién cuidar" cuenta clientes que dejaron de venir y que cancelan o faltan seguido (mismas reglas que Clientes; `clients_missing` y `clients_cancelling` del reporte). Después, **4 números contra el periodo anterior** (ingresos, ganancia, citas completadas y ticket promedio, con ↑/↓ en %). El análisis a fondo (ocupación, clientes nuevos, servicios que más dejan, horas fuertes, últimos 12 meses) queda detrás de "Ver análisis a fondo". Debajo: gráfica por día (en "Día" no se dibuja), **cómo te pagaron**, faltas, anticipos pendientes, servicio más pedido **Ocupación** (qué % del horario de trabajo se llenó hasta hoy, en total y por colaboradora, con una sugerencia), **clientas nuevas vs. que regresan**, **servicios que más dejan** (top 5 por ingreso), **días y horas más fuertes** (mapa de calor) y **Resultado** (ingresos − gastos − comisiones, con el **punto de equilibrio**: cuánto hay que ingresar en el periodo para cubrir gastos, compras de producto y comisiones, en pesos y en citas, con barra de avance). En "¿A quién tengo que cuidar?", si en el periodo se invitó a clientes a volver, dice **cuántos ya regresaron, cuánto dejaron y cuántos tienen cita agendada** (solo cuenta visitas posteriores al mensaje; felicitar no cuenta como invitación; `winback_*` del reporte). Debajo de los 4 números, la **proyección**: "Llevas $X y tienes $Y agendados (N citas); si se cumplen, cierras en ~$Z" (y el % de la meta si hay meta en pesos). Los **gastos fijos llevan día de pago** y cuentan completos en el periodo donde cae (Resultado avisa "Falta pagar este mes" y Gastos lista los "Próximos pagos"). Los **gastos llevan categoría** (renta, nómina, insumos, luz/agua/internet, publicidad, otros) y la gráfica de Gastos se agrupa por categoría. Pestaña **Corte de caja**: por día, lo cobrado por método (servicios, propinas y productos), el **fondo** con el que abrió la caja, el efectivo que debe haber desglosado, el que se contó, la diferencia ("Faltan $50") y una nota. Se pueden anotar **entradas y salidas de caja** (compras con el efectivo, retiros, cambio) y una salida puede quedar también como gasto del día. **"Cerrar corte"** lo guarda con quién lo cerró y ya no se edita ni acepta movimientos hasta **"Abrir de nuevo"**; el historial muestra quién cerró cada día (`GET/PUT /api/shop/cash`, `POST /api/shop/cash/reopen`, `POST/DELETE /api/shop/cash/moves`; tablas `cash_counts` y `cash_moves`). La **meta de ganancia** se esconde hasta que la dueña toca "Poner meta"; puesta, muestra una barra de avance. Pestañas de ingresos por colaboradora, comisiones y gastos. **Por colaboradora** muestra una **tarjeta por persona** (se lee bien en el celular): lo que vendió contra el periodo anterior, citas, ticket, lo que deja por hora, % de clientes que regresan, ocupación, meta del mes, faltas y cancelaciones, propinas y, si hay comisiones, lo que le toca y si falta pagarle; en pantalla grande se conserva además la tabla para comparar. Un solo botón **Descargar** (Excel del periodo, Excel con todo, PDF y "Para el contador"). Las hojas son **Resumen** (ingresos, gastos, compras de producto, comisiones, ganancia, punto de equilibrio, por cobrar y falta pagar), Ingresos (con cómo te pagaron), Colaboradores, Comisiones, Gastos (con cuándo se paga, pagos marcados y próximos pagos) y **Corte de caja** (cortes cerrados del periodo, `GET /api/shop/cash/range`; solo sale si hay). Los montos van como número para poder sumarlos en Excel; en el PDF se escriben en pesos. El CSV del contador agrega "Compras de producto" para que ingresos − gastos − compras − comisiones dé la ganancia. Sin movimientos en el periodo, muestra un aviso con "Ir a la agenda" en lugar de ceros. |
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
  3. **Reglas de reserva:** opciones rápidas en vez de números sueltos (anticipación, días a futuro, tiempo entre citas, hasta cuándo cancelar), **aprobar cada cita a mano**, mensaje sobre cancelaciones, **tope de citas por día** (`max_daily_appointments`: al llenarse, el día ya no ofrece horarios y la API responde 409), zona horaria y salas o equipos.
  4. **Anticipo y pagos:** **métodos de pago que acepta** (efectivo, transferencia, tarjeta; al menos uno), monto fijo, porcentaje para servicios por cotizar, cuenta o CLABE, tiempo para pagarlo y enlace de pago. **Si el cliente cancela:** se **devuelve** (`refund`) o **se queda el negocio** (`keep`) en `businesses.deposit_cancel_policy`; la política se ve al reservar y en la página de la cita (`core/deposit-policy.ts`). **Regla de faltas:** `noshow_after` (faltas) y `noshow_deposit` (monto): a quien ya faltó esa cantidad de veces se le pide ese anticipo aunque el negocio no lo pida (`repeat_no_show_deposit` en `app/core/booking.py`; la cita lleva `deposit_reason = "repeat_no_show"` y la página dice por qué). **Avisa si falta la CLABE**, porque sin ella el anticipo no se cobra.
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
- **Estados válidos** (`_NEXT` en `app/routers/appointments.py`): una cita pendiente puede completarse, cancelarse, marcarse como "no llegó" o quedar esperando anticipo; la que espera anticipo solo pasa a pendiente (se acepta) o se cancela; una completada, cancelada o "no llegó" solo puede volver a pendiente o esperando anticipo (es el "Deshacer"). Cualquier otro salto, como completar una cita cancelada, responde 409. Repetir el mismo estado no hace nada.
- **Deshacer una cancelación o un "no llegó"** revisa antes que el horario siga libre; si otra cita lo ocupó responde 409 "Ese horario ya lo ocupó otra cita. Muévela a otra hora antes de recuperarla."
- **Doble reserva:** al reservar, mover o crear una cita se bloquea la fila de la persona (`lock_staff`, `SELECT ... FOR UPDATE` en PostgreSQL) mientras se revisa el horario, así dos reservas simultáneas por el mismo hueco no pasan las dos. En SQLite (desarrollo) las escrituras ya van una por una.
- **Reservar con alguien que no hace el servicio** (o sus extras) responde 409 "Esa persona no hace este servicio".
- Si el anticipo no llega en `deposit_hold_hours` (3 h por defecto), el horario se libera solo, **salvo** que la clienta ya haya subido comprobante o dicho "Ya pagué": entonces espera a que la dueña lo revise.
- **"Ya pagué"** (cuando el negocio tiene enlace de pago) **no confirma la cita**: marca `paid_claim`, avisa a la dueña ("dice que ya pagó: revisa tu cuenta") y en Agenda aparece "Dice que pagó". La dueña la acepta con "Depósito recibido" después de revisar su cuenta.
- **"Sin confirmar" vs. anticipo:** `attendanceState` (`core/appointment-progress.ts`) dice si la persona está comprometida: confirmó ("Confirmó"), o ya se aceptó su anticipo ("Anticipo pagado"); solo sin ninguna de las dos sale "Sin confirmar" y se le ofrece pedir confirmación por WhatsApp. Aplica en Agenda (lista, ficha y marca) y en Inicio (contador "Sin confirmar", insignias y recordatorios de mañana).
- Las fotos de referencia se borran automáticamente 30 días después de la cita.
- **Avance en vivo de la cita** (`core/appointment-progress.ts`, sin columna nueva; se calcula con la hora local del negocio, `starts_at` y `ends_at`): una cita pendiente se muestra como **Por venir**, **En curso** (entre inicio y fin), **Terminó · falta cobrar** (ya pasó su hora y sigue sin cobrar) y, ya cobrada, **Finalizada · cobrada**; las demás conservan su etiqueta (Cancelada, No llegó, Esperando anticipo…). Se ve en la lista del día de Agenda (insignia en cada fila), en la ficha de la cita y en las filas de Inicio. Se actualiza solo cada 20 s en Agenda y 60 s en Inicio.
- **Enlaces `?cita=ID`:** Agenda abre la ficha aunque la cita sea de otro día (si el enlace no trae `dia`, consulta `GET /api/appointments/{id}`, que devuelve la cita con `ends_at`, y salta a ese día). Antes solo abría si la cita estaba en el rango cargado.
- **Precio de combos:** al reservar con opción o con extras de precio fijo, `quoted_price` guarda el total que vio la persona (opción o servicio base + extras); si algo es de precio variable se sigue cotizando a mano. Reportes, Inicio y Caja ya cuentan ese total. La página de la cita muestra "Total" (o "Precio acordado") y solo ofrece "Sí, ese precio" cuando el precio es variable.

### Otras funciones del panel
- **Ficha de la cita como hoja deslizable** en celular, con Cobrar, WhatsApp y Mover al alcance del pulgar.
- **Deshacer al cancelar:** aparece "Cita cancelada · Deshacer" durante 5 segundos, en lugar de pedir confirmación antes.
- **Cambios al instante:** la cita se ve cobrada, movida o cancelada sin esperar a que la agenda se recargue.
- **Cobro con anticipo:** el campo es el **precio del servicio** (se guarda completo en `final_price` y es lo que cuenta en Reportes), y el resumen resta el anticipo ya pagado: "Anticipo ya pagado −$200 · **Cobra ahora $300**". El botón dice lo que se cobra en caja.
- **Cobro completo:** monto, método de pago, **propina** (se suma a la comisión de la colaboradora), **productos vendidos** y **nota privada de la visita**. La nota aparece como "Última visita" la próxima vez que se abre una cita de esa clienta.
- **Cotizar en un paso:** desde el aviso se abre la cita con las fotos de referencia y el precio, y queda listo el WhatsApp con el precio.
- **Repetir la última cita** desde la ficha de la clienta: mismo servicio y misma colaboradora, solo falta elegir el día.
- **Cumpleaños:** fecha opcional en la ficha; Inicio y Clientes avisan el día del cumpleaños con un WhatsApp de felicitación listo. Inicio los pide al backend (`GET /api/clients/birthdays`, por rango de días).
- **Promociones:** **cupones** por código (con opción de que solo valgan en la primera visita) y **premio por visitas** (cada N visitas cobradas, la siguiente tiene X% de descuento). El descuento lo calcula el backend al reservar y se guarda en `discount_percent`. Si hay cupón y premio a la vez se aplica el mayor (no se suman). Un cupón de **primera visita** vale una sola vez por teléfono **mientras la cita siga en pie**: cuenta las citas pendientes y cobradas (`_booked_visits`), no solo las cobradas, así que no se puede usar en dos reservas seguidas antes de cobrar la primera; si esa cita se cancela, el cupón vuelve a servir. **El anticipo nunca pasa del total con descuento:** con un cupón del 100% no se pide anticipo y la cita queda confirmada; con uno parcial, el anticipo baja hasta el total. **Topes al cobrar:** el precio final y el precio acordado aceptan hasta $10,000,000 y la propina hasta $1,000,000 (antes un cero de más o un error de captura entraba a Reportes tal cual; ahora responde 422).
- **Página de reservas:** la tarjeta "Tus próximas citas" (tomadas de los enlaces guardados en el dispositivo; no hay búsqueda por teléfono, por seguridad), y la foto, el puesto y la descripción de cada colaboradora, junto con la calificación general del negocio.
- **El panel se instala como app (PWA)** y tiene **modo oscuro** (Claro, Oscuro o Sistema); la página pública de reservas siempre se ve en claro.
- **Datos de ejemplo** con un botón (Inicio → "Llenar con ejemplo"), para demos. Reutiliza los servicios sugeridos en vez de duplicarlos, y al quitarlos los vuelve a apagar.

---

### Cómo se calculan los números de Reportes y Caja
Todo sale de `GET /api/shop/report` (`app/routers/shop.py`); el correo mensual y el Excel del contador usan el mismo cálculo, así que siempre coinciden.
- **Ingresos:** citas completadas a su precio final (`quoted_price`, que incluye el anticipo) más ventas de productos del periodo.
- **Gastos fijos por fecha de pago:** un gasto fijo tiene un **día de pago** (mensual: día 1–31, si el mes es más corto cae el último día; semanal: día de la semana; diario: cada día). Cuenta **completo** en el periodo donde cae esa fecha, sin repartirse por día: la renta de $3,000 que se paga el día 22 suma $3,000 en el mes, no $2,129 a mitad de mes. Un gasto no cuenta antes del mes (o semana) en que se registró. Si no se elige día, se usa el día en que se registró. Cuando el periodo es el mes en curso, Resultado muestra **"Falta pagar este mes"** (lo que todavía no se resta de la ganancia) y la pestaña Gastos tiene **"Próximos pagos"** (los próximos 30 días). El punto de equilibrio usa los gastos realmente pagados del periodo. **"Ya pagué":** en "Próximos pagos" cada pago tiene ese botón (pide confirmar); el pago pasa a contar **el día que se marcó** (no el que tocaba) y sale de "Falta pagar este mes". Se puede **deshacer** desde el gasto ("Pagado el … · Deshacer"). Un pago sin marcar se da por pagado el día que toca, como antes. API: `POST/DELETE /api/shop/expenses/{id}/paid` (tabla `expense_payments`). Los gastos variables cuentan en el día en que se registraron. API: `pay_day` en el gasto; `times` y `next_due` en la lista; `fixed_pending` y `upcoming_fixed` en el reporte.
- **Compras de producto:** lo que costó el producto recibido en el periodo (`stock_moves` de entrada); se resta completo, no por lo vendido.
- **Comisiones:** porcentaje (o el escalonado, si alcanzó la meta) sobre lo cobrado de cada persona, más sus propinas. Las propinas se le entregan a la persona y no cuentan como gasto del negocio.
- **Corte de caja:** efectivo que debe haber = **fondo + servicios cobrados en efectivo (sin el anticipo) + propinas en efectivo + productos vendidos en efectivo + entradas de caja − salidas de caja**. La propina se cuenta con el método de su cita; una venta de producto lleva su propio método (`sales.method`) y las viejas, sin método, se cuentan como efectivo. El fondo que se propone es lo contado en el corte anterior, pero solo vale el que la dueña confirma al cerrar. Al cerrar se congela el esperado, para que cambios posteriores no muevan la diferencia. No se puede cerrar un día que no ha llegado. Las comisiones pagadas en efectivo hay que anotarlas como salida de caja.
- **Por cobrar:** en Ingresos, un aviso cuenta las **citas que ya pasaron y siguen sin cobrar ni cerrar** (`uncollected_*` del reporte) con lo que falta cobrar (precio menos anticipo) y lleva a la agenda. No son ingreso: los ingresos solo cuentan lo cobrado. Las citas por venir siguen siendo "agendados" en la proyección.
- **Ganancia** = ingresos − gastos fijos − gastos variables − comisiones − compras de producto.
- **Punto de equilibrio** = (gastos fijos + gastos variables + compras de producto) ÷ (1 − parte de comisiones sobre el ingreso). Resta lo mismo que la ganancia, así que con ese ingreso la ganancia queda en cero. En citas: ese monto entre el ticket promedio.
- **Pagos de comisión:** el monto que se captura **se suma** a lo ya pagado de ese periodo (pagar $500 y luego $300 deja $800). Un pago de un periodo más largo se reparte por días entre los periodos que cubre: un pago parcial del mes no aparece completo en cada semana. "Quitar pagos" borra los de esa persona dentro del periodo que se ve.
- **"Cómo te pagaron" (Reportes) y por método (Caja) dicen lo mismo:** el anticipo se cuenta como **transferencia** (`by_method` de Reportes separa `min(anticipo, precio)` y solo el resto va al método con el que se cobró la cita), mientras que Caja **no** lo incluye porque ese dinero entró antes de ese día. Así, la suma por método de Reportes es igual a los ingresos por servicios, y para un día sin propinas ni productos Caja y Reportes coinciden salvo por el anticipo. Reportes lo avisa debajo de la lista.

### Mapa del flujo completo
El diagrama de todo el sistema está en `docs/flujo-completo.mermaid` (se puede abrir en cualquier visor de Mermaid o pegarse en <https://mermaid.live>). Va de la alta de la dueña, la reserva de la persona, el ciclo de la cita y la página de la cita, hasta Reportes y Caja, con las protecciones de la API. Cada vez que cambie un flujo, se actualiza junto con su sección de este documento.

## 5. Seguridad y protección

- **Sesión en páginas públicas:** al abrir `/:negocio/book`, `/:negocio/manage/…`, `/:negocio/privacidad`, `/terminos`, `/privacidad` o `/s/…` la app ya no llama a `GET /api/auth/me` (devolvía 401 a cada cliente y ensuciaba la consola). Si alguien con sesión pasa de ahí al panel, `authGuard` consulta la sesión en ese momento (`isPublicPath`, `restoreSessionOnStart` en `core/services/auth.service.ts`).

- **Arranque seguro:** con `ENVIRONMENT=production`, la API no arranca si `JWT_SECRET` es el de ejemplo, si `COOKIE_SECURE` es falso, si la base es SQLite o si `FRONTEND_URL` no usa `https`. Si falta `RESEND_API_KEY`, avisa en el log.
- **Contra citas falsas:**
  - campo trampa (*honeypot*);
  - máximo 6 intentos por **negocio + IP** cada 10 minutos (en memoria, `app/core/throttle.py`);
  - máximo 3 citas próximas por teléfono.
- **Contra registros en masa y abuso de cuentas:** registro, "olvidé mi contraseña" y restablecer usan el mismo límite por IP.
- **Inicio de sesión:** `/auth/login` cuenta solo los intentos fallidos: 10 por IP y 10 por correo en 10 minutos, y luego responde 429 hasta que pase la ventana (entrar bien no gasta el límite). Un correo que no existe tarda lo mismo que uno que sí, para no revelar qué cuentas hay.
- **Cuenta de plataforma (`super_admin`):** no hay ninguna por defecto. Se crea al arrancar solo si `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD` (12 caracteres o más) están en el entorno; si faltan, no se crea nada.
- **Roles y permisos** (`ManagerDep` en `app/routers/auth.py`): todo lo que toca dinero, precios, equipo y datos de clientes exige `owner` o `admin`: Reportes, comisiones, gastos, corte de caja, inventario (alta, entradas y movimientos), crear, editar y borrar servicios y categorías, subir precios, crear, editar y desactivar personas, sus servicios y su cuenta, guardar horarios y horarios especiales, borrar o importar clientes, borrar paquetes y responder opiniones. Una `staff` conserva lo que usa su agenda: ver servicios, equipo y horarios, vender productos, ver y editar clientes y paquetes, y su perfil; en la lista del equipo no ve comisiones, metas, correo ni teléfono de nadie. **El personal solo ve y toca su propia agenda** (`app/core/agenda_scope.py`): la cuenta `staff` se liga a su persona del equipo (`Staff.user_id`); la lista de citas, los bloqueos y la lista de espera salen solo de esa persona aunque la petición pida otra, las citas ajenas responden 404, y agendar, mover o bloquear en la agenda de otra persona responde 403. Una cuenta de personal que no esté ligada a una persona del equipo no ve ninguna cita: la dueña debe ligarla al dar de alta la cuenta (Equipo).
- **Imágenes públicas** (`app/core/images.py`): las fotos de referencia, comprobantes, galería, logo y opiniones solo se aceptan como PNG, JPG, WebP o GIF. No se aceptan SVG ni otros tipos porque `/photos/{n}` y `/logo` se sirven desde el mismo origen que el panel y un SVG con script podría actuar con la sesión de la dueña. Al servirlas se agregan `X-Content-Type-Options: nosniff` y `Content-Security-Policy: sandbox`, y una imagen guardada con otro tipo responde 404.
- **Límites por acción** (`throttle(request, acción, limit=…)`, por IP): reservar y lista de espera 6 cada 10 minutos; opiniones 10; consultar descuento (`/loyalty`) y paquete (`/package`) 60 por negocio; en los enlaces de la cita, comprobante 10, "Ya pagué", confirmar, cancelar, cambiar y aceptar precio 20, lista de horarios para cambiar 60, y `/spei` 6 porque cada intento consulta a Banxico. La memoria del límite se limpia sola.
- **IP real:** el primer valor de `X-Forwarded-For` lo puede inventar cualquiera, así que la IP se lee contando desde la derecha `TRUSTED_PROXY_HOPS` saltos (0 en local; 2 detrás de Vercel → Render).
- **Cookie de sesión:** respeta `COOKIE_SECURE` y `COOKIE_SAMESITE` del `.env` al iniciar sesión, al registrarse, al restablecer la contraseña y al cerrar sesión.
- **Tokens separados:** un enlace de recuperación no sirve como sesión, ni una sesión como enlace de recuperación.
- **Dinero y personal (`staff`), lo que puede hacer en sus propias citas:** ver el total, el anticipo y el comprobante, cobrar y completar. **El precio lo decide la dueña:** una persona `staff` solo cambia el "Precio acordado" o el monto de cobro si el servicio es de **precio variable** o si la dueña prendió **"Mi equipo puede cambiar precios y quitar anticipos"** en Configuración (`businesses.staff_can_edit_price`, apagado por defecto). Sin ese permiso la API responde 403 ("El precio de este servicio lo cambia la dueña o el administrador") en `PUT /api/appointments/{id}/quote`, en el cobro con `final_price` y al crear una cita con precio distinto o con `waive_deposit`; la Agenda esconde esos campos. No ve Reportes, caja, comisiones de otras personas ni el costo de los productos.
- **Lo que ve el personal (`staff`):** de Clientes solo quienes están en su propia agenda y solo sus visitas (`GET /api/clients` y la ficha responden 404 para los demás); de Productos ve nombre, precio y existencias, no el costo. Nombres de negocio, equipo y personas se guardan sin etiquetas HTML (`app/core/text.py`).
- **Sesión que se cierra sola:** (1) al cambiar la contraseña, las sesiones abiertas dejan de valer (el token lleva la huella de la contraseña, `pf`; las sesiones anteriores a este cambio siguen valiendo hasta vencer); (2) si el negocio se suspende (`is_active` falso), nadie de ese negocio entra ni sigue en el panel ("Este negocio está suspendido"); (3) una persona del equipo con cuenta que se da de baja deja de entrar ("Tu acceso fue dado de baja"). Lo aplican `get_current_user` y `login` con `_ensure_access` (`app/routers/auth.py`). La cuenta de plataforma (`super_admin`) no se ve afectada.
- **Enlaces en correos:** se arman con la dirección desde la que se abrió la app solo si es de confianza (`app/core/origins.py`): en local, cualquier `localhost`; en producción, únicamente `FRONTEND_URL`. Así nadie puede mandarte un enlace de recuperación a un sitio falso.
- **CORS:** en producción solo se acepta el dominio de `FRONTEND_URL`; en desarrollo, cualquier puerto de `localhost`.
- **Pausa y cierres:** la API también los respeta (disponibilidad, reservas y cambios de cita de la clienta) con `app/core/shop_note.py`. Las citas que crea la dueña no se bloquean.
- **Títulos de pestaña:** cada pantalla del panel y de acceso lleva su título ("Agenda · Nexia", "Entrar · Nexia"…); la reserva usa el nombre del negocio y la página de la cita "Tu cita · negocio".
- **Validaciones en la API:** teléfono de 10 dígitos (también en reservas públicas y lista de espera, `ten_digit_phone` en `app/core/booking.py`), enlace de pago con `https://`, fechas de cierre completas y en orden, fotos solo como imágenes pequeñas (hasta 3), mensajes de hasta 1000 caracteres.
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
npm run setup                              # solo la primera vez: crea .venv e instala dependencias
npm start                                  # API en http://localhost:8000 (se reinicia sola al guardar)
npm test                                   # pruebas (base temporal; no tocan tus datos). Filtrar: npm test -- -k opinion
.venv/bin/python scripts/backup_db.py      # respaldo manual

# Frontend
cd nexia-frontend
npx ng serve --port 4200
npx ng test --watch=false
```

- **Variables de entorno:** están explicadas en `nexia-backend/.env.example`. Las más recientes son las de WhatsApp (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`), `SPEI_CHECK` y la cuenta de plataforma (`SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`). Si tu base local ya tenía la cuenta de plataforma de antes, sigue ahí con la contraseña vieja: bórrala o cámbiala.
- **Correos en local:** sin `RESEND_API_KEY` no se envían; se escriben en la terminal del backend, con su enlace, para probar recuperar contraseña o los avisos.
- **El puerto del frontend puede ser cualquiera.** Los enlaces que arma el backend (correos y `/s/:negocio`) usan la dirección desde la que se abrió la app.
- **Migraciones:** las columnas nuevas se agregan solas al arrancar (`app/db/init_db.py`); no hay herramienta de migraciones. Ahí también se pasan a sus columnas los datos que quedaron con el formato viejo, empaquetados dentro de `resources`.
- **Zona horaria:** las citas se guardan como hora local del negocio, sin zona. Para "ahora" y "hoy" usa siempre `local_now(business)` / `local_today(business)` de `app/core/clock.py`, nunca `datetime.now()` ni `date.today()`: el servidor corre en UTC. La zona se toma del navegador al registrarse y se cambia en Configuración → Reglas de reserva. **El frontend también usa la del negocio** (`timezone` en `GET /api/auth/me`; `core/business-clock.ts` arma la hora de pared del negocio): Agenda e Inicio ya no dependen de la zona del navegador.
- **Piezas del backend que conviene conocer** (`app/core/`):

  | Archivo | Para qué |
  |---|---|
  | `clock.py` | Hora local de cada negocio |
  | `throttle.py` | Límite de intentos por IP |
  | `origins.py` | Dirección de confianza para enlaces |
  | `mailer.py`, `emails.py` | Envío con Resend y textos de los correos |
  | `alerts.py` | Avisos por correo y resumen diario |
  | `agenda_scope.py` | Qué agenda puede ver y tocar cada rol |
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
- **Anticipos vencidos en segundo plano:** cada 10 minutos (`sweep_deposits`, junto al resumen diario en `app/main.py`) se liberan los horarios cuyo anticipo venció y se avisa a la dueña de los que siguen sin pagarse. Consultar los avisos (`GET /api/notices`, cada 20 segundos desde el panel) ya no escribe nada; de todos modos, las consultas de horarios y de citas siguen liberando lo vencido para que nadie vea un horario ocupado por un anticipo que ya no cuenta.
- **Resumen diario:** en el plan gratis de Render llega tarde si la API está dormida a las 8 p. m.; en un plan de pago sale a tiempo.
- **Respaldos:** `scripts/backup_db.py` revisa cada copia y, si defines `BACKUP_S3_BUCKET` (S3, R2 o B2; `pip install -r requirements-backup.txt`), la sube fuera del servidor. Falta crear el Cron Job diario en Render y el bucket, y probar la subida con credenciales reales. Restaurar: `pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" archivo.dump`.

---

## 9. Pendientes y planes futuros

**Antes de abrir a negocios reales**
- Llenar razón social, domicilio, correo y ciudad en `src/app/features/legal/legal-info.ts`, y pedir a un abogado que revise `/terminos` y `/privacidad`. La sección "Precio del servicio" de los términos es genérica: confirmar si Nexia va a cobrar.
- Configurar Resend con el dominio y verificar `TRUSTED_PROXY_HOPS` en Render (ver la sección 8).
- Crear la llave de Google Maps y el ID de mapa (ver "Ubicación del local" en la sección 4) y probar en el navegador el buscador, el pin y el mapa fijo.
- **Seguridad que sigue** (de la revisión del 22 de oct): (ya hecho: la sesión se invalida al cambiar la contraseña, al suspender un negocio o al dar de baja a una persona); poner la base de datos en un plan de pago y programar respaldos que se suban fuera del servidor antes de abrir a negocios reales.
- ~~**Probar la doble reserva en PostgreSQL**~~ (hecho el 26 de oct: 25 rondas de 10 reservas simultáneas con 2 procesos, siempre pasó una; sin `lock_staff` fallan todas). Repetir una vez en la base real de Neon/Render.
- Recorrer en el navegador: el registro en celular, recuperar contraseña con un correo real y los menús del selector de hora en modo oscuro.

**Para encender lo automático** (hoy en pausa; ver "En pausa" en la sección 4)
- Crear la app de Meta y conectar un número de WhatsApp Business. Aprobar las plantillas `nexia_recordatorio` (con los botones rápidos "Confirmo" y "Cambiar") y `nexia_te_toca` (textos en `.env.example`). Registrar el webhook `/api/whatsapp/webhook` y poner las 4 variables en Render. Cada plantilla enviada tiene costo en Meta.
- **Plan de pago:** el envío automático es el candidato natural. Hoy cualquier negocio lo puede encender; falta el cobro y limitarlo a ese plan.
- **SPEI:** probar con una transferencia real y su clave de rastreo. El CEP es el formulario público de Banxico; si cambia su formato, ajustar `app/core/spei.py`. Otra opción más estable es un proveedor con webhook de depósitos (por ejemplo, una CLABE por negocio en STP).

**Siguientes mejoras de Configuración** (en este orden)
1. ~~**Regla para clientas que faltan**~~ (hecho: Configuración → Anticipo y pagos).
2. ~~**Enlace personalizado**~~ (hecho: Mi negocio → Personalizar el enlace).
3. ~~**Tope de citas por día** y **qué pasa con el anticipo si la clienta cancela**~~ (hecho; el tope es por negocio, falta por colaboradora si lo piden).
4. **Mensajes agrupados** por momento (antes de la cita, después, para atraer clientas).

**Corto plazo**
- **Inicio:** ~~cumpleaños desde el backend~~ y ~~avisos con tipo y "visto"~~ (hechos); falta guardar en el negocio el "Ocultar" de la lista de arranque (hoy en el navegador).
- ~~Limpiar el código muerto~~ (hecho).
- Pasar el límite de intentos a Redis si algún día hay varios servidores.
- ~~Que la agenda use la zona horaria del negocio~~ (hecho).

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

### 22 de octubre de 2026

Revisión de seguridad y de flujo (UX/UI, backend y frontend) con las ramas `feature/backend` y `feature/frontend`.

| Repositorio | Commit | Qué cambió |
|---|---|---|
| backend | (sin commit) | **Cuenta de plataforma sin contraseña fija:** `super_admin` solo se crea con `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD`; antes `init_db.py` creaba una cuenta con contraseña escrita en el código en cada arranque, también en producción. |
| backend | (sin commit) | **Imágenes públicas seguras** (`app/core/images.py`): solo PNG, JPG, WebP y GIF al guardar (foto de referencia, comprobante, galería, logo, servicio y opinión) y al servir (`/photos/{n}`, `/logo`), con `nosniff` y `sandbox`. Cierra el riesgo de un SVG con script abierto desde el panel. |
| backend | (sin commit) | **Permisos por rol en la API:** `ManagerDep` (owner y admin) en Reportes, comisiones, gastos, caja, inventario, servicios, equipo, horarios, borrar o importar clientes, borrar paquetes y responder opiniones. La lista del equipo, vista por una `staff`, no trae comisiones, metas ni contacto. `settings.py` y `demo.py` usan el mismo `ManagerDep` (ahora en `auth.py`). |
| backend | (sin commit) | **Límites de intentos:** login (10 fallos por IP y por correo, y tiempo igual para correo inexistente), `/loyalty` y `/package`, opiniones y todos los enlaces de la cita (comprobante, "Ya pagué", confirmar, cancelar, cambiar, aceptar precio y `/spei`). `throttle` acepta `limit` y limpia sus claves vencidas. |
| backend, frontend | (sin commit) | **Una opinión por cita:** `POST /api/reviews/public/{slug}` pide el `token` de la cita, que debe estar completada y ser de ese negocio, y responde 409 si ya tiene opinión. Columna nueva `reviews.appointment_id` (con migración en `init_db.py`). El frontend manda el token desde la página de la cita. |
| backend | (sin commit) | **`npm start` en el backend**, como en el frontend: `package.json` y `scripts/dev.js` (sin dependencias de Node) llaman al Python de `.venv` o `venv`. `npm start` levanta la API en el puerto 8000 con recarga, `npm test` corre pytest y `npm run setup` prepara el entorno la primera vez. `NEXIA_PYTHON` y `PORT` permiten cambiar el Python o el puerto. |
| backend | (sin commit) | **Pruebas de seguridad con sesión real** (`tests/test_security.py`): entran por `/api/auth/login`, comprueban 22 rutas prohibidas para `staff`, que la agenda de `staff` sigue funcionando, el aislamiento entre dos negocios, imágenes, límites, opiniones y la cuenta de plataforma. |
| backend | (sin commit) | **Reservas y citas, paso 2:** reagendar desde el enlace conserva la duración real y aplica anticipación mínima y días máximos; reservar, esperar un horario y cambiar de persona exigen que esa persona haga el servicio; teléfono de 10 dígitos en reserva pública y lista de espera; estados de cita válidos (completada ya no se cancela, etc.) y revisión de empalmes al deshacer una cancelación; bloqueo por persona contra doble reserva (`lock_staff`); corregido el error 500 al crear un bloqueo recurrente (`blocks.py` no importaba `Business`). Pruebas en `tests/test_booking_rules.py`. |
| frontend | (sin commit) | **Reserva y página de la cita, paso 3 (primera parte):** los enlaces de WhatsApp del negocio llevan el 52; "Atrás" del navegador regresa de paso en la reserva; un error al cancelar o cambiar la cita ya no reemplaza toda la página; cancelar usa el diálogo `Confirm` y no `window.confirm`; estrellas, caja de opinión y horarios de la página de la cita usan los tokens y miden 44 px. |
| backend, frontend | (sin commit) | **Paso 3, segunda parte:** al cambiar una cita desde su enlace, la lista de horarios usa la duración real de la cita y no cuenta su propio horario (`GET /api/public/appointments/{token}/slots`, con prueba); títulos de pestaña en el panel y el acceso (y "Tu cita · negocio"); página "No encontramos esta página" para direcciones que no existen. |
| backend, frontend | (sin commit) | **Agenda, paso 4:** el personal (`staff`) solo ve y toca su propia agenda: citas, bloqueos y lista de espera (`app/core/agenda_scope.py`); `GET /api/notices` ya no escribe (el aviso de anticipos vencidos pasó a `sweep_deposits`, que corre cada 10 minutos en segundo plano); corregido `needsQuote` de la Agenda, que pedía cotizar servicios de precio fijo y citas ya cotizadas. Pruebas en `tests/test_agenda_scope.py`. |
| backend, frontend | (sin commit) | **Reportes y Caja, paso 5:** el punto de equilibrio ahora resta también las compras de producto (antes la ganancia no llegaba a cero en ese ingreso); el corte de caja ya no cuenta el anticipo como efectivo; un segundo pago de comisión se suma al primero en vez de reemplazarlo y los pagos de un periodo largo se reparten por días entre sus semanas; "Quitar pagos" borra los pagos del periodo visto; Reportes ya no pide el mismo reporte varias veces al cargar el catálogo y el resumen, y descarta respuestas viejas al cambiar de periodo. Pruebas en `tests/test_report_math.py`. Nuevo `docs/flujo-completo.mermaid`. |
| backend, frontend | (sin commit) | **Gastos fijos por fecha de pago:** cada gasto fijo tiene día de pago (`expenses.pay_day`, columna nueva en `init_db.py`) y cuenta completo en el periodo donde cae, en vez de repartirse por día (la renta de $3,000 ya no baja a $2,129 a mitad de mes). Reportes muestra "Falta pagar este mes" y "Próximos pagos"; el formulario de gastos pide "Día de pago". Pruebas en `tests/test_report_math.py`. |
| frontend | (sin commit) | **Sistema de diseño, paso 6:** chips, botones, pestañas y íconos táctiles a 44 px (zona táctil de 44 px en los interruptores sin cambiar su dibujo); ningún texto bajo `text-xs` (13 px: se quitaron los de 10 y 11 px, incluida la barra inferior y la etiqueta de grupos del menú); colores sueltos reemplazados por tokens (`--nx-bad-fg`, `--nx-ok-fg`, `bg-surface`, `text-line-strong`); `.btn-whatsapp` a verde más oscuro (contraste 5.4:1); Inventario (Caja) usa `.input`, `.btn` y `.card`; la etiqueta de temporada de la reserva ya no lleva emoji; se quitó la barra vertical junto a las pestañas de pasos (`overflow-y: hidden`) y sus colores usan tokens. Quedan a propósito en blanco fijo los logos sobre fondo claro y la vista previa de la página pública en Configuración; el calendario imprimible de la Agenda conserva sus adornos de temporada. |
| backend, frontend | (sin commit) | **Corte de caja correcto:** las propinas y la venta de productos ya entran al efectivo esperado según su método (antes no se separaban); fondo de apertura, entradas y salidas de caja (una salida puede quedar también como gasto en Reportes), corte que se cierra con responsable y se reabre a propósito, y no se cierran días futuros. Vender un producto (Inventario y al cobrar una cita) guarda cómo se pagó. Columnas nuevas en `init_db.py`: `sales.method`, `cash_counts.opening/closed/closed_by/closed_at`; tabla nueva `cash_moves`. Pruebas en `tests/test_cash_cut.py`. |
| frontend | (sin commit) | **Tarjeta por colaboradora (Reportes):** la pestaña "Por colaboradora" pasa de una lista con tres datos a una tarjeta por persona con ventas, citas, ticket, por hora, regresan, ocupación, meta, faltas/cancelaciones, propinas y comisión por pagar. La tabla de comparación solo se muestra en pantallas grandes. Sin cambios en el backend: los datos ya venían en `GET /api/shop/report` (`staff`). |
| backend, frontend | (sin commit) | **"Ya pagué" y por cobrar en Reportes:** cada pago de un gasto fijo se puede marcar como pagado (cuenta el día que se pagó, sale de "Falta pagar" y se puede deshacer); borrar un gasto limpia sus pagos y desliga el movimiento de caja que lo creó. Ingresos avisa cuántas citas ya pasaron sin cobrarse y cuánto falta (`uncollected_count`, `uncollected_amount`, `uncollected`). Tabla nueva `expense_payments`. Pruebas en `tests/test_report_math.py`. |
| backend, frontend | (sin commit) | **Descargas de Reportes al día:** el Excel y el PDF ahora traen Resumen, por cobrar, falta pagar, tarjetas por colaboradora, pagos marcados, próximos pagos y la hoja de Corte de caja; los montos salen como número (antes eran texto, no se podían sumar). El CSV del contador suma "Compras de producto". Nuevo `GET /api/shop/cash/range`. Prueba en `tests/test_cash_cut.py`. |
| backend, frontend | (sin commit) | **Resumen de tres preguntas en Reportes:** tarjeta arriba con ganancia o pérdida (y cuánto falta para cubrir gastos), lo que falta cobrar y pagar (citas pasadas, gastos fijos del mes y comisiones) y a quién cuidar (clientes que dejaron de venir, que cancelan seguido y quien más faltas tuvo), cada una con su botón; el análisis a fondo se abre con "Ver análisis a fondo". Nuevos `clients_missing` y `clients_cancelling` en `GET /api/shop/report`. Prueba en `tests/test_report_math.py`. |
| backend, frontend | (sin commit) | **CRM: mensajes anotados y medición:** cada Invitar, Felicitar y Te toca queda registrado por cliente (`client_contacts`); Clientes muestra "Invitado hace…" y la ficha su historial de mensajes; Reportes mide cuántos de los invitados regresaron o agendaron y cuánto dejaron (`winback_sent/returned/booked/revenue`). Tabla nueva `client_contacts`. Pruebas en `tests/test_contacts.py`. |
| frontend, backend | (sin commit) | **Inicio más claro:** "Cobrado hoy" (con lo que falta), íconos y estado apagado distintos en Sin confirmar y Por resolver, acciones rápidas (Clientes, enlace, reportes), tarjeta "A quién escribirle hoy", barra verde al terminar el día, Avisos agrupados, con punto de nuevo, 3 a la vista y "Marcar como vistos", se quitó el "anticipo" suelto del texto y el aviso semanal habla en pesos con "arriba de". |
| frontend | (sin commit) | **Agenda con estado a la vista y acciones en el día:** cada cita lleva un ícono (confirmó, sin confirmar, cobrada, cancelada o no llegó) además del color de quien atiende; el panel del día muestra la hora arriba del nombre (ya no se corta) y trae **Cobrar** y WhatsApp para pedir confirmación en cada fila. "Horarios libres" ya abría la cita con esa hora. |
| frontend | (sin commit) | **Inventario (Caja) fuera de la fase 1 beta:** se comentó la entrada "Inventario" del menú (`admin-layout.ts`) y la ruta `/admin/caja` (`admin.routes.ts`); el código de la pantalla y el backend (`/api/shop/products`, ventas) se quedan intactos. Para reactivarlo, descomentar esas dos líneas. El corte de caja sigue en Reportes y vender un producto al cobrar una cita sigue funcionando si hay productos creados. |
| frontend | (sin commit) | **Reserva: mayúsculas en fechas:** el mes y el día ya no salen como "Octubre De 2026" o "Jueves, 22 De Octubre" (se usaba `capitalize`; ahora solo la primera letra va en mayúscula). **Pasada en celular (430 px), controles a 44 px:** filtros de categoría, días y flechas del calendario, horas, contacto del negocio, "Agregar correo o nota" y "¿Tienes un cupón?" en la reserva; Mes/Semana/Día de la Agenda; flechas para ordenar Servicios; "Editar" e Instagram de Mi negocio; "Ver cita" y WhatsApp de Avisos; iniciales del avatar de Clientes a 13 px. Sin desbordes horizontales en ninguna pantalla. |
| frontend | (sin commit) | **Reserva más clara en celular:** del paso 2 en adelante el encabezado se compacta (logo y nombre, y "Contacto y ubicación" plegado; de 297 a 144 px) para que las horas queden a la vista; al elegir un servicio queda con palomita y, en celular, la página baja sola hasta "¿Sumas otro servicio?" y la persona que atiende; duraciones como "1 h 55 min" en vez de "115 min", precios sin centavos cuando son redondos ("$280") y "Te confirmamos el precio" en lugar de "Precio según lo que pidas". |
| frontend | (sin commit) | **Reserva, segunda ronda:** si una sola persona hace el servicio, el paso 1 muestra "Te atiende: mayra · Estilista" en una línea (sin tarjeta grande); la tarjeta del servicio ya no repite la categoría cuando se llama igual; el paso 3 abre con un resumen de la cita ("Jueves, 22 de octubre · 06:00 p.m.", servicio, precio, con quién) y "Cambiar día u hora", y la barra de abajo ya no repite el día. |

Pruebas: backend 126 (1 omitida a propósito), frontend 33, todas pasando.
| backend, frontend | (sin commit) | **Después de reservar y ubicación con mapa de Google:** la confirmación (y "Ver o cambiar mi cita") abre con la tarjeta del anticipo (cuenta y CLABE con botón grande de copiar) y dos acciones a un toque: **Agregar a mi calendario** (archivo .ics con dos recordatorios, un día y dos horas antes; también enlace a Google Calendar) y **Cómo llegar**. En Configuración > Mi negocio se puede pegar el código "Insertar un mapa" de Google Maps o un enlace corto (maps.app.goo.gl) y ese mapa es el que ven los clientes en "Cómo llegar". Columna nueva `businesses.map_embed` (`init_db.py`); `POST /api/settings/map-link` (con límite por IP) que valida el iframe y resuelve enlaces cortos solo hacia dominios de Google (`app/core/map_link.py`); la cita pública devuelve `ends_at` y `map_embed`. Frontend: `core/calendar.ts`. Pruebas en `tests/test_map_link.py` y `core/calendar.spec.ts`. |
| backend, frontend | (sin commit) | **Cancelar una cita que espera anticipo:** desde su enlace, quien apartó con anticipo ya puede cancelar (antes la API respondía 409 y el horario seguía ocupado, y contaba para el límite de 3 citas); "Cambiar fecha u hora" ya no se muestra en ese estado. Nuevo `_ensure_cancellable` en `public_appointments.py`; prueba en `tests/test_booking_rules.py`. También: el aviso "Te guardamos el horario hasta…" ya no termina en "p.m.." y "Agregar a mi calendario" baja a dos líneas en pantallas de 390 px en vez de salirse del botón. |
| backend, frontend | (sin commit) | **Precio de combos, avance de la cita y enlaces a otros días:** (1) reservar con opción o extras ahora guarda el total en `quoted_price` (antes los extras no sumaban en Reportes, Inicio ni Caja); (2) `?cita=ID` abre la ficha aunque la cita sea de otro día: nuevo `GET /api/appointments/{id}` y `ends_at` en `AppointmentRead`; (3) estado en vivo de la cita: Por venir, En curso, Terminó · falta cobrar y Finalizada · cobrada, en la lista de Agenda, la ficha y Inicio (`core/appointment-progress.ts`). La página de la cita dice "Total" y solo ofrece "Sí, ese precio" si el precio es variable. Pruebas en `tests/test_booking_rules.py`, `tests/test_agenda_scope.py` y `core/appointment-progress.spec.ts`. |
| backend, frontend | (sin commit) | **La cita muestra todo lo que se apartó:** la confirmación y la página de la cita ahora enseñan extras, opción elegida, duración real y total; si ya se aceptó el anticipo, "Anticipo recibido: $X. En tu cita pagas $Y". Cuando la cita ya no se puede cambiar (horas mínimas de cancelación) hay un botón "Escribir a [negocio]" por WhatsApp con el mensaje listo. `PublicAppointmentRead` suma `extra_label`, `option_name` y `business_phone`; helpers en `core/appointment-summary.ts`. Pruebas en `tests/test_booking_rules.py` y `core/appointment-summary.spec.ts`. |
| backend, frontend | (sin commit) | **Pendientes menores de la revisión:** (1) las páginas públicas ya no piden la sesión (adiós al 401 en la consola); (2) el teléfono se guarda con 10 dígitos y el nombre sin HTML; (3) una cita con anticipo aceptado ya no dice "Sin confirmar", dice "Anticipo pagado" (Agenda e Inicio); (4) al cancelar desde la página de la cita ya no sale "Cita cancelada" dos veces; (5) la confirmación al reservar ya no muestra las pestañas de pasos; (6) áreas táctiles de 44 px en "Cómo llegar", "Copiar enlace", "Ver mi cita", "Quitar logo", "Quitar del mapa", "Cerrar todos", selector de Reportes y enlaces a la agenda. Pruebas en `tests/test_booking_rules.py`, `auth.service.spec.ts` y `appointment-progress.spec.ts`. |
| backend | (sin commit) | **Revisión de dinero (cobrar, caja, comisiones, cupones):** se recorrió con un negocio de prueba y montos hechos a mano (servicios con anticipo, combo, propinas por método, productos, cortes de caja, comisiones del 20% y 30%): Reportes y Caja coincidieron al centavo. Se corrigió: (1) el cupón de "primera visita" se podía usar en varias reservas antes de cobrar la primera; (2) un cupón del 100% pedía igual el anticipo; (3) el precio final y la propina no tenían tope. Además una prueba de caja fallaba de noche por usar la fecha del servidor (UTC) en vez de la del negocio (`tests/test_cash_cut.py`). Pruebas nuevas en `tests/test_booking_rules.py`. |
| backend, frontend | (sin commit) | **Aislamiento entre negocios y sesión:** se probaron ~40 rutas del panel con ids de otro negocio (todas 403/404, sin fugas; `tests/test_tenant_isolation.py`). Nuevo: cambiar la contraseña cierra las sesiones abiertas, un negocio suspendido y una persona dada de baja ya no entran (`tests/test_session_access.py`). Idioma por giro: "Manicurista" ya tiene plural propio y un giro sin término conocido dice "Colaborador/Colaboradores" (`core/business-words.ts`, con `business-words.spec.ts`). |
| backend, frontend | (sin commit) | **Roles y registro:** se recorrió el panel como `staff` y `admin` en celular y el registro de un negocio dental hasta su primera cita pública, sin correo. Corregido: la colaboradora veía todos los clientes (con lo que han gastado) y el costo de los productos; el nombre del negocio, del equipo y de quien se registra aceptaban HTML; "Clientes" fijo en Inicio y en la lista de clientes ahora sigue el giro (Pacientes, Tutores…). Pruebas en `tests/test_security.py`. Pendiente: no hay pantalla para crear cuentas `admin`, y los textos de ayuda de Configuración, Servicios y Reportes aún dicen "cliente". |
| frontend | (sin commit) | **Textos por giro en el panel:** los "cliente(s)" fijos de Configuración, Servicios, Mi negocio, Horarios, Agenda, Reportes y Equipo ahora salen de `copy.text()` (Pacientes en dental, Tutores en veterinaria, Alumnos en clases, Cliente en el resto). Sigue pendiente la página pública de reservas y el registro, donde aún no se conoce el giro. |
| backend, frontend | (sin commit) | **PostgreSQL, respaldos y textos:** (1) `DATABASE_URL` se normaliza a `postgresql+psycopg2://` (`normalize_database_url` en `app/core/config.py`): con SQLAlchemy 2.1, `postgresql://` usaba psycopg 3 y el servidor no arrancaba con `psycopg2-binary`; (2) doble reserva probada en PostgreSQL; (3) `scripts/backup_db.py` verifica la copia y puede subirla a S3/R2/B2, con `tests/test_backup.py`; restauración probada con conteos iguales; (4) "cliente" por giro en la página pública ("Paciente frecuente") y bajo el teléfono del registro; (5) revisión del modo oscuro en las pantallas del panel sin hallazgos. Nota: el código marcado `FUTURE_PHASE_*` es deliberado (funciones en pausa), no código muerto. |
| backend, frontend | (sin commit) | **Colaboradora:** su menú ahora incluye Clientes/Pacientes (solo los suyos) y su perfil tiene "Subir foto" con vista previa, cambiar y quitar (`core/image-file.ts`) en vez de pedir un enlace; la API de equipo solo acepta fotos PNG, JPG, WebP, GIF o `https` (`tests/test_security.py`). Nuevo `scripts/clean_names.py` (con `--apply`) que quita HTML de nombres guardados antes del filtro; prueba en `tests/test_clean_names.py`. |
| backend, frontend | (sin commit) | **Precio y colaboradora:** `businesses.staff_can_edit_price` (apagado por defecto; columna en `init_db.py`) y switch "Mi equipo puede cambiar precios y quitar anticipos" en Configuración. Sin él, `staff` no cambia precio ni quita anticipo salvo en servicios de precio variable (403 en `quote`, cobro y alta de cita) y la Agenda esconde esos campos. Los negocios existentes quedan en el modo estricto. Prueba en `tests/test_security.py`. |
| backend, frontend | (sin commit) | **Reportes y Caja dicen lo mismo:** "Cómo te pagaron" cuenta el anticipo como transferencia y el resto con el método de cobro (antes todo iba al método final y Caja lo restaba). Aviso bajo la lista. Prueba en `tests/test_report_math.py`. |
| backend, frontend | (sin commit) | **Cuentas del equipo:** Equipo → "Acceso al panel" da acceso con contraseña temporal (se ve una vez, mensaje para WhatsApp), la restablece o la quita; el primer acceso obliga a elegir contraseña (`users.must_change_password`, `POST /api/auth/change-password`, `/auth/cambiar-contrasena`). Pruebas en `tests/test_team_access.py`. |
| backend, frontend | (sin commit) | **Tope por día, anticipo al cancelar y faltas:** `businesses.max_daily_appointments`, `deposit_cancel_policy` (`refund`/`keep`), `noshow_after`, `noshow_deposit` y `appointments.deposit_reason` (columnas en `init_db.py`; ajustes en `PATCH /api/settings/business`). Día lleno: sin horarios y 409 al reservar o cambiar la hora. La política de anticipo se ve antes de confirmar y en la cita. Pruebas en `tests/test_booking_policies.py` y `core/deposit-policy.spec.ts`. |
| backend, frontend | (sin commit) | **Inicio y avisos desde el servidor:** `GET /api/clients/birthdays`; avisos con `kind`, `appointment_id`, `data` y `seen` y `POST /api/notices/seen` (adiós a las expresiones regulares y al "visto" en el navegador). Pruebas en `tests/test_home_data.py`. |
| backend, frontend | (sin commit) | **Zona horaria del negocio en el panel:** `/me` devuelve `timezone`; `core/business-clock.ts` (con prueba) la usa Agenda e Inicio. Se quitó código muerto (formularios `@if (false…)` en Equipo, reseñas sin usar en reservas, colores de gráfica sin uso). |
| backend, frontend | (sin commit) | **Listo para recibir citas y acciones a un toque:** nuevo paso "Asigna servicios a tu equipo" en el arranque (`app/core/readiness.py`) y chip/aviso de avance en el layout del panel; en la ficha de la cita, "No llegó" y "Cancelar cita" salen en el pie, sin entrar a "Más opciones". |
