-- Todos: subtasks + explicit ordering
-- Adds optional parent_id (single level — no recursive subtasks for now)
-- and position for user-defined order within bucket/status.

alter table todos add column if not exists parent_id uuid references todos(id) on delete cascade;
alter table todos add column if not exists position int default 0;

create index if not exists todos_parent_idx on todos (parent_id) where parent_id is not null;
create index if not exists todos_position_idx on todos (user_id, status, position);

-- Backfill position from updated_at so the existing list keeps its current order.
update todos
set position = sub.rn
from (
  select id, row_number() over (partition by user_id, status order by updated_at desc) - 1 as rn
  from todos
) sub
where todos.id = sub.id and todos.position = 0;
