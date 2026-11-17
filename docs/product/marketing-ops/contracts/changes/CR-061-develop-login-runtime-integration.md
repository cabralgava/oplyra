# CR-061 — Integração revisada do login no runtime develop

**Escopo autorizado:** solicitação do proprietário em 17/11/2026 para auditar, preparar PR e publicar a correção de login exclusivamente em develop. Implementação preparada; aceite hospedado pendente. Não é autorização de produção ou aprovação comercial. Complementa CR-057.

## Delta revisado

O commit local `2a270b2` contém a seleção de carregarConfigDevelop e proteção de sessão. Seu pai de build inerte já equivale ao patch de `main@9918a26`; não duplicar esse patch. A integração não inclui frontend/MVP ainda sem commit, registries, novas migrations ou mudanças do launcher.

`apps/web/src/lib/deps.ts` é artefato herdado governado: reconciliar somente seu SHA-256 no inventário corrente 2.23 do candidato. Não alterar manifests, receitas ou snapshots congelados. Os demais caminhos novos são classificados no inventário da preparação, sem emitir release/Freeze.

Provisionador inicial: alvo fixo Supabase eqpvjydnqbbawpkeizys e site45056cd1-6732-40b3-b341-8b9fecca8345; papel mínimo sem senha anterior, única membership authenticated sem ADMIN/INHERIT. Administração apenas no processo privado de instalação, nunca no runtime. Senha aleatória256bits, SCRAM em SQL, TLS verificado, URI secreta no site exato, somente Builds/Functions e contexto production deste site develop. Nenhuma concessão de privilégio ou usuário Auth criada.

Revalidação da ausência da variável após adquirir lock. Repetição recusa senha/variável existente. Não existe transação distribuída nem compare-and-swap global na Netlify: uma edição externa concorrente da mesma variável continua exigindo janela exclusiva; falha/resposta perdida exige diagnóstico sem repetir, excluir ou rotacionar automaticamente. Segredo já existente não é exportado.

Aceite hospedado separado: configuração Playwright sem webServer/localDB, saída exclusiva por execução, preserveOutput never, sem trace/vídeo/captura. Reporter só publica contagens e recusa seleção incompleta/skip; nenhuma mensagem de erro/cookie/argumento de fill vai para log. Runner privado pede contas controladas por entrada oculta e passa só dados de teste ao subprocesso, sem token administrativo/URL do banco. Comparar tenant próprio com tenant existente alheio e inexistente; fixture inexistente isolada não prova cross-tenant.

## Publicação e limites

Não integrar na main enquanto destinos produtivos não forem inteiramente conhecidos. Preparar PR para uma branch develop dedicada a partir de main9918a26, preservando main e a árvore local suja. O site oplyra-develop deverá usar esse fluxo dedicado antes da publicação, mantendo segredo restrito ao contexto principal desse site; previews sem segredo não constituem aceite. Gates e regras efetivas do PR continuam obrigatórios.

Em 17/11, leitura confirmou variável ausente, role mínima sem senha e zero Auth users/memberships/tenants. Não inferir defeitos de SITE_NAME/SITE_ID/URL, cache ou falta de usuário como causa do HTTP500. Credencial administrativa/Netlify só no Terminal privado do proprietário. Contas e empresas de aceitação precisam ser preparadas pelos mecanismos Auth/aplicação aprovados, sem insert manual em auth.users ou concessão fictícia.

Contrato de produto, permissions, autonomy e RLS permanecem intactos. Nenhuma produção alterada. Build/validação local não declaram sucesso hospedado. Evidências e passagem em ADS-INTEGRACAO e checkpoints.

## Diagnóstico privado complementar

Após ADMIN_URL_INVALIDA relatado pelo proprietário, adicionado --check-admin-url: entrada oculta, validação puramente local, sem conexão, sem leitura de ambiente secreto e sem eco da URL/senha. Retorna somente booleanos/nomes de campos recusados. A mesma validação alimenta o provisionamento; placeholder recusado. Esse código não permite concluir qual foi a causa da entrada do proprietário antes de ele fornecer o diagnóstico sanitizado. Teste de cookie também passa a isolar OPLYRA_ENV; undefined aciona o valor default do processo e não simulava ausência em CI. Runtime do cookie preservado.
