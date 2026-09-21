# 16 — Ambientes, configuração e publicação incremental

> **Discovery v1.2 — proposta (11/09/2026).** Complementa [PUBLICACAO.md](../../harness/PUBLICACAO.md), que prevalece e não é repetido aqui. Define destinos, configuração, versões, compatibilidade, verificação e recuperação **propostos**. **Nenhuma infraestrutura foi criada e nenhum deploy executado.**

## 1. Ambientes

| Ambiente | Finalidade | Supabase | Web | Worker | Fornecedores | Dados |
| --- | --- | --- | --- | --- | --- | --- |
| **Desenvolvimento local** | Implementar e validar | Supabase local via Docker (projeto próprio da Oplyra) | `localhost` | Processo local | Fakes por padrão; sandbox só com flag e teto | Seeds sintéticos (2+ empresas) |
| **CI (efêmero)** | Mesmos gates do local, reproduzíveis | Supabase local no runner, descartado ao fim | Build + E2E local | Processo no runner | Somente fakes e replay | Seeds sintéticos |
| **Produção** | Incrementos aprovados para publicação | Supabase selecionado; região/plano pendentes | `app.oplyra.io` no Netlify; região/plano pendentes | Railway; região/plano pendentes | Reais, com credenciais de produção | Dados reais; empresas internas de verificação |

**Não há ambiente de homologação remoto**, por decisão do projeto (dois ambientes). Riscos e mitigações:

- **Deploy Previews do Netlify não podem apontar para produção.** Variáveis de preview devem usar ambiente isolado ou permanecer ausentes para o build falhar, sem fallback.
- Empresas internas em produção e feature flags de lançamento (`internal`) permitem ativar módulos primeiro para a equipe.
- **Decisão preservada (DP-28a):** desenvolvimento local via Docker e produção incremental no Supabase.
- Antes dos pilotos com dados reais, **reavaliar** a necessidade de homologação (R-19, DP-28b). Criá-la exigirá nova decisão do usuário.
- **Testes destrutivos, reset de banco e seeds sintéticos permanecem fora da produção** (DP-28c).

## 2. Destinos por componente

| Componente | Destino proposto | Como é publicado | Observações |
| --- | --- | --- | --- |
| Schema, RLS, funções, filas pgmq, jobs pg_cron, buckets e políticas de Storage | Supabase produção | Migrations versionadas aplicadas pelo pipeline, após aprovação | pgmq e pg_cron habilitados por migration; buckets e políticas também |
| Configuração de Auth (SMTP, URLs de redirecionamento, expiração, rate limits, MFA) | Supabase produção | Checklist versionado + aplicação por CLI ou API de gerenciamento quando suportado; senão, manual com evidência | **Não é transportada por migrations** |
| Schemas expostos pela Data API | Supabase produção | Configuração de projeto | Verificar após cada publicação ([07](07-security-lgpd.md) §5) |
| Dados de referência (permissões, papéis, planos, tetos, definições de agentes) | Supabase produção | Migration de dados idempotente ou procedimento `ops-cli` revisado | Nunca seeds sintéticos |
| Web / BFF / API pública v1 | Netlify; projeto, plano e região pendentes | Build do commit aprovado; promoção para produção | Domínios `app.oplyra.io` e domínio de API; Functions apenas para a fronteira web |
| Worker | Railway; US East/Virgínia é candidata condicionada ao EXP-03 | Imagem ou build versionado do mesmo commit; nova revisão | Serviço stateless contínuo; encerramento gracioso e restart policy |
| `ops-cli` | Job manual do CI com credencial restrita, ou máquina de operador com MFA | Versão do mesmo commit | Toda execução auditada |
| DNS e e-mail | Provedor do domínio `oplyra.io`; provedor de e-mail (DP-08) | Registros documentados | SPF, DKIM, DMARC |
| Observabilidade | Fornecedor (DP-15) | Configuração por variáveis | Sem PII |
| Segredos | Contextos/secret store do Netlify, variáveis do Railway e secrets do Supabase | Alteração manual registrada (sem valores) | Rotação documentada; preview nunca herda produção |

## 3. Configuração por ambiente

- **Configuração como código** sempre que possível: `supabase/config.toml` (local), migrations, definições de agentes, tabela de preços de modelo e checklists de configuração não transportável.
- **Validação na inicialização:** web, worker e CLI validam as variáveis por schema e **falham** se faltar algo, se houver mistura de ambientes (URL de produção com chave local) ou se o local apontar para host remoto sem `OPLYRA_ALLOW_REMOTE=true` explícito.
- Feature flags de lançamento e capacidades ficam no banco (dados), não em variáveis.

## 4. Variáveis de ambiente previstas

Nomes propostos para o futuro `.env.example`. **Nenhum valor real.**

| Variável | Pública? | Usada por | Descrição |
| --- | --- | --- | --- |
| `OPLYRA_ENV` | Não | Todos | `local`, `ci` ou `production` |
| `NEXT_PUBLIC_SUPABASE_URL` | **Sim** | Web (navegador) | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Sim** | Web (navegador) | Chave publicável/anon |
| `NEXT_PUBLIC_APP_URL` | **Sim** | Web | URL base do app |
| `SUPABASE_URL` | Não | Web (servidor), worker, CLI | URL do projeto |
| `DATABASE_URL_POOLED` | Não | Web (servidor), worker | Conexão via pooler (usuário limitado) |
| `DATABASE_URL_MIGRATIONS` | Não | Pipeline de publicação | Credencial exclusiva para migrations |
| `SUPABASE_JWT_ISSUER` / `SUPABASE_JWKS_URL` | Não | Web (servidor) | Verificação de sessão |
| `WORKER_DB_ROLE` | Não | Worker | Papel de execução proposto `oplyra_worker_exec` (ADR-0003), distinto do login |
| `OPS_ADMIN_CREDENTIAL` | Não | `ops-cli` | Credencial privilegiada; **nunca em web/worker** |
| `CREDENTIALS_MASTER_KEY` / `CREDENTIALS_KEY_VERSION` | Não | Worker | Cifragem envelope (DP-16) |
| `API_KEY_PEPPER` | Não | Web (API pública) | Hash de chaves de fontes |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Não | Worker | Apenas os adapters habilitados exigem suas chaves; referências seguras por provedor/modalidade |
| `AI_EXECUTION_MODE` | Não | Worker | `fake`, `replay` ou `gateway`; padrão local fake. Gateway usa Registry e política versionada, não um provedor global |
| `AI_ROUTING_POLICY_VERSION` | Não | Worker | Versão da política e limites; falta de configuração bloqueia modo pago |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Não | Servidor de billing | Segredos separados por ambiente; modo teste na Fundação antes da ativação comercial |
| `META_APP_ID` / `META_APP_SECRET` | Não | Web (OAuth callback), worker | App Meta |
| `GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET` / `GOOGLE_ADS_DEVELOPER_TOKEN_OR_PROJECT` | Não | Web (callback), worker | Credenciais Google Ads (forma exata a confirmar, FX-07) |
| `AD_PLATFORM_ADAPTER` | Não | Worker | `fake` ou `real` |
| `ASSET_ANALYSIS_ADAPTER` | Não | Worker | `fake` ou `real`; provedor de transcrição/análise multimodal ainda pendente |
| `EMAIL_PROVIDER_API_KEY` | Não | Worker | Notificações (o SMTP do Auth fica na configuração do Supabase) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_HEADERS` | Não | Web, worker | Telemetria |
| `OPLYRA_ALLOW_REMOTE` | Não | Local | Proteção contra remoto acidental |

O CI verifica que nenhuma variável privada ou valor secreto aparece no bundle; o prefixo NEXT_PUBLIC não torna um segredo seguro para exposição.

## 5. Versionamento e compatibilidade

| Item | Convenção |
| --- | --- |
| Versão do produto | SemVer pré-1.0: `0.<incremento>.<correção>`. Ex.: `0.1.0` = I-01; `0.1.1` = correção do I-01 |
| Tag | `v0.1.0` no commit aprovado |
| Migrations | Timestamp + nome descritivo; **nunca editadas depois de aplicadas em produção** |
| Payload de jobs | `schemaVersion`; o worker da versão N processa jobs das versões N e N−1 |
| API pública | Caminho `/api/v1`; mudanças incompatíveis só em `/v2`, com período de coexistência |
| Definições de agentes e workflows | SemVer próprio; execuções fixam a versão |
| Tabela de preços de modelo | Versionada; execução registra a versão usada |

**Expand/contract (padrão obrigatório):**

1. **Expandir:** adicionar colunas, tabelas e políticas compatíveis com a versão ativa de web e worker.
2. **Adaptar:** publicar worker e web que usam o novo schema, ainda tolerando o antigo.
3. **Contrair:** remover o que ficou obsoleto em **publicação posterior**, com impacto aprovado.

Mudança de política RLS que restringe acesso deve ser testada contra a versão ativa da web antes da publicação.

## 6. Pacote de publicação (modelo)

Segue a lista obrigatória de [PUBLICACAO.md](../../harness/PUBLICACAO.md). Formato proposto:

```text
Versão / commit / tag:
Incremento e escopo funcional:
Destino: projeto Supabase de produção (identificador sem segredo) · site Netlify · serviço Railway do worker
Dependências já publicadas e verificadas:
Gates locais e de CI (resultado + link para evidência):
Migrations (lista) e impacto em dados existentes (expand/contract):
Políticas RLS/Storage novas ou alteradas:
Configurações não transportáveis (Auth, Data API, domínios) — checklist:
Variáveis e segredos necessários (nomes, sem valores) e quem configura:
Definições de agentes/workflows e resultado da avaliação:
Sequência de execução e janela; indisponibilidade esperada:
Verificações pós-deploy (§7) e critérios de interrupção:
Plano de recuperação (§8) e pré-requisitos confirmados (backup/PITR):
Riscos e limitações conhecidas:
Aprovação solicitada: aceite funcional + publicação desta versão neste destino
```

## 7. Ordem de publicação e verificação

### 7.1 Sequência padrão

1. **Pré-voo:**
   - conferir destino, versão aprovada e histórico de migrations de produção × repositório;
   - confirmar backup recente e, se contratado, PITR;
   - confirmar segredos presentes (nomes);
   - kill switch de agentes disponível.
2. **Migrations de expansão** no Supabase de produção. Em falha, interromper e reconciliar.
3. **Configurações não transportáveis** do checklist.
4. **Worker** (nova revisão); verificar saúde e consumo de filas.
5. **Web** (promoção do build aprovado).
6. **Dados de referência** e definições de agentes, se houver.
7. **Liberação por flag** para empresas internas; depois pilotos, conforme aprovação.
8. **Verificações pós-deploy** (§7.2).
9. **Registro** em `ESTADO.md`: versão, destino, migrations, resultados, incidentes.

### 7.2 Verificações pós-deploy (não destrutivas)

| Verificação | Critério |
| --- | --- |
| Saúde | Web responde; worker saudável; filas sem crescimento anormal; sem novos itens na dead-letter |
| Autenticação | Login da conta de verificação interna; magic link entregue pelo SMTP de produção |
| Autorização positiva | Conta interna da empresa interna A acessa seus dados |
| Autorização negativa | Conta interna de A **não** acessa dados da empresa interna B (tela, API e URL assinada) |
| Data API | Schemas de domínio não expostos |
| Fluxo do incremento | Caminho principal executado na empresa interna, com dados reversíveis |
| Agentes (quando houver) | Execução com orçamento mínimo na empresa interna; custo registrado; nenhuma ferramenta externa |
| Agendamentos | Próximas ocorrências calculadas; nenhuma execução duplicada |
| Segredos | Bundle sem chaves privadas; logs sem tokens |
| Configuração | Checklist de Auth, Data API e domínios confere |

**Proibido em produção:** reset de banco, seeds sintéticos, suítes destrutivas, envio de mensagens reais, gastos ou alterações em mídia sem autorização correspondente.

## 8. Recuperação por componente

| Componente | Estratégia | Observação |
| --- | --- | --- |
| Web | Promover o deploy anterior no Netlify | Compatível se o schema seguiu expand/contract |
| Worker | Voltar para a revisão anterior da imagem | Idem; jobs de versão N ficam na fila até a correção, se incompatíveis |
| Migrations | **Correção progressiva** por nova migration | Sem rollback automático; nunca editar migration aplicada |
| Dados corrompidos | Restauração de backup ou PITR **somente com autorização específica** e avaliação de perda | Exercício de restauração antes dos pilotos |
| Agentes | Kill switch (empresa, agente, global); rollback da definição | Resultados persistidos permanecem marcados |
| Integrações | Kill switch de integração; pausar filas de sincronização | — |
| Configuração de Auth | Reverter pelo checklist versionado | — |
| Objetos do Storage | Estratégia própria: versões imutáveis, exclusão lógica, réplica externa diária e manifesto com checksum. **Backups do banco não incluem objetos** (FX-11) | Condicionada ao EXP-04 (DP-07c) |
| Papéis customizados após restauração | Redefinir senhas dos papéis de login e atualizar segredos na web e no worker | Senhas não ficam nos backups (FX-11) |

**Critérios de interrupção durante a publicação:** migration falha; verificação negativa de isolamento falha; erro de autenticação; crescimento de dead-letter; custo anômalo. Em qualquer caso: parar passos dependentes, registrar o que foi aplicado, inspecionar antes de repetir.

### 8.1 Metas e teste de recuperação (DP-07b–d)

Propostas de perda aceitável (RPO) e tempo de recuperação (RTO), estratégia do Storage, procedimento pós-restauração e teste de restauração: [07](07-security-lgpd.md) §11.4 e [18](18-technical-experiments.md) EXP-04.

- **Não depender de backups ou PITR antes de confirmar as capacidades do plano contratado.**
- **Não receber dados reais antes de executar e registrar um teste de restauração** (banco + Storage + papéis).

## 9. Preparação da primeira publicação (I-01)

Condicionada à aprovação que inclua a publicação do I-01:

1. Criar a organização e o projeto Supabase de produção da Oplyra na região aprovada pelo EXP-03 e registrar o identificador (sem segredos).
2. Definir o plano Supabase, a política de backup e a decisão sobre PITR (DP-07).
3. Configurar SMTP transacional (DP-08), domínio de envio, SPF, DKIM e DMARC.
4. Criar o site Netlify de produção na configuração aprovada pelo EXP-03, isolar Deploy Previews de produção e configurar domínios.
5. Configurar segredos nos destinos; registrar nomes e responsáveis.
6. Aplicar migrations e configurações do I-01 conforme §7.
7. Criar operadores da plataforma (MFA) e **duas empresas internas de verificação** via `ops-cli`.
8. Executar §7.2 e registrar.

## 10. Registro de estados

Seguir os estados de [PUBLICACAO.md](../../harness/PUBLICACAO.md) §"Registro de entrega": validado localmente → aguardando aprovação para publicar → aprovado para publicar → em publicação → publicado e verificado | publicação com falha.

## 11. Observabilidade: instrumentação × serviço de coleta (DP-15)

### 11.1 Instrumentação (DP-15a — neutra quanto a fornecedor)

- OpenTelemetry em web e worker, com contexto de traço e `correlationId` propagados de requisição a job, execução, chamada de modelo, ferramenta, aprovação e evento.
- Logs JSON com **allowlist de campos** e redação (tokens, chaves, e-mails, telefones, payloads comerciais).
- Métricas de negócio (custo, execuções, escalonamentos) persistidas no banco da empresa.
- Exportação OTLP configurável. Localmente, coletor ou console local, **sem envio a fornecedor externo** na rotina.

### 11.2 Critérios do serviço que recebe os dados (DP-15b)

| Critério | Exigência |
| --- | --- |
| Compatibilidade | Ingestão OTLP nativa (traços, métricas, logs), para evitar dependência de SDK proprietário |
| Região e residência | Preferência por armazenamento no Brasil; se indisponível, registrar como transferência internacional (DP-22) |
| Acesso | SSO ou MFA, papéis, trilha de acesso; acesso restrito à equipe de operação |
| Retenção | Proposta: logs 30 dias, traços 14 dias, métricas agregadas 13 meses; exclusão configurável |
| PII | Redação na origem obrigatória; recurso de limpeza no destino como defesa adicional; sem payloads comerciais |
| Custo | Modelo de cobrança previsível (por volume ingerido ou host); teto mensal com alerta de consumo |
| Alertas | Regras de [09](09-agentic-architecture.md) §11 e integração com canal de incidentes |
| Contrato | DPA e inclusão na lista de suboperadores |
| Portabilidade | Exportação de dados e troca de destino sem mudar a instrumentação |

Nenhum fornecedor foi avaliado ou verificado nesta etapa.

## 12. Disponibilidade e resposta a incidentes (DP-26)

**Meta interna proposta (DP-26a):** 99,5% mensal para o app e para a API de ingestão durante os pilotos.

- Equivale a cerca de 3 h 39 min de indisponibilidade num mês de 30,4 dias.
- **Não comprovada, não medida e sem compromisso contratual.**
- Só pode ser reportada após publicação e medição.

| Elemento | Proposta (DP-26b) |
| --- | --- |
| Indicador do app | Verificação sintética externa a cada 1 min: página de login e endpoint autenticado de saúde que consulta o banco com empresa interna |
| Indicador da ingestão | Endpoint de saúde a cada 1 min + envio sintético idempotente para fonte interna de teste a cada 5 min |
| Falha | 2 verificações consecutivas com erro em pelo menos 2 locais de monitoramento |
| Janela | Mês calendário no fuso `America/Sao_Paulo` |
| Manutenção planejada | Anunciada com 48 h; reportada separadamente, **sem exclusão do número bruto** |
| Fonte e registro | Monitor externo (fornecedor com DP-15b); relatório mensal com disponibilidade bruta, incidentes e causas |
| Severidades | **SEV1:** indisponibilidade total, suspeita de vazamento entre empresas ou efeito não autorizado. **SEV2:** módulo degradado, sincronização parada > 30 h, dead-letter crescente. **SEV3:** falhas parciais sem impacto amplo |
| Resposta | Detectar → declarar severidade e responsável → conter (kill switch, pausa de filas, rollback) → comunicar pilotos (SEV1 em até 1 h, proposta) → corrigir → post-mortem sem culpados em até 5 dias úteis |
| Cobertura | Pilotos: horário comercial com responsável de plantão definido; SEV1 com acionamento imediato |
| Dados pessoais | Incidentes com dados pessoais seguem [07](07-security-lgpd.md) §11.5–11.6 |
