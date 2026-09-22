import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { getSystemSetting } from "@/services/settings";
import { Card, CardHeader } from "@/components/ui/Card";
import { CompanySettingsForm } from "@/components/configuracion/CompanySettingsForm";

export const metadata: Metadata = { title: "Configuración" };

const UPCOMING_FEATURES = [
  "Impresión de tickets y comprobantes",
  "Código QR de ingreso/salida",
  "Reconocimiento automático de placas por cámara",
  "Clientes frecuentes y mensualidades",
  "Reservas de espacios",
  "Reportes avanzados exportables a Excel/PDF",
  "Administración de múltiples cocheras",
];

export default async function ConfiguracionPage() {
  await requireRole("ADMIN");
  const [companyName, currencySymbol] = await Promise.all([
    getSystemSetting("company_name", "Parking Admin"),
    getSystemSetting("currency_symbol", "S/"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Configuración</h1>
        <p className="text-sm text-muted">Ajustes generales del sistema.</p>
      </div>

      <Card>
        <CardHeader title="Empresa" />
        <CompanySettingsForm initialCompanyName={companyName} initialCurrencySymbol={currencySymbol} />
      </Card>

      <Card>
        <CardHeader title="Próximas funciones" subtitle="Arquitectura preparada, aún no habilitadas" />
        <ul className="flex flex-col gap-2 p-5 text-sm text-muted">
          {UPCOMING_FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-muted" />
              {f}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
