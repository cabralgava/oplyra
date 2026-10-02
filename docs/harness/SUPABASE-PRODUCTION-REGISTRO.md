# Supabase de produção — registro operacional

**Atualizado:** 02/10/2026. **Estado:** `project_created_pending_preflight`.

## Identidade e evidência

| Campo | Registro |
| --- | --- |
| Nome informado | `oplyra-production` |
| Project ref | `hysigyhfpyyydycxxpsm` |
| Dashboard | [Projeto no Supabase](https://supabase.com/dashboard/project/hysigyhfpyyydycxxpsm) |
| Criação | Proprietário informou a criação em 02/10/2026 e forneceu o link do projeto |
| Verificação remota pelo agente | Não realizada nesta atualização documental |

A tela anterior à criação mostrava organização `cmii` (Pro), região São Paulo e compute Micro. São evidências do formulário, **não confirmação da configuração final**. Plano, organização, região, compute, custo, MFA, backup e opções de segurança efetivamente contratados/configurados devem ser conferidos no painel. Nenhuma senha ou chave é registrada neste documento.

## Escopo e autoridade

O proprietário realizou a criação do projeto e autorizou seu registro documental. Isso atualiza o fato operacional de que antes não havia projeto remoto; não aplica migrations nem autoriza automaticamente publicação da aplicação, dados reais, Auth aberto, workers, dispatcher, providers pagos ou novas operações remotas pelo agente.

Este registro complementa [PREPARACAO-SUPABASE-PRODUCAO](PREPARACAO-SUPABASE-PRODUCAO.md), sem reescrever seu conteúdo governado pela Release 2.22. Nenhum contrato, schema, migration, manifest ou política do harness é alterado por este checkpoint.

## Estado da preparação

- **Concluído, conforme o proprietário:** criação do projeto com o ref acima.
- **Pendente de confirmação:** configurações finais, custódia das credenciais e histórico remoto vazio. A criação não comprova esses itens.
- **Pendente:** preflight Grupo A do B-2, somente leitura, conforme o plano existente; nenhuma consulta remota foi executada nesta atualização.
- **Pendente, autorização separada:** aplicação de migrations 000001–000015, contíguas, sem `supabase/seed.sql`, com content/outbox/dispatcher inertes e verificação do Grupo B. O pacote deve fixar commit, destino, escopo e executor antes da execução.
- **Pendente:** checklist de Auth B-6, confirmação de backups e demais decisões de criação/publicação ainda abertas no plano.
- **Não ativado por este registro:** aplicação, runtime produtivo, dados reais ou integrações externas do produto.

## Orientação para desenvolvimento e harness

1. Desenvolvimento e CI continuam locais. A existência do projeto não flexibiliza a recusa de endpoints remotos em `local`/`ci` nem reintroduz `OPLYRA_ALLOW_REMOTE`.
2. Não colocar credenciais de produção no `.env` de desenvolvimento, em logs, prompts, Git ou CI de pull requests. Custódia e uso operacional seguem o plano de produção.
3. Não executar seed, `db reset --linked`, migrations, SQL/DDL manual ou conectar execução autônoma ao projeto por inferência deste documento.
4. Não habilitar integração GitHub/Supabase de deployment automático como consequência da entrega delegada Git/GitHub do CR-033. São capacidades distintas.
5. O runtime `production` continua exigindo configuração validada, fingerprint e `TrustedDeploymentContext` de provedor aprovado. Criar o banco não fornece essa evidência de deployment.
6. Planejar a estrutura produtiva pelas migrations e contratos existentes; manter as regras de negócio independentes do projeto hospedado. Mudanças de estrutura ou autorização seguem seu processo governado.

## Próximo checkpoint

Conferir as configurações finais e registrar evidência sem segredos; preparar o preflight e o pacote de autorização específicos. Após execução autorizada, registrar resultados reais, histórico de migrations e incidentes. Até lá, não marcar o ambiente como publicado, verificado ou pronto para usuários.
