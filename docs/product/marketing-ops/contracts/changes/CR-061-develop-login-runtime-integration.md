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

### Diagnóstico da conexão inicial — 17/11/2026

FALHA_SEM_DETALHES_SENSIVEIS relatada após token. A conexão administrativa inicial estava fora da classificação segura de erros. Adicionado --check-admin-connection: TTY/URL oculta/TLS validado, somente conexão e SELECT de identidade, sem escrita/Netlify/token. Erros do driver viram apenas códigos enumerados; código/mensagem/stack/cause desconhecidos nunca são impressos. Não desligar validação TLS para diagnosticar. No provisionamento normal, pedir token só após conectar ao banco. Resultado seguro ADMIN_CONEXAO_TLS_E_IDENTIDADE_OK_SEM_ALTERACOES não é provisionamento. Senha do papel web continua ausente por leitura; causa da falha original ainda não confirmada.33 testes Node aprovados com fakes, sem conexão real do proprietário.

CI51: tipos e1204 Vitest passaram; E2E teve37 aprovados,8 ignorados do hosted e1 falha porque o spec de login exigia redirect em rotas do MVP ausentes no candidato. Teste passa a exigir redirect nas rotas implementadas (equipe/marca obrigatórias) e404 nas ausentes, sempre sem dados de B. Não publicar o MVP sujo ou declarar isolamento de uma página inexistente para fazer o gate passar. Nenhuma mudança de UI. A correção precisa de novo E2E na CI, não foi validada com banco local compartilhado.

### CA oficial do Supabase — correção de TLS, 17/11/2026

Causa confirmada: SELF_SIGNED_CERT_IN_CHAIN. Painel de develop /database/settings mostrou Download certificate para https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt. Certificado público Supabase Root2021 CA, válido até26/04/2031, SHA256 do PEM700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7; fingerprint DER807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA. Não é chave privada.

Negociação SSLRequest+TLS sem usuário/senha/SQL no pooler aws-1-sa-east-1.pooler.supabase.com:5432: sem CA reproduziu SELF_SIGNED_CERT_IN_CHAIN; com CA oficial e rejectUnauthorized=true, cadeia e hostname passaram em TLSv1.3. Não alterar SSL enforcement, trust global ou NODE_TLS_REJECT_UNAUTHORIZED.

Helper usa a CA explicitamente. Runtime develop passa a mesma CA ao adapter: PoolConfig aceita ssl aditivo, exige ca não vazia/rejectUnauthorized=true e remove sslmode validado antes do pg para ele não sobrescrever ssl. Opções extras de certificado/modo desligado recusadas. Local/ci/produção sem essa opção preservam o caminho anterior. Sem criação de permissões, mudança de registry ou produção. db.ts e deps.ts são reconciliações correntes no CR-061, nunca alteração de snapshot/Freeze.

Testes:34 Node do provisionador/reporter;13 focados TLS/sessão/arquitetura e tipos infra/web passaram. Teste de arquitetura detectou o marcador textual do PEM como transação; representação de transporte em base64 preserva exatamente o certificado (hash testado), sem alterar o gate. Ainda é preciso o proprietário executar --check-admin-connection com a URL oculta para confirmar autenticação, depois provisionar. Negociação TLS não prova senha, SQL ou login da aplicação.
