-- EXP-01 — isolamento no Storage por prefixo de caminho.
-- O caminho do objeto começa pelo id da empresa: <tenant_id>/<arquivo>.
begin;

-- Vínculo a partir da identidade do Supabase Auth (auth.uid()), para uso nas
-- políticas de storage, que rodam no papel authenticated.
create or replace function exp01.user_belongs(target uuid) returns boolean
language sql stable security definer set search_path = exp01, public, pg_temp as $$
  select exists (
    select 1 from exp01.memberships m
    where m.tenant_id = target and m.user_id = auth.uid() and m.status = 'active'
  )
$$;
grant execute on function exp01.user_belongs(uuid) to authenticated;

insert into storage.buckets (id, name, public)
values ('tenant-assets', 'tenant-assets', false)
on conflict (id) do nothing;

drop policy if exists "tenant prefix read"   on storage.objects;
drop policy if exists "tenant prefix write"  on storage.objects;

create policy "tenant prefix read" on storage.objects for select to authenticated
using (
  bucket_id = 'tenant-assets'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and exp01.user_belongs(((storage.foldername(name))[1])::uuid)
);

create policy "tenant prefix write" on storage.objects for insert to authenticated
with check (
  bucket_id = 'tenant-assets'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and exp01.user_belongs(((storage.foldername(name))[1])::uuid)
);

commit;
