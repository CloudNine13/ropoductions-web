"use server";

import { revalidatePath } from "next/cache";
import { isSealedCreatorAdmin, requireAdminSession, validatePatreonId } from "@/lib/admin";
import { getAuthEnv, getDatabase } from "@/lib/cloudflare";
import { deletePatronOverrideGuarded, getPatronOverride, upsertPatronOverride } from "@/lib/db";
import { isCreatorAdmin } from "@/lib/patreon";
import type { SessionRecord } from "@/types/database";

export interface OverrideActionState {
  success: boolean;
  error?: string;
  message?: string;
  timestamp?: number;
  fieldErrors?: {
    patronId?: string;
    role?: string;
    notes?: string;
  };
}

export interface HandleUpsertOverrideCoreParams {
  db: D1Database;
  callingSession: SessionRecord;
  patronId: string;
  role: string;
  notes?: string | null;
  creatorAdminIds?: string | null;
  nowSec?: number;
}

export async function handleUpsertOverrideCore(
  params: HandleUpsertOverrideCoreParams
): Promise<OverrideActionState> {
  const { db, callingSession, patronId, role, notes, creatorAdminIds, nowSec } = params;

  if (callingSession.role !== "admin") {
    return {
      success: false,
      error: "Unauthorized. Administrator session required.",
    };
  }

  if (!validatePatreonId(patronId)) {
    return {
      success: false,
      error: "Invalid Patreon ID. Must be between 1 and 20 numeric digits.",
      fieldErrors: {
        patronId: "Patreon ID must be 1 to 20 numeric digits.",
      },
    };
  }

  if (role !== "admin" && role !== "comp") {
    return {
      success: false,
      error: "Invalid role selection. Must be 'admin' or 'comp'.",
      fieldErrors: {
        role: "Select a valid role ('admin' or 'comp').",
      },
    };
  }

  if (creatorAdminIds && isCreatorAdmin(patronId, creatorAdminIds)) {
    return {
      success: false,
      error: "Creator Admin accounts are permanently sealed and cannot be modified.",
    };
  }

  let existing = null;
  try {
    existing = await getPatronOverride(db, patronId);
  } catch (err) {
    console.error("[handleUpsertOverrideCore] Failed to query existing override:", err);
    return {
      success: false,
      error: "Database operation failed while checking existing override status.",
    };
  }

  if (existing && isSealedCreatorAdmin(existing, creatorAdminIds)) {
    return {
      success: false,
      error: "Creator Admin accounts are permanently sealed and cannot be modified.",
    };
  }

  const sanitizedNotes = typeof notes === "string" ? notes.trim().slice(0, 500) : null;
  const currentTime = nowSec ?? Math.floor(Date.now() / 1000);

  try {
    await upsertPatronOverride(db, {
      patron_id: patronId,
      role: role as "admin" | "comp",
      notes: sanitizedNotes && sanitizedNotes.length > 0 ? sanitizedNotes : null,
      granted_by: callingSession.patron_id,
      created_at_sec: existing ? existing.created_at_sec : currentTime,
      updated_at_sec: currentTime,
    });
  } catch (err) {
    console.error("[handleUpsertOverrideCore] Failed to upsert patron override:", err);
    return {
      success: false,
      error: "Database operation failed while recording override.",
    };
  }

  return {
    success: true,
    message: `Successfully ${existing ? "updated" : "granted"} ${role} pass for Patreon ID ${patronId}.`,
    timestamp: currentTime,
  };
}

export async function upsertOverrideAction(
  _prevState: OverrideActionState | undefined,
  formData: FormData
): Promise<OverrideActionState> {
  const session = await requireAdminSession();
  const db = await getDatabase();
  const authEnv = await getAuthEnv();

  const rawPatronId = formData.get("patron_id");
  const rawRole = formData.get("role");
  const rawNotes = formData.get("notes");

  const patronId = typeof rawPatronId === "string" ? rawPatronId.trim() : "";
  const role = typeof rawRole === "string" ? rawRole.trim() : "";
  const notes = typeof rawNotes === "string" ? rawNotes.trim() : null;

  const result = await handleUpsertOverrideCore({
    db,
    callingSession: session,
    patronId,
    role,
    notes,
    creatorAdminIds: authEnv.creatorAdminPatreonIds || authEnv.initialAdminPatreonIds,
  });

  if (result.success) {
    revalidatePath("/admin/overrides");
  }

  return result;
}

export type RevokeErrorCode =
  | "unauthorized"
  | "invalid_patron_id"
  | "sealed_creator_admin"
  | "sole_admin"
  | "db_error";

export interface RevokeOverrideActionState {
  success: boolean;
  code?: RevokeErrorCode;
  error?: string;
  message?: string;
}

export interface HandleRevokeOverrideCoreParams {
  db: D1Database;
  callingSession: SessionRecord;
  patronId: string;
  creatorAdminIds?: string | null;
}

export async function handleRevokeOverrideCore(
  params: HandleRevokeOverrideCoreParams
): Promise<RevokeOverrideActionState> {
  const { db, callingSession, patronId, creatorAdminIds } = params;

  if (callingSession.role !== "admin") {
    return {
      success: false,
      code: "unauthorized",
      error: "Unauthorized. Administrator session required.",
    };
  }

  const normalizedPatronId = patronId.trim();
  if (!validatePatreonId(normalizedPatronId)) {
    return {
      success: false,
      code: "invalid_patron_id",
      error: "Invalid Patreon ID. Must be between 1 and 20 numeric digits.",
    };
  }

  // Re-verify the caller still holds an active admin override at mutation time.
  let callerOverride = null;
  try {
    callerOverride = await getPatronOverride(db, callingSession.patron_id);
  } catch (err) {
    console.error("[handleRevokeOverrideCore] Failed to re-verify caller override:", err);
    return {
      success: false,
      code: "db_error",
      error: "Database operation failed while verifying administrator status.",
    };
  }
  if (!callerOverride || callerOverride.role !== "admin") {
    return {
      success: false,
      code: "unauthorized",
      error: "Unauthorized. Administrator session required.",
    };
  }

  if (creatorAdminIds && isCreatorAdmin(normalizedPatronId, creatorAdminIds)) {
    return {
      success: false,
      code: "sealed_creator_admin",
      error: "Creator Admin accounts are permanently sealed and cannot be revoked.",
    };
  }

  let existing = null;
  try {
    existing = await getPatronOverride(db, normalizedPatronId);
  } catch (err) {
    console.error("[handleRevokeOverrideCore] Failed to query existing override:", err);
    return {
      success: false,
      code: "db_error",
      error: "Database operation failed while checking existing override status.",
    };
  }

  if (existing && isSealedCreatorAdmin(existing, creatorAdminIds)) {
    return {
      success: false,
      code: "sealed_creator_admin",
      error: "Creator Admin accounts are permanently sealed and cannot be revoked.",
    };
  }

  if (!existing) {
    return {
      success: true,
      message: `No override exists for Patreon ID ${normalizedPatronId}.`,
    };
  }

  let changes = 0;
  try {
    changes = await deletePatronOverrideGuarded(db, normalizedPatronId);
  } catch (err) {
    console.error("[handleRevokeOverrideCore] Failed to revoke patron override:", err);
    return {
      success: false,
      code: "db_error",
      error: "Database operation failed while revoking override.",
    };
  }

  if (changes === 0) {
    return {
      success: false,
      code: "sole_admin",
      error: "Cannot revoke the sole remaining administrator",
    };
  }

  // Deleting the override is sufficient: Story 2.4's validateSessionAccess revokes
  // the revoked user's session lazily on their next navigation (override_deleted).
  return {
    success: true,
    message: `Revoked ${existing.role} pass for Patreon ID ${normalizedPatronId}.`,
  };
}

export async function revokeOverrideAction(
  _prevState: RevokeOverrideActionState | undefined,
  formData: FormData
): Promise<RevokeOverrideActionState> {
  const session = await requireAdminSession();
  const db = await getDatabase();
  const authEnv = await getAuthEnv();

  const rawPatronId = formData.get("patron_id");
  const patronId = typeof rawPatronId === "string" ? rawPatronId.trim() : "";

  const result = await handleRevokeOverrideCore({
    db,
    callingSession: session,
    patronId,
    creatorAdminIds: authEnv.creatorAdminPatreonIds || authEnv.initialAdminPatreonIds,
  });

  if (result.success) {
    revalidatePath("/admin/overrides");
  }

  return result;
}
