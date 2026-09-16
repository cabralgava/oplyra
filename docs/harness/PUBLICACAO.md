# Publicação incremental — Oplyra

## Decisão e alcance

Desenvolver com Supabase local via Docker e publicar cada módulo aprovado para produção em um projeto Supabase separado. Enquanto um incremento está publicado, os seguintes continuam em desenvolvimento local. Não aguardar a conclusão de todo o MVP para começar a publicar.

Esta estratégia substitui o adiamento de ambientes remotos para uma fase futura. Preserva Supabase como backend obrigatório, greenfield, Performance primeiro e a parada após discovery. Sua adoção não significa que ambientes ou deploys já foram executados.

## Ambientes

| Ambiente | Finalidade e regras |
| --- | --- |
| Local via Docker | Desenvolvimento e testes com Supabase local, migrations versionadas, dados sintéticos e integrações simuladas por padrão. |
| Produção no Supabase | Incrementos aprovados para publicação, com configuração, credenciais e dados próprios. Não usar como banco de desenvolvimento. |

O discovery deve definir criação e configuração do projeto de produção, identificadores dos destinos, gestão de secrets, recuperação e componentes complementares. Frontend, workers, scheduler e outros serviços precisam de destinos e procedimentos explícitos; publicar alterações no Supabase não publica automaticamente toda a aplicação. Não impor uma plataforma complementar antes do discovery.

## Aprovação por incremento

A aprovação pode cobrir em uma única decisão o aceite funcional e a publicação, desde que identifique versão, destino e escopo. Se a autorização já incluir deploy dessa versão, executar sem pedir novamente. Um aceite apenas funcional não concede autorização implícita para publicar.

Antes de solicitar aprovação, preparar o pacote revisável:

- Versão/commit, módulo e dependências, incluindo a fundação exigida.
- Resultado dos gates aplicáveis e limitações conhecidas.
- Migrations, políticas RLS/Storage e impacto sobre dados existentes.
- Componentes e configurações a publicar; variáveis e secrets necessários, sem expor valores.
- Sequência de execução, compatibilidade com versões ativas e eventual indisponibilidade.
- Verificações pós-deploy, critérios para interromper a publicação e plano de recuperação.

Mudança material no pacote exige reavaliar o escopo autorizado. Aprovar a estratégia, estes documentos ou o discovery não equivale a aprovar qualquer deploy futuro.

## Fluxo de publicação

1. Concluir e aprovar o discovery antes de implementar estrutura ou migrations.
2. Implementar o incremento no ambiente local. Antes do primeiro módulo, validar autenticação, tenants, memberships, permissões, RLS e Storage da fundação.
3. Verificar gates pertinentes, inclusive isolamento entre tenants e compatibilidade com o que já está em produção.
4. Preparar pacote de publicação e obter aprovação que inclua seu deploy.
5. Conferir destino, versão, histórico de migrations, credenciais disponíveis e condições de recuperação antes de aplicar mudanças.
6. Aplicar migrations e publicar componentes na ordem revisada; configurar os itens que não são transportados automaticamente por migrations.
7. Executar verificações não destrutivas de saúde, autenticação, autorização e fluxo do módulo. Não enviar mensagens, criar gastos ou alterar mídia real sem autorização correspondente.
8. Registrar versão publicada, migrations aplicadas, evidências e incidentes. Continuar o próximo incremento localmente.

## Migrations, configuração e dados

- Promover alterações versionadas; não copiar o banco local nem sincronizar dados de teste para produção.
- Não editar migrations já aplicadas em ambiente compartilhado; corrigir por nova migration rastreável.
- Evitar mudanças manuais no banco de produção fora do fluxo. Se uma intervenção emergencial autorizada ocorrer, registrar e reconciliar a alteração no repositório antes da próxima publicação.
- Planejar mudanças compatíveis com módulos ativos. Para alterações incompatíveis, separar expansão, adaptação dos consumidores e remoção posterior, com impacto aprovado.
- Registrar configurações de Auth, callbacks, Storage, integrações, funções e secrets por ambiente, sem pressupor que uma migration de banco configure tudo.
- Manter seeds sintéticos restritos ao local; dados iniciais necessários à produção devem ter procedimento próprio, revisado e idempotente.

## Falhas e recuperação

Definir recuperação por incremento: versão anterior dos componentes, correção progressiva do schema, eventual compensação e pré-requisitos de backup/restauração. Verificar as capacidades disponíveis no projeto de produção antes de depender delas. Não prometer rollback automático ou reversão de perda de dados.

Se a publicação falhar, interromper passos dependentes, registrar o que foi aplicado e inspecionar o estado antes de repetir. Migration parcialmente aplicada ou efeito incerto exige reconciliação; não repetir cegamente. Executar apenas recuperação coberta pela autorização; ações destrutivas adicionais exigem aprovação específica.

## Registro de entrega

Atualizar `ESTADO.md` com os estados separados: validado localmente, aguardando aprovação para publicar, aprovado para publicar, em publicação, publicado e verificado, ou publicação com falha. Registrar versão, destino sem segredos, referência da aprovação, migrations, resultado dos checks e próxima ação.

O gate G6 em [VERIFICACOES.md](VERIFICACOES.md) se aplica a cada publicação. Produção com falha de verificação não pode ser apresentada como entrega concluída.
