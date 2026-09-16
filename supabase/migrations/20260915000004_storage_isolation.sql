-- I-01 — isolamento de arquivos por prefixo de empresa: <tenant_id>/<caminho>.
-- O Storage não passa pelos wrappers da aplicação, então a política não pode
-- depender de app.tenant_id: ela verifica o vínculo pela identidade do Auth.

create or replace function app.user_belongs(target_tenant uuid) returns boolean
language sql stable security definer set search_path = core, pg_temp as $$
  select exists (
    select 1 from core.memberships m
    where m.tenant_id = target_tenant and m.user_id = auth.uid() and m.status = 'active'
  )
$$;
grant execute on function app.user_belongs(uuid) to authenticated;

insert into storage.buckets (id, name, public)
values ('tenant-assets', 'tenant-assets', false)
on conflict (id) do nothing;

create policy "assets: leitura no próprio prefixo" on storage.objects for select to authenticated
using (
  bucket_id = 'tenant-assets'
  and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and app.user_belongs(((storage.foldername(name))[1])::uuid)
);

create policy "assets: gravação no próprio prefixo" on storage.objects for insert to authenticated
with check (
  bucket_id = 'tenant-assets'
  and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and app.user_belongs(((storage.foldername(name))[1])::uuid)
);
