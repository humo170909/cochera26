import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
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
