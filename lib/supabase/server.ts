import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Debe crearse por request (no reutilizar entre requests).
 *
 * No se tipa con el genérico Database<> (ver lib/supabase/client.ts): cada
 * consulta tipa su propio resultado con interfaces locales y `.returns<T>()`.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Se llama desde un Server Component sin permiso de escritura.
            // El proxy ya se encarga de refrescar la sesión en ese caso.
          }
        },
      },
    }
  );
}
