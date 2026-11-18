# CR-055 — contrato incorporado e backend de conexão/leitura

Data: 16/11/2026. Responsável: backend/Codex. Contrato **1.0 incorporado** por manutenção expressamente autorizada nesta sessão. Perfil global 2.23 continua sem release emitida; Freeze e evidências históricas 2.22 preservados. Frontend e trabalho preexistente do Claude preservados, sem confirmação de alinhamento presumida.

## Entrega e governança

CR-055 registra proposta, compatibilidade, versão e estratégia de migration. Registry humano aditivo `contracts/registries/ad-platform-services.json`, schemas/fixtures próprios e manifesto `contracts/media-contract-manifest-v1.0.json` fixam o pacote. Não habilita execução de agente nem altera registries agentic congelados, planos comerciais ou papéis.

Tipos canônicos: `@oplyra/core/media`; composição de servidor: `@oplyra/infra/media`. `CR-055-FRONTEND-CONTRACT.ts` é reexport de compatibilidade e `CR-055-FRONTEND-EXAMPLES.json` contém somente exemplos sintéticos.

As onze operações são listarConexoes, iniciarConexao, listarContasAutorizadas, selecionarConta, desconectar, solicitarSincronizacao, consultarSincronizacao, listarCampanhasPlataforma, consultarCampanha, vincularCampanha e lerMidia. `media.read`: owner/admin/marketing_manager/viewer; `media.connection.manage`: owner/admin. Membership, tenant ativo e plano Performance/Growth existentes são revalidados no servidor e SQL.

Dinheiro usa decimal exato em string na unidade menor, com moeda e casas decimais; contagens também são strings. Não converter para Number. null não significa zero. Datas civis usam intervalo [inicio,fimExclusivo); atribuição/watermark desconhecidos continuam null. Conversões Google e Meta não são equivalentes. Confiança e limitações acompanham as métricas. Snapshots anteriores permanecem disponíveis quando uma coleta nova falha, com estado de desatualização explícito.

## Banco publicado somente em develop

Destino exclusivo: `eqpvjydnqbbawpkeizys`. Baseline 18 e hardening foram concluídos por outra sessão; esta manutenção não os reaplicou.

- Fonte `20261116210007_media_connection_read.sql` → remoto `20261116214247_media_connection_read_cr055_v1`.
- Fonte `20261116214433_media_fk_indexes.sql` → remoto `20261116214625_media_fk_indexes_cr055_v1`.

Hashes e verificação em [evidência consolidada](../../../../deploy/develop/media-cr055-evidence.json). Dez tabelas com RLS forçada, sem acesso direto a credenciais para usuário/worker; quatro funções com hashes iguais ao código local e search_path fixo. Teste negativo remoto de autorização passou com rollback. Desenvolve vazio: zero tenants, conexões, credenciais ou jobs na conferência. Advisor sem achados de segurança de mídia ou FKs de mídia sem índice; índices não usados são INFO esperado no banco vazio. Achados preexistentes de outros domínios não foram alterados.

Tokens por autorização ficam cifrados AES-256-GCM em schema privado, com AAD por tenant/usuário/plataforma/tentativa. State é aleatório, apenas digest persistido, expira e tem consumo único. Geração, locks, CAS, lease e fencing impedem callback/job antigo de reativar conexão. Desconexão elimina ciphertext local e cerca jobs, preservando histórico; não revoga automaticamente a concessão Google compartilhada. Contas têm reivindicação global sem transferência automática entre tenants.

Recuperação: desativar a composição de mídia, preservar schema/histórico e aplicar correção aditiva posterior. Não reescrever migrations já aplicadas, remover dados ou usar produção como fallback.

## Integração a montar pelo frontend/host

`criarMediaBackend` recebe UoW de usuário, AuthGateway, AccessContextResolver, config, keyring, cursorKey e getToken. Worker usa **workerUow separado**, com credencial mínima própria. O factory aceita somente origem develop ou localhost autorizado; sem chaves, conexão apresenta setup_required. Não há daemon iniciado por esta sessão.

Encaminhar Request/Response nativos para `.handle(request)` em POST `/api/midia`, corpo `{ operacao, entrada }`, mesma origem. Callback GET fixo `/api/midia/googleAds/callback` (Meta reservado), com sessão autenticada e cookie de vínculo HttpOnly/SameSite=Lax assinado; tokens nunca vão à UI. `solicitarSincronizacao` responde202, consultarSincronizacao acompanha o trabalho. `.executeSync(tenant)` executa ciclo limitado e recuperável, não coleta indefinidamente. Cursores assinados próprios expiram e prendem tenant/usuário/filtro/geração/dataset/revisão de descoberta.

A sessão web existente usa `oplyra_sessao`; getToken precisa ler essa sessão no servidor. O frontend deve integrar `carregarConfigDevelop` à composição e aplicar cookie Secure em HTTPS. Nenhuma mudança foi feita em apps/web, .next ou porta3100. Não apresentar a tela como conectada antes de montar e validar essa composição.

Callbacks previstos, ainda não hospedados/registrados nesta entrega:

- `https://oplyra-develop.netlify.app/api/midia/googleAds/callback`
- `https://oplyra-develop.netlify.app/api/midia/metaAds/callback`

Chaves somente no secret manager do host: AES32bytes com keyId e leitura de chaves anteriores, HMAC32bytes separado para cursores/callback, Google clientID/secret/developer token e credencial mínima própria do worker. Não copiar valores para chat, frontend ou arquivos versionados. Rotação/backup operacional das chaves continua pendente; ver [ADR-0011](../../../decisions/ADR-0011-credenciais-de-anuncios-cifradas.md).

## O que está validado e o que permanece pendente

Google: OAuth, refresh, descoberta de contas e descendentes MCC, seleção, coleta paginada e métricas implementados e integrados ao SQL em testes com fixtures HTTP. Meta: clientes de leitura e worker testados com autorização provisionada sinteticamente; **OAuth Meta completo não implementado**. Não foi confirmada configuração oficial compatível de login/transporte de segredo para implementar troca/inspeção/renovação sem inventar suporte. Meta configurado continua unavailable.

Nenhuma API real de Google/Meta foi validada. Faltam credenciais/aprovações/contas de teste dos provedores, registro de callbacks, montagem e deploy do BFF, implantação do worker e smoke autenticado remoto. Banco publicado não significa aplicação publicada. Railway é destino previsto, sem worker ativo comprovado. Última observação Netlify nesta sessão: main@9918a26, deploy6afb64ea20560c3142807126, publicado às17:18; não houve deploy Netlify desta manutenção.

Validação: suíte completa2614/2614 em132 arquivos; pgTAP561/561 em20; contratos41/41 após patch de índices; typecheck passou; build webpack em cópia isolada passou sem tocar .next compartilhado. Mutação real do predicado de state foi detectada e restaurada. Scan de segredos versionados limpo. E2E de navegador e pnpm verificar completo não executados nesta manutenção. Logs locais em /private/tmp/oplyra-cr055-* não são artefatos permanentes.

Produção `hysigyhfpyyydycxxpsm`, escrita de anúncios, orçamento, gasto real e ChatGPT Ads não foram alterados. Próximo passo dependente: frontend montar o contrato e host provisionar configuração segura; concluir fluxo OAuth Meta com configuração oficial confirmada e então validar provedores reais em develop.
