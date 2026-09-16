-- I-01 — leitura delimitada do operador da plataforma.
--
-- Um INSERT ... RETURNING também aplica a política de SELECT. O operador não
-- tem empresa ativa por definição, então conseguia criar a empresa e não
-- conseguia ler de volta o que acabara de criar.
--
-- A escolha é dar leitura EXPLÍCITA e restrita ao operador, em vez de mover a
-- orquestração para dentro do banco: ele enxerga o registro das empresas e os
-- vínculos, que é o material dos comandos que ADR-0008 lhe permite. Não
-- enxerga conteúdo de cliente: as tabelas de conteúdo, quando existirem, não
-- recebem política para este papel.
create policy tenants_select_operador on core.tenants for select
  using ((select app.is_operator()));

create policy memberships_select_operador on core.memberships for select
  using ((select app.is_operator()));

create policy invitations_select_operador on core.invitations for select
  using ((select app.is_operator()));

create policy entitlements_select_operador on core.tenant_entitlements for select
  using ((select app.is_operator()));
