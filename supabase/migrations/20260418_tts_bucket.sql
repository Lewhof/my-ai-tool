-- TTS audio cache bucket. Private; accessed via signed URLs from /api/tts.
insert into storage.buckets (id, name, public)
values ('tts', 'tts', false)
on conflict (id) do nothing;

-- RLS: users can only access their own folder. Admin bypasses via service role key.
create policy if not exists "tts_read_own"
  on storage.objects for select
  using (bucket_id = 'tts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy if not exists "tts_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'tts' and (storage.foldername(name))[1] = auth.uid()::text);
