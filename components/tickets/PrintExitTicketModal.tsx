"use client";

import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ExitTicketLayout } from "@/components/tickets/ExitTicketLayout";
import { logExitTicketPrintRequested, logExitTicketPrinted } from "@/actions/ticket-actions";
import type { ExitTicket } from "@/types/domain";

/**
 * Mismo mecanismo de impresión que PrintTicketModal (ver ese archivo para el
 * detalle completo de por qué): vista previa dentro de #app-root (nunca se
 * imprime) + una copia idéntica portada directo a document.body, oculta en
 * pantalla y visible solo en @media print — así el navegador nunca tiene
 * nada más que paginar y sale una sola hoja, siempre.
 *
 * Se reutiliza la infraestructura de impresión (portal, CSS, window.print(),
 * guardia contra doble clic) tal cual; solo cambia el contenido (recibo de
 * SALIDA en vez de ticket de ingreso) y los textos, porque no existe un
 * registro en base de datos análogo a entry_tickets para este comprobante.
 */
export function PrintExitTicketModal({
  ticket,
  exitId,
  onClose,
}: {
  ticket: ExitTicket | null;
  exitId: string | null;
  onClose: () => void;
}) {
  const [printed, setPrinted] = useState(false);
  const [pending, startTransition] = useTransition();
  const printingRef = useRef(false);

  const close = () => {
    setPrinted(false);
    printingRef.current = false;
    onClose();
  };

  const onPrint = () => {
    if (!ticket || !exitId || printingRef.current) return;
    printingRef.current = true;
    startTransition(async () => {
      try {
        await logExitTicketPrintRequested({ exitId });
        window.print();
        await logExitTicketPrinted({ exitId });
        setPrinted(true);
      } finally {
        printingRef.current = false;
      }
    });
  };

  return (
    <>
      <Modal open={!!ticket} onClose={close} maxWidth="max-w-sm">
        {ticket && !printed && (
          <div className="p-6">
            <h3 className="text-center text-lg font-bold text-foreground">
              ¿Desea imprimir el ticket de salida?
            </h3>

            <div className="mt-4 max-h-[50vh] overflow-y-auto rounded-2xl border border-border bg-surface-2 p-2">
              <ExitTicketLayout ticket={ticket} />
            </div>

            <div className="mt-6 flex gap-3">
              <Button variant="secondary" fullWidth onClick={close} disabled={pending}>
                No, continuar
              </Button>
              <Button variant="success" fullWidth onClick={onPrint} disabled={pending}>
                {pending ? "Imprimiendo..." : "Sí, imprimir ticket"}
              </Button>
            </div>
          </div>
        )}

        {ticket && printed && (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-bg text-3xl text-success">
              ✓
            </div>
            <p className="text-lg font-semibold text-foreground">Salida registrada</p>
            <p className="text-sm text-muted">
              Ticket {ticket.ticketCode} — {ticket.plate}
            </p>
            <Button size="lg" fullWidth onClick={close}>
              Listo
            </Button>
          </div>
        )}
      </Modal>

      {ticket &&
        createPortal(
          <div className="hidden print:block">
            <ExitTicketLayout ticket={ticket} />
          </div>,
          document.body
        )}
    </>
  );
}
