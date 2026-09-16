# ADR-0008 — RBAC por vínculo, CLI de operações delimitada e suporte somente leitura

**Status:** proposta — não aprovada (DP-20, DP-23)

## Contexto e problema

Usuários participam de várias empresas com papéis diferentes, e a remoção de um membro deve cortar o acesso imediatamente. Agentes, suporte e operadores da plataforma precisam de identidades próprias com escopo mínimo.

Uma CLI de operações pode virar atalho para acesso irrestrito ao banco. Suporte pode virar acesso indevido a dados de clientes.

## Alternativas consideradas

| Alternativa | Avaliação |
| --- | --- |
| Papéis e empresas como claims no JWT | Acesso revogado persiste até o token expirar |
| Papéis personalizados por empresa no MVP | Complexo para testar e explicar nos pilotos |
| Console SQL ou shell de banco para operadores | **Rejeitada**: acesso irrestrito, sem trilha por intenção |
| Impersonation de usuários pelo suporte | **Fora do MVP**: risco alto; exigiria ADR própria |
| **Catálogo de permissões + papéis de sistema; vínculo consultado ao vivo; CLI com comandos delimitados; concessão de suporte somente leitura** | Recomendada |

## Decisão proposta

### RBAC

- O JWT carrega só identidade.
- `AccessContext` é montado no servidor a partir de vínculo ativo, papéis e permissões, e conferido de novo pela RLS ([ADR-0003](ADR-0003-tenancy-rls-e-acesso-a-dados.md)).
- Papéis de sistema: [07](../product/marketing-ops/07-security-lgpd.md) §3.
- Agentes usam identidade de serviço por execução, com permissões mínimas.

### `ops-cli` (DP-20)

| Requisito | Regra |
| --- | --- |
| Comandos | Lista fechada e versionada; cada comando chama **um caso de uso** com entrada validada. Sem SQL arbitrário, shell de banco ou "modo administrador" |
| Identidade | Operador da plataforma autenticado com MFA; papel de plataforma com permissão específica por comando |
| Autorização | Motivo obrigatório; empresa-alvo explícita quando aplicável; comandos destrutivos ou de recuperação exigem **segunda pessoa** e autorização registrada |
| Credencial | Por classe de comando, com menor privilégio. Nunca a credencial de migrations ou `service_role` para comandos comuns |
| Segurança de execução | `--dry-run` padrão para alterações; confirmação com resumo do efeito; idempotência |
| Auditoria | Registro antes e depois (comando, versão, operador, motivo, alvo, resultado, correlação) |
| Escopo no MVP | Provisionar empresa e primeiro Owner; atribuir plano ou override com validade; acionar ou liberar kill switch; conceder e revogar acesso de suporte; exportação e exclusão de empresa (com segunda pessoa) |
| Evolução | Console administrativo na Fase 5 com os mesmos casos de uso e controles |

### Suporte (DP-23)

| Elemento | Regra proposta |
| --- | --- |
| Escopo | **Somente leitura**, restrito a **uma empresa explícita**; recursos listados na concessão (ex.: execuções de IA, configurações, conexões), excluindo conteúdo sensível por padrão |
| Autorização | Solicitação do operador com motivo e referência do chamado; **consentimento** de Owner ou Admin da empresa (ou autorização contratual registrada para incidente crítico, a validar juridicamente) |
| Expiração | Máximo de 24 h; renovação exige nova autorização; revogável a qualquer momento pela empresa |
| Execução | Sessão marcada visualmente; nenhuma ação de escrita, envio, exportação ou aprovação |
| Auditoria | Concessão, cada acesso (recurso e hora), expiração e revogação, visíveis à empresa |
| Impersonation | **Não incluída no MVP** |

## Consequências

- Consulta de vínculo por requisição, que exige índice e medição no EXP-01.
- A CLI tem desenvolvimento próprio, mas evita acesso irrestrito.
- Suporte mais lento que impersonation, em troca de menor risco.

## Escopo afetado

`identity-access`, RLS, Storage, executor de ferramentas, `ops-cli`, suporte.

## Evidências e referências

[03-domain-model](../product/marketing-ops/03-domain-model.md) §7; [07-security-lgpd](../product/marketing-ops/07-security-lgpd.md) §3, §4, §6, §9.

## Responsável pela decisão

Responsável pelo projeto (pendente).

## Aprovação

Pendente. DP-20 é necessária para iniciar o I-01; DP-23 antes de suporte com dados reais.

## Substitui / é substituída por

—
