import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { VehicleType } from "@/types/database";
import type { FlatRateCapacity, FlatRateSettings, SubscriberPlanSettings, ToleranceSettings } from "@/types/domain";

export interface TariffRow {
  id: string;
  vehicleType: VehicleType;
  pricePerHour: number;
  active: boolean;
  updatedAt: string;
}

export async function getTariffs(): Promise<TariffRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tariffs")
    .select("id, vehicle_type, price_per_hour, active, updated_at")
    .order("vehicle_type");

  if (error) throw new Error(error.message);

  return (data ?? []).map((t) => ({
    id: t.id,
    vehicleType: t.vehicle_type,
    pricePerHour: Number(t.price_per_hour),
    active: t.active,
    updatedAt: t.updated_at,
  }));
}

export async function getTariffMap(): Promise<Record<VehicleType, number>> {
  const tariffs = await getTariffs();
  return Object.fromEntries(
    tariffs.map((t) => [t.vehicleType, t.pricePerHour])
  ) as Record<VehicleType, number>;
}

export async function getRestroomPrice(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "restroom_price")
    .single();

  if (error || !data) return 1.0;
  const value = data.value as { price?: number };
  return Number(value?.price ?? 1.0);
}

const DEFAULT_TOLERANCE: ToleranceSettings = {
  tolerCortaMinutos: 5,
  tolerLargaMinutos: 15,
  umbralLargaHoras: 3,
};

export async function getToleranceSettings(): Promise<ToleranceSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tariff_settings")
    .select("tolerancia_corta_minutos, tolerancia_larga_minutos, umbral_larga_horas")
    .eq("id", true)
    .single();

  if (error || !data) return DEFAULT_TOLERANCE;

  return {
    tolerCortaMinutos: data.tolerancia_corta_minutos,
    tolerLargaMinutos: data.tolerancia_larga_minutos,
    umbralLargaHoras: data.umbral_larga_horas,
  };
}

const DEFAULT_FLAT_RATE: FlatRateSettings = {
  precio: 15,
  precioNoche: 15,
  horaLimite: "19:00",
  diasAplicacion: [0, 1, 2, 3, 4, 5, 6],
  activo: true,
  cupoMaximo: 10,
};

export async function getFlatRateSettings(): Promise<FlatRateSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("flat_rate_settings")
    .select("precio, precio_noche, hora_limite, dias_aplicacion, activo, cupo_maximo")
    .eq("id", true)
    .single();

  if (error || !data) return DEFAULT_FLAT_RATE;

  return {
    precio: Number(data.precio),
    precioNoche: Number(data.precio_noche),
    horaLimite: data.hora_limite.slice(0, 5),
    diasAplicacion: data.dias_aplicacion,
    activo: data.activo,
    cupoMaximo: data.cupo_maximo,
  };
}

export async function getFlatRateCapacity(): Promise<FlatRateCapacity> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_flat_rate_capacity");

  if (error || !data) {
    return { cupoMaximo: 10, activos: 0, disponibles: 10 };
  }

  const result = data as { cupo_maximo: number; activos: number; disponibles: number };
  return {
    cupoMaximo: result.cupo_maximo,
    activos: result.activos,
    disponibles: result.disponibles,
  };
}

const DEFAULT_SUBSCRIBER_PLAN: SubscriberPlanSettings = {
  precioMensual: 180,
  horaLimite: "08:00",
  periodoMeses: 1,
  diasAlertaVencimiento: 5,
};

export async function getSubscriberPlanSettings(): Promise<SubscriberPlanSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriber_plan_settings")
    .select("precio_mensual, hora_limite, periodo_meses, dias_alerta_vencimiento")
    .eq("id", true)
    .single();

  if (error || !data) return DEFAULT_SUBSCRIBER_PLAN;

  return {
    precioMensual: Number(data.precio_mensual),
    horaLimite: data.hora_limite.slice(0, 5),
    periodoMeses: data.periodo_meses,
    diasAlertaVencimiento: data.dias_alerta_vencimiento,
  };
}
