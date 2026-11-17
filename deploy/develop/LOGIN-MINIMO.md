# Login mínimo de develop — preparação segura

O banco remoto contém as 18 migrations e os dois overlays. Em 16/11/2026, uma leitura do catálogo confirmou que `oplyra_web_login` existe **sem senha**, sem superuser, BYPASSRLS, INHERIT, CREATEROLE, CREATEDB ou REPLICATION. Seu único vínculo é `authenticated`, com SET permitido, sem ADMIN/INHERIT. Não tem USAGE direto em core/runtime. Não foi lido o verificador de senha, somente a presença/ausência.

**Estado desta entrega:** provisionador implementado/testado com fakes; não executado com credenciais reais. Nenhuma senha, variável Netlify, conta, deploy ou produção foi alterada. A única mudança remota desta entrega foi o Site URL do Auth, descrito abaixo. Não confundir login PostgreSQL de serviço com login de pessoa no Supabase Auth.

## Uma execução no terminal do proprietário

Requer Node, dependências do repositório instaladas e terminal interativo. Abra um terminal normal, sem agente e sem gravação da sessão. Prepare privadamente:

- URL administrativa **da branch develop**, obtida pelo Connect em https://supabase.com/dashboard/project/eqpvjydnqbbawpkeizys . Aceita postgres em `db.eqpvjydnqbbawpkeizys.supabase.co:5432`, ou `postgres.eqpvjydnqbbawpkeizys` no pooler `aws-1-sa-east-1.pooler.supabase.com:5432/6543`. Banco postgres; senha administrativa da branch devidamente percent-encoded; `?sslmode=verify-full`. Não é a senha de produção, da conta Supabase ou de usuário do aplicativo. Não redefinir nenhuma senha para obter esse dado.
- Token pessoal temporário da Netlify com acesso ao site `oplyra-develop`, criado nas configurações pessoais de aplicações da Netlify. Não enviar aqui. Revogar depois da instalação.

```bash
cd /Users/cmii/Documents/Projetos/Oplyra
node deploy/develop/provision-web-login.mjs --apply-develop
```

O comando pede ambos os valores com entrada oculta; não passá-los como argumentos, variáveis de ambiente, arquivo, chat ou comando registrado no histórico. Se não tiver os dados, não executar nem improvisar com produção. Não rodar pelo terminal de um agente. A revisão desse helper não altera a política do guard/launcher.

O helper valida o site por ID/nome/origem/equipe e exige papel mínimo e senha ausente. Gera senha de 256 bits somente em memória, envia apenas o verificador SCRAM-SHA-256 ao PostgreSQL e grava a URI como `DATABASE_URL_APP`, marcada `is_secret`, no site fixo, escopos Builds e Functions. Seu contexto Netlify `production` significa o deploy principal **deste site de develop**; não o Supabase/app de produção. Não libera outros sites ou previews, não muda grants nem cria usuário/papel.

O segredo é instalado/conferido antes do commit da senha. Depois tenta uma conexão TLS com o login mínimo, confere a identidade, ausência de acesso direto aos schemas privados e transação authenticated sem tenant inicial. Em sucesso imprime **LOGIN_MINIMO_DEVELOP_OK**. Não imprime senha, token, URL, SQL, verificador ou resposta privada; não salva esses valores em arquivo. Não dispara build/deploy ou cria tenant/membership.

## Falha e recuperação

- Senha ou variável já existente: para **sem sobrescrever/rotacionar**. Conferir com o responsável pelo site, sem exportar segredo. Não remover uma configuração alheia para fazer o comando passar.
- Falha antes do commit: tenta rollback. Pode existir variável órfã na Netlify se a resposta da API se perdeu; não há transação distribuída. Commit com resposta perdida é estado incerto. O helper informa instalação parcial, não declara sucesso e não repete.
- Falha na conexão depois do commit: segredo/senha podem estar instalados, mas o login está sem validação. Não repetir provisionamento nem publicar; diagnosticar TLS/pooler/identidade por metadados, sem baixar a variável. O pooler pode ainda ter cache de autenticação; não contornar com postgres, SSL desligado ou tentativas em loop.
- O token deve ser revogado inclusive em falha. Uma recuperação precisa reconstituir o estado observado e coordenar o dono do site; não há limpeza automática nem alteração de credencial existente.

## Login de pessoa: escopo inicial para o frontend

Começar com e-mail/senha de uma conta controlada de teste, criada pelo proprietário em Supabase Auth **de develop**, sem usar seed local ou SQL para forjar auth.users. Preservar verificação de e-mail; nenhum cadastro público novo é necessário para esse teste. Não habilitar provedores, SMTP, convites ou magic link nesta fatia; sua configuração não foi validada. Usuário autenticado sem membership não pode receber empresa/acesso artificialmente. Onboarding deve usar os casos de uso existentes, com auditoria e RBAC.

Revisão de leitura encontrou `secure: false` em apps/web/src/lib/session.ts. Claude deve corrigir na sua própria sessão: cookie HttpOnly, Secure no HTTPS de develop, SameSite apropriado, expiração limitada ao JWT validado; local HTTP permanece local. Não manter sessão fictícia, gravar token em localStorage ou tratar chave publicável como identidade. Sem refresh implementado, sessão expirada volta ao login.

Supabase Auth **teve seu Site URL alterado e salvo** de `http://localhost:3000` para `https://oplyra-develop.netlify.app`; a configuração está em https://supabase.com/dashboard/project/eqpvjydnqbbawpkeizys/auth/url-configuration . Se um callback for habilitado posteriormente, permitir só o caminho exato revisado `/auth/confirmar`, sem wildcard/produção; configurar e testar o template/token_hash correspondente antes de expor link mágico. Não foi adicionado redirect: a lista continua vazia. Leitura da tela de provedores confirmou Email Enabled, Confirm email ligado, anonymous sign-ins desligado e novos cadastros já habilitados; esses controles foram preservados, sem mudança de política de cadastro. SMTP/templates, callbacks, contas e login real ainda não foram configurados/testados. Evidência visual no painel local: artifacts/develop-auth-origin.jpg.

## Aceite da integração

1. Claude seleciona carregarConfigDevelop em deps.ts apenas quando OPLYRA_ENV=develop, preservando loader local/ci/produção e suas recusas. Não editar packages, migrations ou controles compartilhados.
2. Instalar somente os valores públicos aprovados de runtime.env.example / `.oplyra/develop/netlify-public.env` no site fixo; nunca substituir DATABASE_URL_APP pelo placeholder nem copiar metadados reservados SITE_ID/SITE_NAME/URL. Segredo já instalado não deve ser lido/exportado. Configuração Netlify precisa ser coordenada com quem já trabalha no site.
3. Cookie seguro, login válido/inválido, expiração/logout, JWT inválido, usuário sem membership, acesso negado ao tenant alheio e ausência de segredos no bundle/logs. Conexão/pool serverless com limite adequado; banco apenas no servidor.
4. Registrar separadamente testes locais e provas do BFF real hospedado. Não declarar deploy/login/isolation remoto validados a partir de fakes. Coordenar janela antes de testes com banco; nenhum reset/seed remoto ou interferência no servidor local.
5. `/demo` continua sintético e identificado. Módulos com contrato/política pendentes ficam inertes. Netlify não instala o worker contínuo. Nenhuma alteração em hysigyhfpyyydycxxpsm/app.oplyra.io.

Fontes: https://www.postgresql.org/docs/17/auth-password.html ; https://www.postgresql.org/docs/17/sql-createrole.html ; https://open-api.netlify.com/ ; https://docs.netlify.com/build/environment-variables/secrets-controller/ ; https://docs.netlify.com/build/functions/environment-variables/ ; https://supabase.com/docs/guides/auth/passwords ; https://supabase.com/docs/guides/auth/redirect-urls ; https://supabase.com/kb/troubleshooting/supavisor-error-password-authentication-failed-after-password-rotation .

## Auditoria independente — 17/11/2026

Leituras atuais confirmaram role mínima sem senha, nenhuma DATABASE_URL_APP no site oplyra-develop e zero Auth users, memberships e tenants no Supabase develop. Isso confirma a configuração faltante; não comprova defeito de SITE_NAME/SITE_ID/URL ou cache do pooler. A senha administrativa da branch e um token temporário Netlify são as únicas entradas do provisionamento inicial acima. Não adicionar credencial administrativa ao runtime.

O provisionador foi revisto: revalida ausência de variável após obter o lock, não rotaciona senha nem sobrescreve variável existente. É preciso manter janela sem edição concorrente dessa variável na Netlify; não existe transação distribuída ou CAS entre plataformas. Falha ou resposta perdida para sem repetição. Mesmo em sucesso, não há deploy automático. Resultado esperado: LOGIN_MINIMO_DEVELOP_OK; revogar o token temporário.

Integração preparada a partir de main9918a26 + delta local2a270b2, incluindo somente reconciliação governada de deps.ts (CR-061), sem enviar o MVP sujo ao GitHub ou duplicar o pai de build já integrado. PR destinado a develop; main não deve receber merge por esta entrega. A branch principal do site oplyra-develop ainda precisa ser conferida/trocada para o fluxo dedicado antes da publicação; o contexto da variável continua production exclusivamente deste site develop.

Aceite hospedado preparado em deploy/develop/playwright.hosted.config.ts: nenhuma inicialização de servidor local, traces/vídeos/capturas desligados, diretório exclusivo e descarte dos outputs; reporter publica só contagens, sem erro/argumentos/cookies, e não aceita testes ignorados. O runner privado validate-hosted-login.mjs --test-develop pede contas controladas/UUIDs por entrada oculta. Ele só deve rodar depois da publicação e da preparação de contas e empresas pelo Auth e casos de uso aprovados. Não cria identidades, membership ou tenant. É necessário provar acesso à empresa própria, negação à empresa existente alheia/inexistente e conta sem vínculo; zero usuários/empresas atuais ainda não permite esse aceite.

Build e testes do candidato são intermediários, não validação hospedada. Não executar o runner do aceite com a configuração Playwright raiz, nem fornecer senha inline no shell/chat. Nenhuma produção alterada.
