-- =============================================================================
-- TARIFA PLANA DÍA / NOCHE — paso 1: nuevos valores del enum tariff_type
--
-- ALTER TYPE ... ADD VALUE no puede usarse en la misma transacción que un
-- statement que YA USE el valor nuevo (restricción de Postgres, ya conocida
-- en este proyecto: ver 0008_authorized_vehicle_enum.sql, que agregó
-- 'AUTORIZADO' en su propia migración separada antes de usarlo en 0009).
-- Por eso este archivo hace ÚNICAMENTE esto, y todo lo que use
-- 'PLANA_DIA'/'PLANA_NOCHE' (columnas, funciones, checks) va en la
-- siguiente migración (0023).
-- =============================================================================

alter type public.tariff_type add value 'PLANA_DIA';
alter type public.tariff_type add value 'PLANA_NOCHE';
