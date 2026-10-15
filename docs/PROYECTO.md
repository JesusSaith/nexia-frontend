# Nexia: cómo funciona el proyecto

Nexia es un sistema de reservas en línea para negocios que atienden con cita: salones, barberías, spas, consultorios, veterinarias y clases. Cada negocio tiene una página pública donde sus clientas reservan y un panel donde la dueña administra agenda, clientas, cobros y reportes.

Este documento explica cómo está armado, cómo fluye cada proceso y qué queda pendiente.

---

## 1. Arquitectura

| Pieza | Tecnología | Carpeta |
|---|---|---|
| Frontend | Angular 20 (componentes standalone, signals), Tailwind v4, Angular Material (diálogos e íconos) | `nexia-frontend` |
| Backend (API) | FastAPI + SQLModel (SQLAlchemy) | `nexia-backend` |
| Base de datos | SQLite en desarrollo (`nexia_dev.db`), PostgreSQL en producción | — |

**Varios negocios, una instalación.** Todos los negocios viven en la misma base. Cada fila pertenece a un `business_id`, y la página pública se identifica por el `slug` del negocio (`/salon-ana/book`).

**Cómo se conectan**
- En local, el frontend llama a `http://localhost:8000/api` (`src/app/core/config/api-base-url.ts`).
- Publicado, llama a `/api` de su propio dominio, y Vercel reenvía esas peticiones al backend (`vercel.json`). Así la cookie de sesión es del mismo sitio y no hay problemas de CORS.
- La sesión es un JWT en una cookie `httpOnly` (`access_token`).

**Roles:** `owner` (dueña), `admin`, `staff` (colaboradora, con acceso solo a su agenda y su perfil) y `super_admin` (plataforma). La creación de cuentas para colaboradoras está apagada por ahora.

---

## 2. Flujo de la clienta (página pública)

Ruta: `/:negocio/book`. Código: `src/app/features/booking/pages/booking/`.

### Paso 1. Servicio
- Elige un servicio. Puede filtrar por categoría y sumar servicios extra a la misma cita.
- Si solo una colaboradora hace ese servicio, queda elegida sola. Si hay varias, aparece **"Cualquiera disponible"**.
- Al tocar una colaboradora (o "Cualquiera") avanza sola al paso 2.

### Paso 2. Horario
- **"Lo más pronto":** tres atajos con el primer horario libre de los próximos días.
- El calendario abre en el primer día con lugares, y salta al mes siguiente si el actual está lleno.
- Las horas aparecen agrupadas en Mañana, Tarde y Noche. Al tocar una, avanza al paso 3.
- Si el día no tiene lugares, puede anotarse en la **lista de espera**.

### Paso 3. Datos
- Teléfono (10 dígitos), nombre, y correo o nota de forma opcional.
- **Servicios con precio variable (cotización):** campo "Qué necesitas" y hasta 3 **fotos de referencia**, que se comprimen en el celular.
- **Desglose de dinero:** cuánto paga hoy de anticipo, cuánto en la cita y el total, más la política de cancelación.
- Aviso de privacidad, y un campo oculto que delata a los bots (*honeypot*).
- Si es clienta frecuente, sus datos ya aparecen llenos (se guardan en su navegador), con un botón "No soy yo" para borrarlos.

### Confirmación
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

## 3. Flujo de la dueña (panel `/admin`)

En celular hay una barra inferior con **Inicio · Agenda · Clientes · Más**.

| Pestaña | Para qué sirve |
|---|---|
| **Inicio** | Indicadores del día (citas, sin confirmar, anticipos pendientes), lista "Pon tu negocio en marcha", citas de hoy y de mañana, **recordatorios de mañana uno por uno por WhatsApp**, avisos y paquetes. |
| **Agenda** | Vistas Mes, Semana y Día (en celular abre en Día), con un color por colaboradora. Permite crear una cita (busca a la clienta por nombre o teléfono), **cambiar día u hora**, **cobrar y completar** con monto y método de pago, pedir la opinión, marcar "no llegó" o cancelar (con confirmación), repetir cada 3 o 4 semanas, bloquear horarios, marcar días libres y compartir una imagen con la disponibilidad del mes. |
| **Clientes** | Fichas unificadas por teléfono, mejores clientas, las que más cancelan, **"Dejaron de venir"** (más de 45 días) con WhatsApp para invitarlas a volver, historial con el estado de cada visita, notas internas y botones de Llamar y WhatsApp. |
| **Reportes** | Ingresos por día, semana, mes o rango, **cómo te pagaron** (efectivo, transferencia, tarjeta o paquete), gastos fijos y variables, comisiones por colaboradora, meta de ganancia y exportación a Excel o PDF. |
| **Servicios** | Precio, duración, foto, categoría, precio variable, anticipo propio, cupo y preguntas para la clienta. |
| **Equipo** | Colaboradoras, servicios que realiza cada una, comisión y foto. |
| **Horarios** | Turno por día, descanso y horas fijas. Incluye "Copiar lunes" al resto de la semana, sábado incluido. |
| **Mi negocio** | Enlace para compartir (con vista previa), código QR y estado de preparación del negocio. |
| **Configuración** | En secciones plegables: Marca (logo, fotos, promoción), Cómo se reserva (anticipación, días a futuro, tiempo entre citas, cancelaciones), Cierre o pausa, Anticipo y Aviso de privacidad. |

### Ciclo de una cita
```
Reserva (clienta o dueña)
  ├─ con anticipo → awaiting_deposit ── comprobante ── la dueña acepta ──┐
  └─ sin anticipo → scheduled ←────────────────────────────────────────┘
        ├─ recordatorio (Inicio) → la clienta confirma (client_confirmed)
        ├─ cambiar hora / cancelar / no llegó
        └─ Cobrar y completar → completed (precio final + método) → pedir opinión
```
- Si el anticipo no llega en `deposit_hold_hours` (3 h por defecto), el horario se libera solo.
- Las fotos de referencia se borran automáticamente 30 días después de la cita.

### Mejoras de la versión actual
- **Ficha de la cita como hoja deslizable** en celular, con Cobrar, WhatsApp y Mover al alcance del pulgar.
- **Deshacer al cancelar:** aparece "Cita cancelada · Deshacer" durante 5 segundos, en lugar de pedir confirmación antes.
- **Cambios al instante:** la cita se ve cobrada, movida o cancelada sin esperar a que la agenda se recargue.
- **Cobro completo:** monto, método de pago, **propina** (se suma a la comisión de la colaboradora), **productos vendidos** y **nota privada de la visita**. La nota aparece como "Última visita" la próxima vez que se abre una cita de esa clienta.
- **Cotizar en un paso:** desde el aviso se abre la cita con las fotos de referencia y el precio, y queda listo el WhatsApp con el precio.
- **Repetir la última cita** desde la ficha de la clienta: mismo servicio y misma colaboradora, solo falta elegir el día.
- **Cumpleaños:** fecha opcional en la ficha; Inicio y Clientes avisan el día del cumpleaños con un WhatsApp de felicitación listo.
- **Promociones** (Configuración):
  - **cupones** por código, con opción de que solo valgan en la primera visita;
  - **lealtad**: cada N visitas cobradas, la siguiente tiene X% de descuento.
  
  El descuento lo calcula el backend al reservar y se guarda en `discount_percent`.
- **Página de reservas:** la tarjeta "Tus próximas citas" (tomadas de los enlaces guardados en el dispositivo; no hay búsqueda por teléfono, por seguridad), y la foto, el puesto y la descripción de cada colaboradora más grandes, junto con la calificación general del negocio.
- **El panel se instala como app (PWA)** y tiene **modo oscuro** (Claro, Oscuro o Sistema); la página pública de reservas siempre se ve en claro.
- **Datos de ejemplo** con un botón (Inicio → "Llenar con ejemplo"), para demos, y la lista **Pendientes** en Inicio.

---

## 4. Seguridad y protección

- **Arranque seguro:** con `ENVIRONMENT=production`, la API no arranca si `JWT_SECRET` es el de ejemplo, si `COOKIE_SECURE` es falso, si la base es SQLite o si `FRONTEND_URL` no usa `https`.
- **Contra citas falsas:**
  - campo trampa (*honeypot*);
  - máximo 6 intentos por IP cada 10 minutos (en memoria);
  - máximo 3 citas próximas por teléfono.
- **CORS:** en producción solo se acepta el dominio de `FRONTEND_URL`; en desarrollo, cualquier puerto de `localhost`.
- **Privacidad:** aviso por negocio, borrado de fotos y datos de la clienta solo en su propio dispositivo.
- **Monitoreo opcional:** si se define `SENTRY_DSN` en el `.env` (requiere instalar `sentry-sdk`), los errores llegan a Sentry.

---

## 5. Diseño (frontend)

El sistema de diseño está en `src/styles.css`. Usa **siempre** estos nombres y no colores sueltos:

- **Colores:** `bg-canvas`, `bg-surface`, `border-line`, `border-line-strong`, `text-ink`, `text-ink-soft`, `text-muted`, `accent`.
- **Componentes:** `.page-head` (encabezado de página), `.card` y `.card-title`, `.btn` con sus variantes `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-danger` y `btn-whatsapp`, `.badge-ok`, `-warn`, `-bad`, `-info` y `-neutral`, `.empty` (pantalla vacía) y `.nums` (números alineados).
- **Confirmaciones:** el servicio `Confirm` (`src/app/shared/components/confirm/`). No usar `window.confirm`.
- **Tipografía:** Plus Jakarta Sans. **Íconos:** Material Symbols (`<mat-icon>`). Sin emojis en la interfaz; en los mensajes de WhatsApp sí se usan.

---

## 6. Desarrollo local

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

- Las variables de entorno están explicadas en `nexia-backend/.env.example`.
- Las columnas nuevas de la base se agregan solas al arrancar (`app/db/init_db.py`). No hay herramienta de migraciones.

---

## 7. Publicación (plan actual)

| Pieza | Para demos ($0) | Para negocios reales |
|---|---|---|
| Frontend | Vercel | Vercel |
| API | Render (plan gratis; se duerme tras unos 15 minutos sin uso) | Railway (~$5 USD/mes) o un plan de pago de Render |
| Base | Neon (PostgreSQL gratis) | La base de Railway o un plan de pago |

- **Todos los negocios usan la misma instalación**; cada uno se registra en `/auth`.
- Ya están listos `render.yaml`, el endpoint `/api/health`, la compatibilidad con PostgreSQL y `vercel.json`, que apunta a `https://nexia-api.onrender.com`. Los pasos están en `nexia-backend/DEPLOY.md`.
- **Pendiente antes de las demos:** que el límite contra citas falsas cuente por **negocio + IP** y lea la IP que reenvía Vercel; si no, todas las clientas podrían compartir el mismo límite. También falta ajustar `render.yaml` para usar Neon como base.
- **Respaldos:** programar `scripts/backup_db.py` cada día y guardar las copias fuera del servidor.

---

## 8. Pendientes y planes futuros

**Corto plazo**
- Revisar en el navegador Equipo, Horarios, Configuración, Mi negocio y la ficha de la cita, y ajustar los selectores de hora.
- Una sola opinión por cita.
- Limpiar el código muerto: formularios con `@if (false…)`, la sección de huecos de Inicio y el código de reseñas sin usar en la página de reservas.
- Pasar el límite de intentos a Redis si algún día hay varios servidores.

**Según lo que pidan los primeros negocios** (ya hechos: notas por visita, propinas, venta de productos al cobrar, cupones, lealtad, cumpleaños, PWA y modo oscuro)
- Formularios de ingreso y consentimiento (consultorios, spas, tatuajes).
- Clases con cupo visible ("quedan 3 lugares").
- Paquetes y membresías a la venta desde la página de reservas.
- Regla de no-show: pedir anticipo de forma automática a quien falta seguido.
- Sincronización con Google Calendar para cada colaboradora.
- Recordatorios automáticos con la API oficial de WhatsApp Business (con costo por mensaje).
- Varias sucursales por dueño.
- Botón "Reservar" en Google Maps e Instagram.
- Guardar las fotos en un servicio de archivos (S3 o similar) en lugar de dentro de la base, cuando crezca el volumen.
