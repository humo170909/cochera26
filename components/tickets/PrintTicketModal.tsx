"use client";

import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { TicketLayout } from "@/components/tickets/TicketLayout";
import { logTicketPrintRequested, logTicketPrinted } from "@/actions/ticket-actions";
import type { EntryTicket } from "@/types/domain";

/**
 * Confirmación previa a imprimir + vista previa del ticket. Nunca imprime
 * automáticamente: solo dispara window.print() cuando el usuario confirma.
 *
 * El ticket que realmente se imprime se renderiza dos veces a propósito,
 * en dos lugares distintos del DOM, con un único fin cada uno:
 *   1. La vista previa de acá abajo — vive DENTRO de #app-root, nunca se
 *      imprime (se oculta entera junto con el resto de la app, ver
 *      app/globals.css), solo sirve para que el colaborador la vea en
 *      pantalla antes de confirmar.
 *   2. Un <TicketLayout> portado directo a document.body, FUERA de
 *      #app-root, invisible en pantalla (Tailwind `hidden`) y visible
 *      SOLO en impresión (`print:block`). Es el único nodo que
 *      @media print puede llegar a imprimir, porque es el único que no
 *      queda dentro de #app-root cuando ese contenedor pasa a
 *      display:none. Como #app-root desaparece por completo del
 *      documento (no solo se oculta con visibility), no queda nada más
 *      con qué el navegador pueda paginar — una sola hoja, siempre.
 *
 * Sobre impresión silenciosa: window.print() siempre muestra el diálogo
 * nativo del navegador — ninguna web app estándar puede saltarse eso, es una
 * restricción de seguridad del navegador, no un límite de esta app. Si la PC
 * de la cochera corre Chrome/Edge en modo kiosco con el flag
 * --kiosk-printing, ESTE MISMO window.print() imprime directo a la
 * impresora configurada sin mostrar ningún diálogo — no hace falta cambiar
 * nada de este código, es pura configuración del navegador en ese equipo.
 */
export function PrintTicketModal({
  ticket,
  onClose,
}: {
  ticket: EntryTicket | null;
  onClose: () => void;
}) {
  const [printed, setPrinted] = useState(false);
  const [pending, startTransition] = useTransition();
  // Guardia síncrona contra doble/triple clic: además de "pending" (que solo
  // se refleja en el próximo render), esto bloquea la re-entrada desde el
  // primer instante del click, antes de que React llegue a re-renderizar.
  const printingRef = useRef(false);

  const close = () => {
    setPrinted(false);
    printingRef.current = false;
    onClose();
  };

  const onPrint = () => {
    if (!ticket || printingRef.current) return;
    printingRef.current = true;
    startTransition(async () => {
      try {
        await logTicketPrintRequested({ ticketId: ticket.id });
        window.print();
        await logTicketPrinted({ ticketId: ticket.id });
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
              ¿Está seguro de imprimir el ticket?
            </h3>

            <div className="mt-4 max-h-[50vh] overflow-y-auto rounded-2xl border border-border bg-surface-2 p-2">
              <TicketLayout ticket={ticket} />
            </div>

            <div className="mt-6 flex gap-3">
              <Button variant="secondary" fullWidth onClick={close} disabled={pending}>
                Cancelar
              </Button>
              <Button variant="success" fullWidth onClick={onPrint} disabled={pending}>
                {pending ? "Imprimiendo..." : "Imprimir ticket"}
              </Button>
            </div>
          </div>
        )}

        {ticket && printed && (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-bg text-3xl text-success">
              ✓
            </div>
            <p className="text-lg font-semibold text-foreground">Ingreso registrado</p>
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
            <TicketLayout ticket={ticket} />
          </div>,
          document.body
        )}
    </>
  );
}
