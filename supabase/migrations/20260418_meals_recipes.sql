-- Meal logging table (Nutrition / Keto tab)
create table if not exists meals (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  date date not null default current_date,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null,
  description text,
  calories int,
  protein_g numeric(6,1),
  carbs_g numeric(6,1),
  fiber_g numeric(6,1),
  fat_g numeric(6,1),
  is_keto boolean default true,
  source text default 'manual',
  recipe_id uuid,
  created_at timestamptz default now()
);

create index if not exists meals_user_date_idx on meals(user_id, date desc);

alter table meals enable row level security;

create policy if not exists "meals_rw_own"
  on meals for all
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

-- Saved recipes (mostly AI-generated, user bookmarks)
create table if not exists recipes (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  name text not null,
  description text,
  ingredients jsonb not null default '[]'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  macros jsonb,
  servings int default 1,
  prep_minutes int,
  cook_minutes int,
  is_keto boolean default true,
  saved boolean default false,
  source text default 'ai',
  created_at timestamptz default now()
);

create index if not exists recipes_user_saved_idx on recipes(user_id, saved, created_at desc);

alter table recipes enable row level security;

create policy if not exists "recipes_rw_own"
  on recipes for all
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);
