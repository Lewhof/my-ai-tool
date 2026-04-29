-- LH Fitness rebuild — Phase 1: profile foundation.
--
-- This is the first relational table in the LH Fitness rebuild. The legacy
-- `lhfitness_state` JSONB blob continues to work during transition; the
-- onboarding flow dual-writes to BOTH the blob and this table so existing
-- read paths keep working until they're migrated phase-by-phase.
--
-- One row per Clerk user. No nullable foreign keys; profile is the root.

create table if not exists lhfitness_profiles (
  user_id                 text primary key,
  name                    text not null,
  weight_kg               numeric(6,2),
  height_cm               numeric(6,2),
  age                     int,
  goals                   text[] not null default '{}',
  difficulty              text not null,                          -- 'beginner' | 'intermediate' | 'advanced'
  available_equipment     text[] not null default '{}',
  weekly_target           int not null default 3,
  default_training_time   text,                                   -- HH:MM SAST, optional; null falls back to 18:00. Reserved for Phase 3.
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- Defense-in-depth: validate at the DB layer in case a future caller
  -- bypasses the API route's validation by importing saveProfile directly.
  constraint lhfitness_profiles_difficulty_check
    check (difficulty in ('beginner', 'intermediate', 'advanced')),
  constraint lhfitness_profiles_weekly_target_check
    check (weekly_target between 1 and 14),
  constraint lhfitness_profiles_weight_check
    check (weight_kg is null or (weight_kg between 25 and 300)),
  constraint lhfitness_profiles_height_check
    check (height_cm is null or (height_cm between 100 and 250)),
  constraint lhfitness_profiles_age_check
    check (age is null or (age between 13 and 120)),
  constraint lhfitness_profiles_default_time_check
    check (default_training_time is null or default_training_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

-- RLS — match the cerebro_memory + lhfitness_state pattern. Service-role
-- admin client bypasses; this is defense-in-depth against future client-
-- side reads from crossing user boundaries.
alter table lhfitness_profiles enable row level security;

drop policy if exists lhfitness_profiles_select on lhfitness_profiles;
create policy lhfitness_profiles_select on lhfitness_profiles
  for select using (auth.uid()::text = user_id);

drop policy if exists lhfitness_profiles_insert on lhfitness_profiles;
create policy lhfitness_profiles_insert on lhfitness_profiles
  for insert with check (auth.uid()::text = user_id);

drop policy if exists lhfitness_profiles_update on lhfitness_profiles;
create policy lhfitness_profiles_update on lhfitness_profiles
  for update using (auth.uid()::text = user_id);

drop policy if exists lhfitness_profiles_delete on lhfitness_profiles;
create policy lhfitness_profiles_delete on lhfitness_profiles
  for delete using (auth.uid()::text = user_id);

-- updated_at trigger so we don't need to manage it from app code on every PUT.
create or replace function lhfitness_profiles_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists lhfitness_profiles_updated_at on lhfitness_profiles;
create trigger lhfitness_profiles_updated_at
  before update on lhfitness_profiles
  for each row execute function lhfitness_profiles_set_updated_at();
