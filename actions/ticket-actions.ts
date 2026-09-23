"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/dal";
import { validateTicketSchema } from "@/lib/validation";
import type { ActionResult } from "@/actions/vehicle-actions";
import type {
  EntryTicket,
  TicketValidationOutcome,
  TicketValidationResult,
} from "@/types/domain";
import type { TicketStatus, TicketTariffType, VehicleType } from "@/types/database";
import { z } from "zod";

interface RawEntryTicket {
  id: string;
  ticket_code: string;
  validation_code: string;
  validation_token: string;
  plate: string;
  vehicle_type: VehicleType;
  spot_code: string;
  tariff_type: TicketTariffType;
  tariff_amount: number;
  status: TicketStatus;
  issued_at: string;
}

function mapTicket(t: RawEntryTicket): EntryTicket {
  return {
    id: t.id,
    ticketCode: t.ticket_code,
    validationCode: t.validation_code,
    validationToken: t.validation_token,
    plate: t.plate,
    vehicleType: t.vehicle_type,
    spotCode: t.spot_code,
    tariffType: t.tariff_type,
    tariffAmount: Number(t.tariff_amount),
    status: t.status,
    issuedAt: t.issued_at,
  };
}

/** null = el ingreso no requiere ticket (abonado/autorizado/reservado). */
export async function getEntryTicket(entryId: string): Promise<ActionResult<EntryTicket | null>> {
  await requireAuth();

  const parsed = z.uuid().safeParse(entryId);
  if (!parsed.success) return { error: "Ingreso inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_entry_ticket", { p_entry_id: parsed.data })
    .maybeSingle()
    .returns<RawEntryTicket | null>();

  if (error) return { error: error.message };

  return { data: data ? mapTicket(data) : null };
}

interface RawValidationResult {
  outcome: TicketValidationOutcome;
  ticket_id: string | null;
  entry_id: string | null;
  plate: string | null;
  spot_code: string | null;
  status: TicketStatus | null;
}

export async function validateEntryTicket(
  input: unknown
): Promise<ActionResult<TicketValidationResult>> {
  await requireAuth();

  const parsed = validateTicketSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("validate_entry_ticket", {
      p_code: parsed.data.code,
      p_expected_entry_id: parsed.data.expectedEntryId ?? null,
    })
    .single()
    .returns<RawValidationResult>();

  if (error || !data) {
    return { error: error?.message ?? "No se pudo validar el ticket." };
  }

  return {
    data: {
      outcome: data.outcome,
      ticketId: data.ticket_id,
      entryId: data.entry_id,
      plate: data.plate,
      spotCode: data.spot_code,
      status: data.status,
    },
  };
}

const ticketIdSchema = z.object({ ticketId: z.uuid() });

/** Deja rastro en auditoría del intento de imprimir (clic en "Imprimir
 * ticket", antes de disparar window.print()). No falla el flujo si la
 * auditoría no puede escribirse: es un registro de apoyo, no una condición
 * para poder imprimir. */
export async function logTicketPrintRequested(input: unknown): Promise<ActionResult> {
  await requireAuth();
  const parsed = ticketIdSchema.safeParse(input);
  if (!parsed.success) return { error: "Ticket inválido." };

  const supabase = await createClient();
  await supabase.rpc("log_audit_event", {
    p_action: "TICKET_PRINT_REQUESTED",
    p_entity_type: "entry_tickets",
    p_entity_id: parsed.data.ticketId,
    p_details: {},
  });
  return {};
}

/** Se llama justo después de que window.print() retorna (el navegador ya
 * cerró el diálogo de impresión). No hay forma de saber desde JS si el
 * usuario realmente imprimió o canceló ese diálogo del sistema operativo. */
export async function logTicketPrinted(input: unknown): Promise<ActionResult> {
  await requireAuth();
  const parsed = ticketIdSchema.safeParse(input);
  if (!parsed.success) return { error: "Ticket inválido." };

  const supabase = await createClient();
  await supabase.rpc("log_audit_event", {
    p_action: "TICKET_PRINTED",
    p_entity_type: "entry_tickets",
    p_entity_id: parsed.data.ticketId,
    p_details: {},
  });
  return {};
}

const exitIdSchema = z.object({ exitId: z.uuid() });

/** Equivalente a logTicketPrintRequested/logTicketPrinted pero para el
 * comprobante de SALIDA: no existe una tabla `entry_tickets` para este
 * recibo (no tiene fin anticopia, solo es un comprobante posterior al
 * cobro ya registrado), así que se audita directamente contra
 * `vehicle_exits` reutilizando el mismo log_audit_event() genérico. */
export async function logExitTicketPrintRequested(input: unknown): Promise<ActionResult> {
  await requireAuth();
  const parsed = exitIdSchema.safeParse(input);
  if (!parsed.success) return { error: "Salida inválida." };

  const supabase = await createClient();
  await supabase.rpc("log_audit_event", {
    p_action: "EXIT_TICKET_PRINT_REQUESTED",
    p_entity_type: "vehicle_exits",
    p_entity_id: parsed.data.exitId,
    p_details: {},
  });
  return {};
}

export async function logExitTicketPrinted(input: unknown): Promise<ActionResult> {
  await requireAuth();
  const parsed = exitIdSchema.safeParse(input);
  if (!parsed.success) return { error: "Salida inválida." };

  const supabase = await createClient();
  await supabase.rpc("log_audit_event", {
    p_action: "EXIT_TICKET_PRINTED",
    p_entity_type: "vehicle_exits",
    p_entity_id: parsed.data.exitId,
    p_details: {},
  });
  return {};
}
