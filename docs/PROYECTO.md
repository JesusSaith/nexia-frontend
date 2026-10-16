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
| **Inicio** | **"Les toca volver"** (ver más abajo), indicadores del día con ícono de color (citas, sin confirmar, anticipos pendientes), lista "Pon tu negocio en marcha" con los avisos importantes, **recordatorios de mañana uno por uno por WhatsApp**, pendientes (incluye "Aprobar solicitud"), cumpleaños, citas de hoy y de mañana, avisos, más pedidos del mes y paquetes. Las tarjetas van en dos columnas independientes, sin huecos. |
| **Agenda** | Vistas Mes, Semana y Día (en celular abre en Día), con un color por colaboradora. Permite crear una cita (busca a la clienta por nombre o teléfono), **aprobar o rechazar** las solicitudes "Por aprobar" (se ven con contorno punteado y la etiqueta "Por aprobar" sin abrir la ficha), un **resumen del día** ("6 citas · $3,200 por cobrar"), **cambiar día u hora**, **cobrar y completar** con monto y método de pago (solo los que acepta el negocio, más "Paquete"), pedir la opinión, marcar "no llegó" o cancelar, repetir cada 3 o 4 semanas, bloquear horarios, marcar días libres y compartir una imagen con la disponibilidad del mes. |
| **Clientes** | Fichas unificadas por teléfono, mejores clientas, las que más cancelan, **"Dejaron de venir"** (más de 45 días) con WhatsApp para invitarlas a volver, historial con el estado de cada visita, notas internas y botones de Llamar y WhatsApp. |
| **Reportes** | Abre en **Mes** y recuerda el último periodo. Arriba, **4 números contra el periodo anterior** (ingresos, ganancia, citas completadas y ticket promedio, con ↑/↓ en %). Debajo: gráfica por día (en "Día" no se dibuja), **cómo te pagaron**, faltas, anticipos pendientes, servicio más pedido y **Resultado** (ingresos − gastos − comisiones). La **meta de ganancia** se esconde hasta que la dueña toca "Poner meta"; puesta, muestra una barra de avance. Pestañas de ingresos por colaboradora, comisiones y gastos. Un solo botón **Descargar** (Excel del periodo, Excel con todo y PDF). Sin movimientos en el periodo, muestra un aviso con "Ir a la agenda" en lugar de ceros. |
| **Servicios** | Precio, duración, foto, categoría, precio variable, anticipo propio, cupo, **cada cuántos días vuelven** y preguntas para la clienta. Si solo están los sugeridos del registro (apagados), un aviso explica que hay que revisarlos y activarlos. |
| **Equipo** | Colaboradoras, servicios que realiza cada una, comisión y foto. |
| **Horarios** | Turno por día, descanso y horas fijas. Los días abiertos llevan franja de color y los cerrados se ven en gris. Incluye "Copiar lunes" al resto de la semana. |
| **Mi negocio** | Enlace para compartir (con vista previa), código QR, contacto y la misma lista de "qué te falta" que Inicio. |
| **Configuración** | Ver la sección siguiente. |

### Configuración (`/admin/settings`)
- **Franja de estado arriba:** "Tu página está recibiendo reservas", "Tu página no está tomando citas" o "Cierras del 20 al 27 oct", con un interruptor y el botón **"Ver mi página"**.
- **La pausa se aplica al momento:** el interruptor (arriba o en Pausa y vacaciones) guarda solo `bookings_paused`, sin arrastrar otros cambios pendientes, y avisa con un mensaje.
- **Vista previa en vivo** (solo en pantallas muy anchas, 1536 px o más): a la derecha, el encabezado de la página de reservas con lo que se lleva escrito, sin guardar: portada, logo, nombre, color, anuncio, pausa o próximo cierre, métodos de pago y un servicio de ejemplo. El índice lateral de secciones se queda siempre en escritorio; los chips son solo para celular.
- **Llegar directo a lo que falta:** `/admin/settings?sec=anticipo` abre y baja a esa sección. Los avisos de Inicio y Mi negocio usan esa dirección.
- **Nueve secciones**, cada una con un **resumen visible aunque esté cerrada** (por ejemplo, "$200 · 3 h para pagar · falta la cuenta"):
  1. **Tu negocio:** nombre, tipo, descripción, WhatsApp (10 dígitos), dirección y redes.
  2. **Apariencia:** logo, color de marca con vista previa y fotos del trabajo (hasta 3). Del logo solo se **sugiere** un color; no se cambia solo.
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
Están programados y probados, pero **apagados y sin mostrarse** hasta decidir encenderlos. En el código se buscan con `FUTURE_PHASE_WHATSAPP` y `FUTURE_PHASE_SPEI`.
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
- **Privacidad:** aviso por negocio; las fotos de referencia se borran a los 30 días; los datos de la clienta se recuerdan solo en su propio dispositivo; los mensajes personalizados de la dueña no salen en la página pública.
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
- Recorrer en el navegador: el registro en celular, recuperar contraseña con un correo real y los menús del selector de hora en modo oscuro.

**Para encender lo automático** (hoy en pausa; ver "En pausa" en la sección 4)
- Crear la app de Meta y conectar un número de WhatsApp Business. Aprobar las plantillas `nexia_recordatorio` (con los botones rápidos "Confirmo" y "Cambiar") y `nexia_te_toca` (textos en `.env.example`). Registrar el webhook `/api/whatsapp/webhook` y poner las 4 variables en Render. Cada plantilla enviada tiene costo en Meta.
- **Plan de pago:** el envío automático es el candidato natural. Hoy cualquier negocio lo puede encender; falta el cobro y limitarlo a ese plan.
- **SPEI:** probar con una transferencia real y su clave de rastreo. El CEP es el formulario público de Banxico; si cambia su formato, ajustar `app/core/spei.py`. Otra opción más estable es un proveedor con webhook de depósitos (por ejemplo, una CLABE por negocio en STP).

**Siguientes mejoras de Configuración** (en este orden)
1. **Regla para clientas que faltan:** pedir anticipo de forma automática a quien falta seguido.
2. **Enlace personalizado:** poder cambiar el slug, sin romper el enlace anterior (QR impresos).
3. **Tope de citas por día** (por negocio o por colaboradora) y **qué pasa con el anticipo si la clienta cancela**.
4. **Mensajes agrupados** por momento (antes de la cita, después, para atraer clientas).

**Corto plazo**
- Una sola opinión por cita.
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

Pruebas: backend 49 (1 omitida a propósito: el webhook en pausa), frontend 30, todas pasando.
