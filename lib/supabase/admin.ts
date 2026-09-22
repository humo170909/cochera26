import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente administrativo con service_role key.
 * SOLO se usa en Server Actions de administración de usuarios
 * (crear/desactivar trabajadores). Nunca debe llegar al cliente.
 * `import "server-only"` hace que el build falle si esto se importa
 * desde un componente cliente.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan las variables de entorno SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
