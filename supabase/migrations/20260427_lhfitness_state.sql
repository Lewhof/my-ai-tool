-- LH Fitness — server-side state mirror for cross-device sync.
-- One row per user. The full FitnessState (profile + workouts + sessions +
-- body metrics + PRs + coach threads + plans + scheduled + imports) is
-- stored as jsonb. Last-write-wins by updated_at. localStorage stays the
-- primary store; this is a sync mirror so a user who onboards on desktop
-- doesn't get sent back to onboarding when they open the app on mobile.

create table if not exists lhfitness_state (
  user_id    text primary key,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- RLS: same auth pattern as cerebro_memory + agent_evolution. Service-role
-- admin bypasses; this stops a future client-side read from cross-reading.
alter table lhfitness_state enable row level security;

drop policy if exists lhfitness_state_select on lhfitness_state;
create policy lhfitness_state_select on lhfitness_state
  for select using (auth.uid()::text = user_id);

drop policy if exists lhfitness_state_insert on lhfitness_state;
create policy lhfitness_state_insert on lhfitness_state
  for insert with check (auth.uid()::text = user_id);

drop policy if exists lhfitness_state_update on lhfitness_state;
create policy lhfitness_state_update on lhfitness_state
  for update using (auth.uid()::text = user_id);

drop policy if exists lhfitness_state_delete on lhfitness_state;
create policy lhfitness_state_delete on lhfitness_state
  for delete using (auth.uid()::text = user_id);

create index if not exists lhfitness_state_updated_idx on lhfitness_state (updated_at);
