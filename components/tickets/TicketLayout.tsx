import { formatDateLima, formatShortTimeLima } from "@/lib/datetime";
import { VEHICLE_TYPE_LABELS } from "@/lib/constants";
import type { EntryTicket } from "@/types/domain";

/**
 * Contenido imprimible del ticket. Se usa tanto en pantalla (vista previa
 * antes de confirmar impresión) como en el papel térmico real: @media print
 * en app/globals.css oculta todo lo demás de la página y deja visible solo
 * el elemento con className="ticket-print".
 *
 * A propósito NO muestra tarifa/precio/importe/método de pago ni QR: es un
 * comprobante mínimo para que el colaborador anote la salida a mano. Esos
 * datos sí se calculan y muestran en pantalla al momento de la salida
 * (PaymentModal) — acá solo se imprime lo mínimo para identificar el
 * vehículo y dejar espacio físico para anotar.
 */
export function TicketLayout({ ticket }: { ticket: EntryTicket }) {
  const issued = new Date(ticket.issuedAt);

  return (
    <div className="ticket-print mx-auto w-full max-w-[80mm] bg-white px-3 pb-3 pt-[3mm] font-mono text-[12px] leading-snug text-black">
      <div className="text-center">
        <p className="text-base font-extrabold tracking-wide">KRD PARK</p>
        <p className="text-[10px] tracking-widest">ESTACIONAMIENTO</p>
        <p className="text-[10px] leading-snug">DIRECCIÓN: JIRON ICA 540 - CERCADO DE LIMA</p>
      </div>

      <Divider />

      <p>TICKET: {ticket.ticketCode}</p>
      <p>PLACA: {ticket.plate}</p>
      <p>ESPACIO: {ticket.spotCode}</p>
      <p>TIPO: {VEHICLE_TYPE_LABELS[ticket.vehicleType].toUpperCase()}</p>

      <p className="mt-2">FECHA: {formatDateLima(issued)}</p>
      <p>INGRESO: {formatShortTimeLima(issued)}</p>
      <p>SALIDA: __________</p>

      <p className="mt-2">CÓDIGO: {ticket.validationCode}</p>

      <Divider />

      <p className="text-center text-[11px]">Conserve este ticket.</p>
    </div>
  );
}

function Divider() {
  return <p className="my-1.5 border-t border-dashed border-black" />;
}
