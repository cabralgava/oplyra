---
name: verificacao-qualidade-codigo
description: Revisar e validar de forma adversarial implementações, correções, refatorações, migrations, políticas RLS, integrações Supabase, interfaces e deploys da Oplyra. Usar obrigatoriamente depois de qualquer alteração de código ou banco e antes de declarar uma tarefa concluída, especialmente quando for necessário conferir o próprio trabalho, executar testes, validar isolamento multiempresa, levantar evidências ou decidir se uma mudança está pronta para homologação ou produção.
---

# Verificação de qualidade do código

## Princípio

Partir da hipótese de que a implementação pode estar errada. Tentar encontrar requisitos esquecidos, regressões, falhas de autorização, problemas de concorrência, vazamento entre organizações, erros de interface e mudanças não intencionais.

Não declarar sucesso sem evidências executadas no ambiente correto.

## Limite da autorização

Prevalecem a autorização vigente do usuário e o harness da Oplyra; esta skill não amplia escopo nem exige nova confirmação de ação já autorizada.

- Considerar o “OK para implementação” como autorização para alterar o código no escopo aprovado, criar migrations versionadas, operar o Supabase local e executar validações locais reversíveis.
- Não interpretar esse “OK” como autorização para `db push`, deploy, publicação, alteração de DNS, modificação de produção ou operação destrutiva.
- Interromper e solicitar nova autorização caso surja uma ação destrutiva, irreversível ou fora do plano aprovado.
- Nunca usar dados reais de clientes no ambiente local.

## Fluxo obrigatório

1. Reconstituir os requisitos e critérios de aceite da tarefa.
2. Ler o diff, o estado e os arquivos alterados. Sem Git, comparar com cópia anterior e hashes; não inicializar Git só para revisar.
3. Confirmar que a mudança ficou restrita ao escopo aprovado.
4. Quando houver dependência de banco, seguir integralmente `docs/harness/DESENVOLVIMENTO.md` e `docs/harness/VERIFICACOES.md` antes dos testes.
5. Revisar a implementação procurando ativamente falhas e efeitos colaterais.
6. Executar todos os gates aplicáveis.
7. Corrigir os problemas encontrados.
8. Reexecutar os gates afetados pela correção.
9. Entregar relatório com comandos, resultados, pendências e riscos.

## Gates mínimos

Executar os comandos existentes no projeto, sem inventar scripts. Detectar o gerenciador de pacotes pelo lockfile.

- Formatação e lint.
- Verificação de tipos em TypeScript.
- Testes unitários e de integração.
- Build de produção.
- Testes end-to-end dos fluxos críticos afetados, quando disponíveis.
- Revisão de segredos, logs sensíveis, `any`, código morto, duplicação e tratamento silencioso de erros.
- Validação de estados de carregamento, vazio, sucesso, aviso, erro e desabilitado em mudanças de interface.
- Validação de responsividade, teclado, foco, contraste e redução de movimento em mudanças de interface.

Se um comando não existir, registrar a lacuna. Não transformar “script ausente” em “teste aprovado”.

## Gates de Supabase e banco

Quando a tarefa tocar banco, Auth, Storage, RLS, migrations ou Edge Functions:

1. Confirmar que Docker e Supabase local estão saudáveis.
2. Recriar o banco local pelas migrations quando necessário.
3. Confirmar que o seed contém apenas dados fictícios e é reproduzível.
4. Executar lint e testes de banco disponibilizados pelo projeto.
5. Verificar constraints, índices, transações, idempotência e concorrência aplicáveis.
6. Confirmar RLS em todas as tabelas operacionais.
7. Testar ao menos duas organizações fictícias e provar que uma não acessa dados da outra.
8. Testar perfil-base, concessões adicionais e escopo por tenant, vínculo, papel, permissão e recurso quando afetados.
9. Confirmar que nenhuma chave administrativa foi exposta ao cliente.
10. Não executar comandos remotos como `supabase link`, `supabase db push` ou equivalentes sem autorização explícita para o ambiente remoto.

## Regras críticas da Oplyra

- Invariantes e fronteiras em docs/product/marketing-ops/03-domain-model.md; autorização e RLS por tenant.
- Aprovação vinculada à versão, sem autoaprovação automática de agente; mídia somente leitura.
- Contratos canônicos de Agent Run em 05 e de Registry/Router/Eval/Ledger em 13; ausência de SDKs no domínio.
- Medidores comerciais separados do custo de tentativas, reservas concorrentes, imagens e retries; limites e kill switches não contornados por fallback.
- Webhooks Stripe verificados e idempotentes; a escolha do provedor não autoriza cobranças reais.
- Executar cenários aplicáveis de docs/harness/VERIFICACOES.md e 15-test-plan.md. Na fase documental, verificar links, referências, consistência e evidências; não alegar testes de runtime inexistente.

## Resultado final

Concluir com este formato:

```text
Escopo validado:
Arquivos revisados:
Testes criados ou atualizados:
Comandos executados:
Resultados:
Requisitos comprovados:
Validações não executadas:
Pendências:
Riscos:
Status: aprovado | aprovado com ressalvas | bloqueado
```

Usar `aprovado` somente quando todos os gates aplicáveis passarem. Se algo não puder ser executado, explicar o motivo e reduzir o nível de confiança.
