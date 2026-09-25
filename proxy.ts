import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renombró `middleware` a `proxy`. Corre en runtime Node.js.
// Esto es una verificación OPTIMISTA (solo lee la cookie de sesión) para
// redirigir rápido. La verificación segura real ocurre en cada Server
// Component/Server Action vía lib/auth/dal.ts (requireAuth/requireRole),
// que sí valida contra el servidor de Supabase Auth.
//
// AUDITORÍA DE RENDIMIENTO: acá abajo se usa getSession() a propósito, NO
// getUser(). getUser() hace una llamada de red al servidor de Auth de
// Supabase en CADA invocación — y este proxy corre en TODA navegación de
// la app (el matcher de abajo solo excluye estáticos/imágenes). Con
// getUser() aquí, cada clic entre secciones pagaba ese round-trip de red
// ANTES de que la página pudiera empezar a renderizar: es la causa más
// probable de la lentitud percibida al cambiar de sección.
// getSession() solo decodifica la cookie localmente (sin red) — es
// exactamente lo que el comentario de arriba ya decía que debía pasar
// ("solo lee la cookie de sesión"), la implementación simplemente no lo
// hacía. Esto NO reduce la seguridad: esta verificación siempre fue solo
// para la redirección optimista; la única verificación que protege datos
// reales es requireAuth()/requireRole() (que sí sigue usando getUser()) en
// cada Server Component/Action, más RLS en Postgres como última barrera.
// Un usuario con cookie vencida/manipulada seguirá siendo rechazado ahí,
// como siempre.

const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const path = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.includes(path);

  if (!session && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (session && isPublicPath) {
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
