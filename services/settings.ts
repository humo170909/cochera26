import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getSystemSetting<T = unknown>(key: string, fallback: T): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", key)
    .single();

  if (error || !data) return fallback;
  return data.value as T;
}
