import { createBrowserClient } from "@supabase/ssr";

// Nota: no se pasa el genérico Database<> a propósito. Mantener ese genérico
// perfectamente sincronizado con la forma interna que espera @supabase/postgrest-js
// (Relationships, Views, Enums, CompositeTypes, etc.) es frágil y se rompe con
// cada versión. En su lugar, cada función de services/actions tipa su propio
// resultado explícitamente con `.returns<T>()` o interfaces locales.
//
// AUDITORÍA DE RENDIMIENTO: singleton a propósito (construido una sola vez,
// al cargar este módulo, en vez de dentro de la función). Antes, cada
// llamada a createClient() construía un SupabaseClient nuevo — y cada
// suscripción realtime (useRealtimeRefresh, montado en ParkingGrid/
// DashboardRealtimeRefresher) y cada consulta de usePlateStatusLookup (una
// por cada tecla al escribir una placa, aunque la petición real esté
// debounced) creaba el suyo propio, cada uno con su propia conexión
// WebSocket de Realtime. Reutilizar una única instancia en todo el
// navegador evita reconstruir ese objeto en cada tecla/montaje y permite
// que todas las suscripciones realtime de la página compartan una sola
// conexión WebSocket en vez de abrir varias. A diferencia del cliente de
// servidor (que SÍ debe crearse por request, atado a las cookies de esa
// request), el cliente de navegador no tiene esa restricción: lee la
// sesión de las cookies del propio navegador sin importar cuántas veces
// se invoque.
const browserClient = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function createClient() {
  return browserClient;
}
