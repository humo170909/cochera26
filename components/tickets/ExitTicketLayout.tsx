import { formatDateLima, formatShortTimeLima, formatDurationMinutes } from "@/lib/datetime";
import { formatCurrency } from "@/lib/format";
import { VEHICLE_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { ExitTicket } from "@/types/domain";

/**
 * Comprobante impreso de SALIDA (distinto del ticket de ingreso: este se
 * imprime después de que el cobro ya quedó registrado, nunca antes). Todos
 * los valores vienen tal cual del RPC register_vehicle_exit() — nunca se
 * recalcula tarifa ni monto acá, solo se formatean para mostrarlos.
 */
export function ExitTicketLayout({ ticket }: { ticket: ExitTicket }) {
  const entry = new Date(ticket.entryAt);
  const exit = new Date(ticket.exitAt);
  const noCharge = ticket.tariffType === "ABONADO" || ticket.tariffType === "AUTORIZADO";

  const tariffLabel =
    ticket.tariffType === "PLANA_NOCHE"
      ? "PLANA NOCHE"
      : ticket.tariffType === "PLANA_DIA" || ticket.tariffType === "PLANA"
        ? "PLANA DÍA"
        : ticket.tariffType === "HORA"
          ? "POR HORA"
          : `${ticket.tariffType} (SIN COBRO)`;

  const paymentLabel = noCharge
    ? "SIN COBRO"
    : ticket.paymentMethod
      ? PAYMENT_METHOD_LABELS[ticket.paymentMethod].toUpperCase()
      : "—";

  return (
    <div className="ticket-print mx-auto w-full max-w-[80mm] bg-white px-3 pb-3 pt-[3mm] font-mono text-[12px] leading-snug text-black">
      <div className="text-center">
        <p className="text-base font-extrabold tracking-wide">KRD PARK</p>
        <p className="text-[10px] tracking-widest">ESTACIONAMIENTO</p>
      </div>

      <Divider />

      <p>TICKET: {ticket.ticketCode}</p>
      <p>PLACA: {ticket.plate}</p>
      <p>ESPACIO: {ticket.spotCode}</p>
      <p>TIPO: {VEHICLE_TYPE_LABELS[ticket.vehicleType].toUpperCase()}</p>

      <p className="mt-2">FECHA INGRESO: {formatDateLima(entry)}</p>
      <p>HORA INGRESO: {formatShortTimeLima(entry)}</p>

      <p className="mt-2">FECHA SALIDA: {formatDateLima(exit)}</p>
      <p>HORA SALIDA: {formatShortTimeLima(exit)}</p>

      <p className="mt-2">TIEMPO: {formatDurationMinutes(ticket.durationMinutes)}</p>

      <p className="mt-2">TARIFA: {tariffLabel}</p>

      <Divider />

      <p className="text-sm font-bold">TOTAL PAGADO: {formatCurrency(ticket.amount)}</p>
      <p>FORMA DE PAGO: {paymentLabel}</p>

      <Divider />

      <div className="text-center">
        <p className="font-extrabold tracking-wide">KRD PARK</p>
        <p className="text-[11px]">Gracias por su visita.</p>
      </div>
    </div>
  );
}

function Divider() {
  return <p className="my-1.5 border-t border-dashed border-black" />;
}
