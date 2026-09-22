import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  userName: string;
}

interface RawAuditRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  user: { nombre: string; apellido: string } | null;
}

export interface AuditFilters {
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  action?: string;
}

export async function getAuditLog(filters: AuditFilters = {}): Promise<AuditLogRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("audit_log")
    .select(
      "id, action, entity_type, entity_id, details, created_at, user:profiles!audit_log_user_id_fkey ( nombre, apellido )"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00-05:00`);
  if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59-05:00`);
  if (filters.userId) query = query.eq("user_id", filters.userId);
  if (filters.action) query = query.eq("action", filters.action);

  const { data, error } = await query.returns<RawAuditRow[]>();
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    details: r.details,
    createdAt: r.created_at,
    userName: r.user ? `${r.user.nombre} ${r.user.apellido}`.trim() : "Sistema",
  }));
}

export async function getDistinctAuditActions(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("audit_log").select("action").limit(1000);
  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((r) => r.action))).sort();
}
