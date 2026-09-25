import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Parking Admin",
    template: "%s · Parking Admin",
  },
  description:
    "Sistema profesional de administración de cochera: ingresos, salidas, cobros, caja y reportes.",
};

export const viewport: Viewport = {
  themeColor: "#0b2545",
  width: "device-width",
  initialScale: 1,
};

// Evita el "flash" de tema incorrecto al cargar: aplica el tema guardado
// antes de que React hidrate.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('parking-admin-theme');
    var theme = stored === 'dark' || stored === 'light'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE" suppressHydrationWarning>
      <head>
        {/* next/script con strategy="beforeInteractive" (en vez de un
            <script> crudo): Next.js lo inyecta en <head> por su cuenta,
            fuera de la reconciliación normal de React. Un <script> crudo
            dentro del árbol de React dispara "Encountered a script tag
            while rendering..." apenas React necesita regenerar ese
            subárbol en el cliente (por ejemplo, como efecto colateral de
            CUALQUIER mismatch de hidratación en cualquier otro componente
            de la página) — con next/script eso no ocurre. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased font-sans`}
      >
        {/* id="app-root" + className="contents": ancla para el CSS de
            impresión de tickets (ver app/globals.css). "contents" hace que
            este div no participe del layout (como si no existiera), así
            que envolver acá no cambia nada visualmente. */}
        <div id="app-root" className="contents">
          {children}
        </div>
      </body>
    </html>
  );
}
