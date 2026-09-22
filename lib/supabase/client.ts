import { createBrowserClient } from "@supabase/ssr";

// Nota: no se pasa el genérico Database<> a propósito. Mantener ese genérico
// perfectamente sincronizado con la forma interna que espera @supabase/postgrest-js
// (Relationships, Views, Enums, CompositeTypes, etc.) es frágil y se rompe con
// cada versión. En su lugar, cada función de services/actions tipa su propio
// resultado explícitamente con `.returns<T>()` o interfaces locales.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
