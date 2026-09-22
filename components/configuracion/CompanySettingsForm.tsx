"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toaster";
import { updateCompanySettings } from "@/actions/settings-actions";

export function CompanySettingsForm({
  initialCompanyName,
  initialCurrencySymbol,
}: {
  initialCompanyName: string;
  initialCurrencySymbol: string;
}) {
  const { showToast } = useToast();
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [currencySymbol, setCurrencySymbol] = useState(initialCurrencySymbol);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateCompanySettings({ companyName, currencySymbol });
      if (result.error) {
        setError(result.error);
        return;
      }
      showToast("Configuración guardada.", "success");
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 p-5 sm:max-w-sm">
      <Field label="Nombre de la empresa" htmlFor="companyName">
        <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
      </Field>
      <Field label="Símbolo de moneda" htmlFor="currencySymbol">
        <Input id="currencySymbol" value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)} required />
      </Field>
      {error && <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</div>}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando..." : "Guardar cambios"}
      </Button>
    </form>
  );
}
