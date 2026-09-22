-- =============================================================================
-- PARKING ADMIN - Datos iniciales (seed)
-- Ejecutar UNA vez después de la migración 0001_init.sql
-- Idempotente: usa ON CONFLICT DO NOTHING / DO UPDATE
-- =============================================================================

-- 31 estacionamientos: E01 .. E31
insert into public.parking_spots (code)
select 'E' || lpad(n::text, 2, '0')
from generate_series(1, 31) as n
on conflict (code) do nothing;

-- Tarifas iniciales (S/ por hora, fracción hacia arriba, mínimo 1 hora)
insert into public.tariffs (vehicle_type, price_per_hour, active) values
  ('AUTO', 3.50, true),
  ('CAMIONETA', 3.50, true),
  ('VAN', 5.00, true),
  ('MOTO', 3.00, true),
  ('FURGONETA', 8.00, true),
  ('CAMIONCITO', 8.00, true),
  ('OTRO', 3.50, true)
on conflict (vehicle_type) do nothing;

-- Configuración general
insert into public.system_settings (key, value) values
  ('restroom_price', '{"price": 1.00}'::jsonb),
  ('company_name', '"Parking Admin"'::jsonb),
  ('currency_symbol', '"S/"'::jsonb)
on conflict (key) do nothing;
