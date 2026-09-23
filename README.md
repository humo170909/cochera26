# Parking Admin

Sistema profesional de administración de cochera (31 estacionamientos):
ingresos y salidas con cronómetro en vivo, cobro con importe gigante,
métodos de pago (efectivo/Yape/Plin/transferencia), baño, caja diaria
(apertura/movimientos/cierre con diferencia), historial, reportes,
usuarios/trabajadores con roles, auditoría y modo claro/oscuro.

Stack: **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 +
Supabase (Postgres, Auth, RLS, Realtime)**.

---

## 1. Requisitos

- Node.js 20.9+
- Una cuenta de [Supabase](https://supabase.com)
- Una cuenta de [GitHub](https://github.com) y [Vercel](https://vercel.com) para desplegar

## 2. Crear el proyecto en Supabase

1. Entra a [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Elige nombre, contraseña de base de datos y región (por ejemplo, la más cercana a Perú).
3. Espera a que el proyecto termine de aprovisionarse.

## 3. Ejecutar las migraciones SQL

En el dashboard de Supabase, abre **SQL Editor** y ejecuta estos archivos completos, **en orden**, cada uno en su propia ejecución:

1. [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — tablas base, RLS, funciones (RPC) transaccionales, triggers de auditoría, vista de historial.
2. [`supabase/migrations/0002_fix_audit_function.sql`](supabase/migrations/0002_fix_audit_function.sql) — corrige `fn_audit_row_change()` (accedía a columnas que no todas las tablas tienen).
3. [`supabase/migrations/0003_tariff_modalities.sql`](supabase/migrations/0003_tariff_modalities.sql) — tolerancias de tarifa por hora, abonados y tarifa plana.
4. [`supabase/migrations/0004_subscriber_payments.sql`](supabase/migrations/0004_subscriber_payments.sql) — historial de pagos de abonados, renovación automática y detección en vivo desde el ingreso.
5. [`supabase/migrations/0005_security_hardening.sql`](supabase/migrations/0005_security_hardening.sql) — **corrección de seguridad**: `find_active_subscriber()` era invocable sin sesión (Postgres da `EXECUTE` a `PUBLIC` por defecto en funciones nuevas si no se revoca a mano) y podía filtrar nombre/teléfono/monto de abonados. Necesaria incluso si ya corriste 0003/0004.
6. [`supabase/seed.sql`](supabase/seed.sql) — crea los **31 estacionamientos (E01–E31)**, las tarifas iniciales y la configuración base (precio de baño, nombre de empresa).

> Las migraciones son de solo-avance (append-only): nunca se edita un archivo ya ejecutado, siempre se agrega el siguiente número. Si en el futuro necesitas cambiar algo del esquema, crea `0005_...sql` en vez de tocar los anteriores.
>
> Cuidado con `CREATE OR REPLACE VIEW`: Postgres solo permite agregar columnas al final de la lista, nunca insertarlas en medio (rompe con `cannot change name of view column`). Si alguna migración futura toca `v_vehicle_history`, agrega columnas nuevas después de `worker_name`, no donde "lógicamente" irían.

## 4. Configurar Authentication

1. En **Authentication → Providers**, deja habilitado **Email**.
2. En **Authentication → Settings**, puedes desactivar "Confirm email" en desarrollo para no depender de un proveedor de correo (los usuarios se crean ya confirmados desde el panel de administración de la app de todas formas).

## 5. Crear el primer usuario ADMIN

Los usuarios normalmente se crean desde `/usuarios` dentro de la app (requiere estar logueado como ADMIN), pero el primero hay que crearlo a mano:

1. En Supabase, ve a **Authentication → Users → Add user** y crea un usuario con correo y contraseña.
2. Ve a **Table editor → profiles**, busca la fila creada automáticamente (por el trigger `handle_new_user`) y cambia la columna `rol` a `ADMIN`.
3. Con esa cuenta, inicia sesión en la app y desde `/usuarios` crea al resto del personal (trabajadores), asignando el rol correspondiente — esto ya no requiere tocar Supabase directamente.

## 6. Variables de entorno

Copia `.env.example` a `.env.local` y completa con los valores de tu proyecto (**Settings → API** en Supabase):

```bash
cp .env.example .env.local
```

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key   # NUNCA se expone al cliente
```

`SUPABASE_SERVICE_ROLE_KEY` solo se usa en `lib/supabase/admin.ts` (marcado con `import "server-only"`), exclusivamente para crear/editar usuarios desde `/usuarios`.

## 7. Ejecutar en local

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) — te redirige a `/login`.

## 8. Subir a GitHub

```bash
git init
git add .
git commit -m "Parking Admin: sistema de administración de cochera"
git branch -M main
git remote add origin <URL_DE_TU_REPOSITORIO>
git push -u origin main
```

`.gitignore` ya excluye `node_modules`, `.next`, y cualquier `.env*` (excepto `.env.example`), así que no subirás secretos por accidente.

## 9–12. Desplegar en Vercel

1. En [vercel.com/new](https://vercel.com/new), importa el repositorio de GitHub.
2. En **Environment Variables**, agrega las mismas tres variables del paso 6 (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
3. Despliega. Vercel detecta Next.js automáticamente (`npm run build`).
4. Verifica: entra a la URL de producción, inicia sesión con el usuario ADMIN, confirma que el mapa de 31 estacionamientos carga, registra un ingreso/salida de prueba y revisa que quede en `/historial` y en `/caja`.

---

## Decisiones de diseño relevantes

- **Tarifas por hora** (fracción hacia arriba, mínimo 1 hora), configurables en `/tarifas`. No están hardcodeadas: viven en la tabla `tariffs`.
- **Toda hora se guarda en UTC** (`timestamptz`) y se muestra siempre en `America/Lima` mediante `lib/datetime.ts`. Perú no tiene horario de verano, por lo que el offset `-05:00` usado en filtros de fecha es seguro.
- **Las operaciones críticas** (ingreso, salida+cobro, uso de baño, apertura/cierre de caja) son funciones SQL `SECURITY DEFINER` (RPC) que validan reglas de negocio y escriben en varias tablas de forma atómica — nunca hay estados parciales. Las tablas de negocio no aceptan `INSERT`/`UPDATE` directo desde el cliente.
- **Autenticación**: Supabase Auth con email + contraseña. La autorización por rol se aplica en tres capas: RLS en Postgres, `requireAuth`/`requireRole` en cada Server Component/Action, y el `proxy.ts` (verificación optimista de sesión a nivel de red).
- **Cronómetro**: cálculo 100% local a partir del timestamp de ingreso — no genera consultas a Supabase.
- **Tiempo real**: el mapa de estacionamientos y caja usan Supabase Realtime (push) para reflejar cambios de otros dispositivos, sin sondeo constante.
- **Toda función RPC nueva debe incluir su propio `if not public.is_active_staff()/is_admin() then raise exception` dentro del cuerpo.** No basta con `grant execute ... to authenticated`: Postgres otorga `EXECUTE` a `PUBLIC` por defecto en toda función nueva, así que sin un `revoke ... from public` explícito (ver `0005_security_hardening.sql`) o un chequeo interno, la función queda invocable sin sesión. Ya se descubrió y corrigió un caso real (`find_active_subscriber`).

## Motor de tarifas (4 modalidades)

Única fuente de verdad: `calculate_hourly_fee()` en SQL (`0003_tariff_modalities.sql`), ejecutada dentro de `register_vehicle_exit()`. El espejo en `lib/tariffs.ts` (mismo nombre de fórmula documentado ahí) solo sirve para el estimado en vivo del cronómetro, sin pegarle a Supabase cada segundo.

- **Por hora** (`tariffs.price_per_hour`, por tipo de vehículo — Moto ya tiene su propia fila separada de Auto): `horasFacturadas = horasCompletas`, salvo que los minutos sobrantes superen la tolerancia configurada, en cuyo caso se factura una hora más. Tolerancia corta (5 min) para menos de `umbral_larga_horas` (3h) completas; tolerancia larga (15 min) desde ahí en adelante. Piso mínimo de 1 hora facturada siempre (decisión explícita: el spec no cubría estadías menores a 1h; sin este piso, una visita de pocos minutos cobraría S/0).
- **Abonado**: 100% automático. Al registrar el ingreso, si la placa tiene un abono `ACTIVO`, dentro de vigencia, y la hora de ingreso es ≤ su `hora_limite` (fotografiada por registro, no el default global), la salida de esa visita es gratuita sin importar qué se pida — el servidor lo fuerza, ignora cualquier tipo de tarifa que mande el cliente.
- **Tarifa plana**: NUNCA automática (decisión explícita: aplicarla siempre que fuera elegible sobrecobraría visitas cortas — 20 min pagando S/15 en vez de S/3.50). El trabajador la elige en la pantalla de cobro, solo visible/permitida si la hora de salida es ≤ `hora_limite` configurada y el día está habilitado; el servidor revalida esto igual, nunca confía en la UI.
- **Fotografía histórica**: cada salida guarda `tariff_type`, `tariff_applied` (precio/hora o precio plano usado) y `tolerance_minutes_applied`. Cambiar una tarifa en `/tarifas` nunca recalcula cobros pasados.

## Abonados: detección y pagos

- **Detección 100% automática, nunca un checkbox.** En `/ingreso`, apenas el trabajador escribe una placa de 5+ caracteres, el formulario llama en vivo a `find_active_subscriber()` (la misma función que usa `register_vehicle_entry()` en el servidor) y muestra "🟢 ABONADO ACTIVO" o "🔵 CLIENTE NORMAL" — nunca editable a mano.
- **Renovación de pagos** (`register_subscriber_payment()`, RPC atómica): el monto SIEMPRE es `subscribers.monto` (nunca editable en la pantalla de pago, ni por el trabajador ni por el admin ahí mismo — solo se cambia desde `/abonados` → Editar). Si el abonado paga estando aún vigente, el nuevo período se extiende desde su vencimiento anterior (no pierde días ya pagados); si ya venció, el período nuevo arranca hoy. La duración del período (meses) es configurable en `/tarifas` (`subscriber_plan_settings.periodo_meses`), no está fija en el código.
- **"Por vencer" es un estado calculado**, nunca guardado: `fecha_vencimiento - hoy <= dias_alerta_vencimiento` (configurable). El único estado que sí vive en la base de datos junto a ACTIVO/VENCIDO/CANCELADO es SUSPENDIDO, que el admin controla a mano.
- **Ambos roles pueden consultar y cobrar abonados** (`/abonados` en el menú de ambos). Solo ADMIN puede crear/editar abonados, cambiar precios o ver `/abonados/pagos` (historial completo con filtros).

## Tickets de ingreso (KRD Park)

- **Solo HORA y PLANA emiten ticket.** `register_vehicle_entry()` decide la elegibilidad con las mismas variables (`v_authorized.id`, `v_subscriber.id`) que ya usaba para decidir el cobro — abonado/autorizado/reservado nunca generan ticket ni pasan por el paso de impresión, en el backend, no solo en la UI.
- **Identificador único por ticket**: cada ticket (`public.entry_tickets`) tiene un `validation_token` de 160 bits (`gen_random_bytes(20)` vía pgcrypto) y un `validation_code` corto derivado de él, que es lo único que se imprime en el papel (el ticket es deliberadamente mínimo: sin tarifa, sin precio, sin QR — solo placa/espacio/tipo/fecha/hora de ingreso, el código, y una línea en blanco para anotar la salida a mano).
- **La salida NO pide, escanea ni valida ningún código** (decisión explícita: se probó exigirlo y se revirtió por fricción operativa). El colaborador solo selecciona el vehículo en `/salida`; el sistema identifica la entrada activa por su `entry_id`, no por el ticket. La seguridad de "cerrar la entrada correcta, una sola vez, sin choques entre dos colaboradores" la da el `for update` + `status = 'ACTIVO'` sobre `vehicle_entries` (nunca el código del ticket). Si la entrada tenía ticket, `register_vehicle_exit()` lo marca `USED` automáticamente por `entry_id` — es historial/auditoría, no un control de acceso. `validate_entry_ticket()` sigue existiendo en el backend (sin UI) por si se necesita para control administrativo futuro.
- **Nunca se imprime un segundo ticket en la salida.** `/salida` muestra en pantalla, por separado, hora de salida / tiempo total / total a pagar / método de pago, para que el colaborador los escriba a mano en el ticket físico original (la hora real de salida se sigue guardando automáticamente en la base de datos; la línea en el papel es solo anotación física).
- **Impresión**: `window.print()` sobre un layout `.ticket-print` (58/80mm, `@media print` en `app/globals.css`) — nunca automática, siempre tras el diálogo "¿Está seguro de imprimir el ticket?". Un navegador estándar no puede imprimir en silencio sin intervención del usuario; si la PC de la cochera corre Chrome/Edge con el flag `--kiosk-printing`, ese mismo `window.print()` omite el diálogo automáticamente, sin cambios de código.

## Estructura del proyecto

```
app/(auth)/login          Login
app/(app)/...             Rutas protegidas (dashboard, estacionamientos, caja, etc.)
components/ui             Primitivas (Button, Input, Modal, Toast, ConfirmDialog...)
components/layout         Sidebar, Navbar, Clock, ThemeToggle, AppShell...
components/parking        Mapa de estacionamientos, ingreso, cobro
components/caja           Apertura/cierre/movimientos de caja
actions/                  Server Actions (mutaciones)
services/                 Lecturas de datos desde Server Components
lib/                      Supabase clients, auth DAL, fecha/hora, validación
types/                    Tipos de dominio
supabase/migrations       Esquema SQL, RLS, funciones
supabase/seed.sql         31 estacionamientos + tarifas iniciales
proxy.ts                  Protección de rutas a nivel de red (Next.js 16)
```
