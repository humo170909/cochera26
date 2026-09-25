"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/**
 * Búsqueda por placa para /salida — reemplaza la necesidad de buscar
 * visualmente entre los 31 espacios. Solo encuentra el vehículo (mismo
 * `spots` ya cargado, filtrado por placa normalizada); todo lo que pasa
 * después de encontrarlo (cálculo, cobro, ticket, caja) es exactamente el
 * mismo PaymentModal que ya usaba el clic sobre un espacio.
 */
export function SearchVehicleBox({
  onSearch,
  error,
}: {
  onSearch: (plate: string) => void;
  error: string | null;
}) {
  const [query, setQuery] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    onSearch(query);
    setQuery("");
  };

  return (
    <Card>
      <div className="p-5">
        <h2 className="text-base font-bold text-foreground">🔎 Buscar vehículo por placa</h2>
        <p className="mt-1 text-sm text-muted">
          Escribe la placa y presiona Enter, o el botón &quot;Buscar vehículo&quot;.
        </p>

        <form onSubmit={submit} className="mt-3 flex flex-col gap-3 sm:flex-row">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            placeholder="ABC-123"
            className="text-lg font-bold tracking-wider sm:flex-1"
          />
          <Button type="submit" size="lg">
            Buscar vehículo
          </Button>
        </form>

        {error && (
          <div className="mt-3 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</div>
        )}
      </div>
    </Card>
  );
}
