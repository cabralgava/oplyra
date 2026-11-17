# Conexão de develop com oplyra-develop — preparação

**Estado:** banco e hardening aplicados em develop; conexão Netlify preparada, ainda não ativada/validada. Produção e frontend preservados.

## Login mínimo — atualização de 2026-11-16 18:59

Leia [LOGIN-MINIMO.md](LOGIN-MINIMO.md). Site URL do Auth de develop salvo como https://oplyra-develop.netlify.app; redirects continuam vazios. Email e confirmação ligados, anônimo desligado; demais provedores/cadastro preservados. Nenhuma conta, senha ou variável Netlify alterada.

Provisionador inicial `provision-web-login.mjs` pronto e23 testes nativos passam: cria senha aleatória só em memória, SQL recebe somente verificador SCRAM, segredo exclusivo do site/Builds+Functions/contexto principal e teste TLS do login após commit. Execução **ainda pendente** no terminal interativo do proprietário, com URL administrativa de develop e token temporário Netlify ocultos. Não executar pelo agente, não colar dados no chat e não repetir em falha/estado parcial. Credencial/variável existente nunca é sobrescrita. Não dispara deploy nem muda grants.

Leitura do frontend encontrou cookie `secure:false` em session.ts: a sessão do frontend deve corrigir para HTTPS develop antes de habilitar login hospedado. Prompt de integração em CLAUDE-FRONT-INTEGRATION.md. Nenhum arquivo apps/web foi alterado pelo backend. Fontes/limites e recuperação de instalação parcial no roteiro.

## Atualização de 2026-11-16 18:40

Banco develop: **18/18 migrations de origem +2 correções aplicadas**, histórico total21 incluindo remote_schema inicial. Advisor:0 WARN/ERROR;5 INFO de tabelas internas sem políticas, com35 combinações de papéis/tabelas negando acesso direto. O hardening não abre políticas para silenciar essas informações.

Pooler IPv4 conferido em Connect da branch develop, sem revelar/alterar senha: host **aws-1-sa-east-1.pooler.supabase.com**, porta **6543**, banco **postgres**. A URI do painel mostra postgres por padrão; a aplicação deve usar o login mínimo já criado `oplyra_web_login.eqpvjydnqbbawpkeizys`, com senha própria e percent-encoding. Modelo atualizado em runtime.env.example. Conexão real com esse login ainda não testada porque senha não foi provisionada nesta sessão.

Prontidão de schema por catálogo: resolve_access_context, Brand, Estratégia e Runtime existem; RLS forçada em todas as tabelas operacionais conferidas; nenhuma função da aplicação com search_path mutável e nenhum login oplyra com superuser/BYPASSRLS/INHERIT. Isso não substitui login/JWT/HTTP e isolamento pelo BFF hospedado. O smoke remoto com duas empresas não executou: confirmação expirou; nenhuma fixture persistiu.

**Próximo passo com o frontend:** integrar o loader na composição e disponibilizar uma versão revisada no Git/Netlify, instalar o segredo mínimo no site correto e validar conexão/Auth. Nenhuma edição de apps/web, configuração Netlify, senha ou deploy foi feita pelo backend. O arquivo ignorado de valores/chave públicos continua disponível. Como deps.ts inicializa configuração no topo do módulo, a compilação pode exigir DATABASE_URL_APP também em Builds, sempre server-side e restrita a esse site/contexto; Functions continua necessária para runtime. Nunca NEXT_PUBLIC_DATABASE_URL, senha em bundle/log ou herança por previews de produção.

O roteiro abaixo registra a preparação anterior; considere concluídos os passos de migrations/hardening. Integração/credencial/Auth/deploy permanecem pendentes.

## Identidades conferidas

Supabase https://eqpvjydnqbbawpkeizys.supabase.co, branch develop. Netlify https://oplyra-develop.netlify.app, site ID45056cd1-6732-40b3-b341-8b9fecca8345. Produção hysigyhfpyyydycxxpsm/app.oplyra.io fica separada.

## Arquivos preparados

- runtime.env.example e target.json neste diretório: exemplos e valores públicos.
- `.oplyra/develop/netlify-public.env` na raiz do repositório: valores públicos e chave sb_publishable ativa da branch, conferidos pelo conector. Arquivo0600 ignorado pelo Git; não contém senha, chave secreta ou service_role. Nenhuma importação na Netlify foi feita. Chave pública não concede por si acesso às tabelas.
- application-evidence.json:18 fontes e2 overlays aplicados, mapa de versões e evidências atuais; a contagem5/13 abaixo é histórica. Não usar db push genérico ignorando o mapa.

## Pré-requisitos antes da configuração efetiva

1. Completar18 migrations na branch certa após a confirmação do conector, preservando o histórico, e aplicar/conferir hardening; validar advisor e acesso permitido/negado em duas empresas controladas.
2. Provisionar senha própria para oplyra_web_login, por mecanismo seguro do proprietário. Nunca enviar senha no chat/Git/log, nunca usar postgres ou senha local. O loader aceita conexão direta ou pooler da branch com usuário específico, banco postgres e SSL. Host/porta corretos precisam ser conferidos em Connect do develop, não copiados de produção.
3. A aplicação server-side precisa integrar o loader aditivo. Exemplo para revisão do Claude, sem alteração feita por esta sessão em apps/web:

```ts
import { carregarConfigDevelop } from '../../../../packages/infra/src/develop-config.ts';
// Manter o import de carregarConfig e politicaSemProvedorAprovado já existentes.
const config = process.env.OPLYRA_ENV === 'develop'
  ? carregarConfigDevelop(process.env)
  : carregarConfig(process.env, { evidencia: politicaSemProvedorAprovado });
```

Não tratar falha de develop como fallback para local/produção. Não ampliar exports governados por associação. Reusar UoW/AuthGateway/AccessContextResolver, JWT+membership ao vivo+RBAC+RLS; nunca conexão de banco ou credencial administrativa no navegador. Esta sugestão não foi integrada nem validada no build Next.

4. Depois de existir versão que selecione o loader, cadastrar os valores públicos e DATABASE_URL_APP privada no site Netlify específico. Variáveis usadas pelo servidor precisam do escopo Functions; as requeridas no build precisam também Builds. netlify.toml sozinho não disponibiliza variáveis às Functions. Não cadastrar SITE_ID, SITE_NAME ou URL: são metadados reservados do Netlify e o loader os confere. Não herdar credenciais para sites/previews de produção.
5. Configurar Auth da branch com Site URL https://oplyra-develop.netlify.app e redirects exatos após revisar /auth/confirmar e os fluxos de login/convite. Não configurar wildcards ou destinos de produção. Não houve mudança de Auth/SMTP por esta sessão.
6. Coordenar com a sessão do frontend/agente Netlify antes de publicar ou alterar suas configurações. Validar uma versão revisada do código, build, login e isolamento real. Nenhuma ação em agente/servidor/arquivos frontend foi realizada aqui.

## Ainda não comprovado

Conexão PostgreSQL real da Netlify, segredo mínimo instalado, Auth/site configurados, composição integrada, build/deploy, login/JWT real, proteção de duas empresas pelo BFF hospedado ou worker contínuo. Netlify atende web/BFF; não instala o worker. Provedores pagos e propostas de produto permanecem desabilitados.

Documentação: https://docs.netlify.com/build/functions/environment-variables/ e https://supabase.com/docs/guides/api/securing-your-api.
