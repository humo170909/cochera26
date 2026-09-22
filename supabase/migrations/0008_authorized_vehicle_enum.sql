-- =============================================================================
-- PARKING ADMIN - Migración 0008
-- Agrega el valor 'AUTORIZADO' al enum tariff_type (vehículos autorizados /
-- dueño: ocupan espacio, tienen cronómetro e historial, pero NUNCA generan
-- cobro ni movimiento de caja).
--
-- IMPORTANTE — ejecutar este archivo COMPLETAMENTE SOLO, en su propia
-- ejecución del SQL Editor, ANTES de correr 0009_authorized_vehicles.sql.
-- Postgres no permite usar un valor de enum recién agregado (ALTER TYPE
-- ... ADD VALUE) dentro de la MISMA transacción en que se agregó — y
-- Supabase corre todo el SQL pegado en el editor como una sola transacción.
-- Si 0008 y 0009 se pegan y ejecutan juntos, fallará con:
--   "unsafe use of new value of enum type"
-- =============================================================================

alter type public.tariff_type add value 'AUTORIZADO';
