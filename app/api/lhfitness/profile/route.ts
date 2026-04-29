import { auth } from '@clerk/nextjs/server';
import { getProfile, saveProfile } from '@/lib/lhfitness/profile';
import type { Profile } from '@/app/lhfitness/types';

// Profile API — Phase 1 of the LH Fitness rebuild.
//
// GET   → { profile: Profile | null }   prefers the new table, falls back to legacy blob
// PUT   → { ok: true, profile }         upserts into the new table
//
// The legacy `lhfitness_state` PUT path stays live during transition; the
// onboarding flow dual-writes to BOTH endpoints so existing code that reads
// from the blob keeps working until Phase 2+ migrates each consumer.

const VALID_DIFFICULTY = ['beginner', 'intermediate', 'advanced'] as const;
const VALID_GOALS = ['strength', 'hypertrophy', 'endurance', 'fat_loss', 'mobility', 'athletic'] as const;
const VALID_EQUIPMENT = [
  'bodyweight', 'dumbbells', 'barbell', 'kettlebell', 'cable',
  'machine', 'bands', 'pullup_bar', 'bench', 'box', 'rower', 'bike',
] as const;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const profile = await getProfile(userId);
  return Response.json({ profile });
}

export async function PUT(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('profile' in body)) {
    return Response.json({ error: 'profile required' }, { status: 400 });
  }

  const validation = validateProfile(body.profile);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  try {
    await saveProfile(userId, validation.profile);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'save failed';
    return Response.json({ error: msg }, { status: 500 });
  }

  return Response.json({ ok: true, profile: validation.profile });
}

// ── Validation ─────────────────────────────────────────────────────────

interface ValidationResult {
  ok: true;
  profile: Profile;
}

interface ValidationError {
  ok: false;
  error: string;
}

function validateProfile(raw: unknown): ValidationResult | ValidationError {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'profile must be an object' };
  const p = raw as Record<string, unknown>;

  // Name — required, trimmed, capped to 100 chars.
  if (typeof p.name !== 'string' || !p.name.trim()) {
    return { ok: false, error: 'name is required' };
  }
  const name = p.name.trim().slice(0, 100);

  // Goals — non-empty array of valid Goal values.
  if (!Array.isArray(p.goals) || p.goals.length === 0) {
    return { ok: false, error: 'at least one goal is required' };
  }
  const goals: Profile['goals'] = [];
  for (const g of p.goals) {
    if (typeof g !== 'string' || !(VALID_GOALS as readonly string[]).includes(g)) {
      return { ok: false, error: `invalid goal: ${String(g)}` };
    }
    goals.push(g as Profile['goals'][number]);
  }

  // Difficulty — required, one of three values.
  if (typeof p.difficulty !== 'string' || !(VALID_DIFFICULTY as readonly string[]).includes(p.difficulty)) {
    return { ok: false, error: 'difficulty must be beginner | intermediate | advanced' };
  }
  const difficulty = p.difficulty as Profile['difficulty'];

  // Available equipment — array of valid Equipment values; empty allowed.
  if (!Array.isArray(p.available_equipment)) {
    return { ok: false, error: 'available_equipment must be an array' };
  }
  const available_equipment: Profile['available_equipment'] = [];
  for (const e of p.available_equipment) {
    if (typeof e !== 'string' || !(VALID_EQUIPMENT as readonly string[]).includes(e)) {
      return { ok: false, error: `invalid equipment: ${String(e)}` };
    }
    available_equipment.push(e as Profile['available_equipment'][number]);
  }

  // Weekly target — 1–14 sessions per week.
  if (typeof p.weekly_target !== 'number' || !Number.isFinite(p.weekly_target)) {
    return { ok: false, error: 'weekly_target must be a number' };
  }
  const weekly_target = Math.max(1, Math.min(14, Math.round(p.weekly_target)));

  // Optional numerics — bounded.
  const weight_kg = optionalBoundedNumber(p.weight_kg, 25, 300);
  if (weight_kg === 'invalid') return { ok: false, error: 'weight_kg out of range' };
  const height_cm = optionalBoundedNumber(p.height_cm, 100, 250);
  if (height_cm === 'invalid') return { ok: false, error: 'height_cm out of range' };
  const age = optionalBoundedInt(p.age, 13, 120);
  if (age === 'invalid') return { ok: false, error: 'age out of range' };

  // `default_training_time` is reserved for Phase 3. Validation deliberately
  // doesn't accept it yet — the column won't be written either way, so taking
  // the input now would silently discard it (worst of both worlds).

  // created_at is server-of-record. We NEVER trust a client-supplied
  // created_at — would let attackers spoof account age for any future
  // tier/eligibility logic. On insert the table default fires; on update
  // the upsert payload omits the column so the existing value is preserved.
  return {
    ok: true,
    profile: {
      name,
      weight_kg: weight_kg === undefined ? undefined : weight_kg,
      height_cm: height_cm === undefined ? undefined : height_cm,
      age: age === undefined ? undefined : age,
      goals,
      difficulty,
      available_equipment,
      weekly_target,
      // Synthesised here only so the response echoes a valid Profile shape;
      // it is NOT what gets persisted (DB default + trigger handle that).
      created_at: new Date().toISOString(),
    },
  };
}

function optionalBoundedNumber(v: unknown, min: number, max: number): number | undefined | 'invalid' {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'invalid';
  if (v < min || v > max) return 'invalid';
  return v;
}

function optionalBoundedInt(v: unknown, min: number, max: number): number | undefined | 'invalid' {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'invalid';
  const i = Math.round(v);
  if (i < min || i > max) return 'invalid';
  return i;
}
