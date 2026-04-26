-- Cerebro persistent memory (semantic, RAG-able)
-- Stores facts/decisions/preferences Cerebro should recall across conversations.
-- Embeddings via OpenAI text-embedding-3-small (1536 dims).

create extension if not exists vector;

create table if not exists cerebro_memory (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  content       text not null,
  source_kind   text not null check (source_kind in ('chat', 'rule', 'note', 'briefing', 'manual', 'reflection')),
  source_id     text,
  embedding     vector(1536),
  importance    int default 5 check (importance >= 0 and importance <= 10),
  decay_at      timestamptz,
  hits          int default 0,
  last_recalled timestamptz,
  created_at    timestamptz default now()
);

create index if not exists cerebro_memory_user_idx on cerebro_memory (user_id);
create index if not exists cerebro_memory_decay_idx on cerebro_memory (decay_at) where decay_at is not null;

-- ANN index for cosine similarity. ivfflat with 100 lists is sized for
-- single-user scale (10k–1M rows). Rebuild with `lists = sqrt(rows)` if Lew
-- starts hitting recall latency past a few hundred ms.
create index if not exists cerebro_memory_embedding_idx
  on cerebro_memory using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- RPC: top-K cosine match for a given user + query embedding.
-- Returns rows with similarity score and bumps `hits` + `last_recalled`.
create or replace function match_cerebro_memory(
  p_user_id     text,
  p_query       vector(1536),
  p_match_count int default 8,
  p_min_sim     float default 0.55
)
returns table (
  id          uuid,
  content     text,
  source_kind text,
  source_id   text,
  importance  int,
  similarity  float,
  created_at  timestamptz
)
language plpgsql
as $$
begin
  return query
  with hits as (
    select m.id, m.content, m.source_kind, m.source_id, m.importance,
           1 - (m.embedding <=> p_query) as similarity, m.created_at
    from cerebro_memory m
    where m.user_id = p_user_id
      and m.embedding is not null
      and (m.decay_at is null or m.decay_at > now())
    order by m.embedding <=> p_query
    limit p_match_count
  )
  select h.id, h.content, h.source_kind, h.source_id, h.importance, h.similarity, h.created_at
  from hits h
  where h.similarity >= p_min_sim;

  -- Bump telemetry on the matched rows so we can prune cold memories later.
  update cerebro_memory m
  set hits = m.hits + 1, last_recalled = now()
  where m.user_id = p_user_id
    and m.id in (
      select m2.id from cerebro_memory m2
      where m2.user_id = p_user_id and m2.embedding is not null
        and (m2.decay_at is null or m2.decay_at > now())
      order by m2.embedding <=> p_query
      limit p_match_count
    );
end;
$$;
