import { supabaseAdmin } from '@/lib/supabase-server';
import type { Profile } from '@/app/lhfitness/types';

// Server-side helper for the new lhfitness_profiles table.
//
// Phase 1 of the rebuild — the onboarding flow dual-writes to BOTH this
// table AND the legacy `lhfitness_state` JSONB blob, so existing read
// paths keep working until they're migrated phase-by-phase. `getProfile`
// prefers the new table; if absent, falls back to reading the blob.
//
// Subsequent phases will:
//   - Phase 2: switch session/workout reads off the blob
//   - Phase 3: switch plan / scheduled_session reads off the blob
//   - Phase 5: drop the blob entirely

export type ProfileRow = Profile & { user_id: string; created_at: string; updated_at: string };

export async function getProfile(userId: string): Promise<Profile | null> {
  // 1. Prefer the new table.
  const fresh = await readFromTable(userId);
  if (fresh) return fresh;

  // 2. Fall back to the legacy JSONB blob during transition.
  return readFromBlob(userId);
}

export async function saveProfile(userId: string, profile: Profile): Promise<void> {
  const row = profileToRow(userId, profile);
  const { error } = await supabaseAdmin
    .from('lhfitness_profiles')
    .upsert(row, { onConflict: 'user_id' });
  if (error) throw new Error(`Failed to save profile: ${error.message}`);
}

// ── Internal ───────────────────────────────────────────────────────────

async function readFromTable(userId: string): Promise<Profile | null> {
  const { data, error } = await supabaseAdmin
    .from('lhfitness_profiles')
    .select('name, weight_kg, height_cm, age, goals, difficulty, available_equipment, weekly_target, created_at')
    .eq('user_id', userId)
    .maybeSingle();
  // Distinguish "no row" (data === null, no error) from a real DB error
  // (network blip, permissions, schema drift). Falling back to the blob on
  // a real error would mask a broken table read; throw so the caller knows.
  if (error) {
    console.error('[lhfitness/profile] readFromTable error', error);
    throw new Error(`Failed to read profile from table: ${error.message}`);
  }
  if (!data) return null;
  return rowToProfile(data);
}

async function readFromBlob(userId: string): Promise<Profile | null> {
  const { data, error } = await supabaseAdmin
    .from('lhfitness_state')
    .select('state')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  const state = data.state as { profile?: unknown } | null;
  if (!state || typeof state !== 'object') return null;
  return coerceLegacyProfile(state.profile);
}

/**
 * Defensively coerce a legacy JSONB profile blob into a valid `Profile`.
 * The blob predates the strict types — it can have a single-string `goal`
 * field instead of `goals[]`, missing `available_equipment`, numeric fields
 * stored as strings, etc. Returns null if the shape is unrecoverable so the
 * onboarding flow re-fires instead of crashing the consumer.
 */
function coerceLegacyProfile(p: unknown): Profile | null {
  if (!p || typeof p !== 'object') return null;
  const r = p as Record<string, unknown>;
  if (typeof r.name !== 'string' || !r.name.trim()) return null;

  // Goals: prefer array, fall back to legacy single `goal` string, drop non-strings.
  let goals: string[] = [];
  if (Array.isArray(r.goals)) {
    goals = r.goals.filter((g): g is string => typeof g === 'string');
  } else if (typeof r.goal === 'string') {
    goals = [r.goal];
  }
  if (goals.length === 0) return null;

  const difficulty = typeof r.difficulty === 'string' ? r.difficulty : 'beginner';
  const available_equipment = Array.isArray(r.available_equipment)
    ? r.available_equipment.filter((e): e is string => typeof e === 'string')
    : [];
  const weekly_target = typeof r.weekly_target === 'number' && Number.isFinite(r.weekly_target)
    ? Math.max(1, Math.min(14, Math.round(r.weekly_target)))
    : 3;
  const created_at = typeof r.created_at === 'string' ? r.created_at : new Date().toISOString();

  return {
    name: r.name.trim().slice(0, 100),
    weight_kg: typeof r.weight_kg === 'number' && Number.isFinite(r.weight_kg) ? r.weight_kg : undefined,
    height_cm: typeof r.height_cm === 'number' && Number.isFinite(r.height_cm) ? r.height_cm : undefined,
    age: typeof r.age === 'number' && Number.isFinite(r.age) ? Math.round(r.age) : undefined,
    goals: goals as Profile['goals'],
    difficulty: difficulty as Profile['difficulty'],
    available_equipment: available_equipment as Profile['available_equipment'],
    weekly_target,
    created_at,
  };
}

interface ProfileTableRow {
  name: string;
  weight_kg: number | null;
  height_cm: number | null;
  age: number | null;
  goals: string[];
  difficulty: string;
  available_equipment: string[];
  weekly_target: number;
  created_at: string;
}

function rowToProfile(row: ProfileTableRow): Profile {
  return {
    name: row.name,
    weight_kg: row.weight_kg ?? undefined,
    height_cm: row.height_cm ?? undefined,
    age: row.age ?? undefined,
    goals: (row.goals ?? []) as Profile['goals'],
    difficulty: row.difficulty as Profile['difficulty'],
    available_equipment: (row.available_equipment ?? []) as Profile['available_equipment'],
    weekly_target: row.weekly_target,
    created_at: row.created_at,
  };
}

// `created_at` is INTENTIONALLY excluded from the upsert payload — on insert
// the column default fires; on update the existing value is preserved. The
// API route never trusts a client-supplied `created_at`.
function profileToRow(userId: string, p: Profile): {
  user_id: string;
  name: string;
  weight_kg: number | null;
  height_cm: number | null;
  age: number | null;
  goals: string[];
  difficulty: string;
  available_equipment: string[];
  weekly_target: number;
} {
  return {
    user_id: userId,
    name: p.name,
    weight_kg: p.weight_kg ?? null,
    height_cm: p.height_cm ?? null,
    age: p.age ?? null,
    goals: p.goals,
    difficulty: p.difficulty,
    available_equipment: p.available_equipment,
    weekly_target: p.weekly_target,
  };
}
