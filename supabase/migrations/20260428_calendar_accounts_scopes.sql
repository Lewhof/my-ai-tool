-- Track which OAuth scopes a connected account has granted.
-- Microsoft accounts request both calendar + email scopes upfront (see
-- /api/auth/microsoft/route.ts) — for those rows the column is informational.
-- Google accounts can grant calendar OR gmail OR both incrementally (the
-- "Connect Gmail" flow uses include_granted_scopes=true) — for those rows
-- the column gates feature visibility (e.g. Gmail tab only shows for an
-- account that has the gmail.readonly scope).
alter table calendar_accounts add column if not exists scopes text[] default '{}';

-- GIN index supports `array_contains` lookups (e.g. "find accounts that
-- have gmail.readonly"). Negligible on personal-scale row counts, but keeps
-- the pattern aligned with how cerebro_memory does its array indexing.
create index if not exists calendar_accounts_scopes_idx on calendar_accounts using gin (scopes);
