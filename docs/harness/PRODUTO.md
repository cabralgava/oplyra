# Harness dos agentes do produto — Oplyra

## Escopo e estágio

Esta é uma especificação de requisitos para o discovery, não uma implementação nem arquitetura final aprovada. Ela detalha a governança multiagentes do documento de transição. Persistência, Auth e Storage terão Supabase como base: desenvolvimento local via Docker e publicação incremental em produção após aprovação; scheduler, filas, runtime e modelos complementares ainda serão definidos.

O harness deve envolver cada execução com contexto autorizado, ferramentas limitadas, contratos verificáveis, avaliação, estado persistente e recuperação. Agentes não recebem acesso ao repositório, terminal ou credenciais dos agentes de desenvolvimento por padrão.

## Contratos mínimos a definir no discovery

Os campos abaixo são conceituais; não geram schema ou migrations nesta fase.

| Contrato | Informações mínimas |
| --- | --- |
| Definição de agente | Identificador, versão, objetivo, schemas de entrada/saída, prompt e versão, ferramentas permitidas, contexto necessário, autonomia e responsável pela revisão. |
| Execução | `runId`, `tenantId`, solicitante, tarefa/workflow, correlação e causalidade, versão do agente/modelo/política, status, tentativa, timestamps, consumo e evidências. |
| Chamada de ferramenta | `toolCallId`, execução, ferramenta e versão, alvo, parâmetros validados, escopo, idempotency key, autorização, resultado e estado do efeito externo. |
| Aprovação | Tenant, aprovador e permissão, ação, destino, versão/hash do payload, limite de orçamento quando aplicável, validade, status e execução vinculada. |
| Memória | Tenant, origem, finalidade, permissões, versão, validade/retenção e conteúdo mínimo necessário. |
| Avaliação | Caso, versão avaliada, resultado determinístico, evidências, revisão de qualidade, limitações e decisão de liberação. |

Cada workflow deverá ter timeout, máximo de tentativas, turnos, delegações e custo. Os valores concretos devem ser propostos no discovery, configurados antes da ativação e validados por execução; não aceitar execução ilimitada quando faltar configuração. Medir consumo acumulado de subexecuções no orçamento do workflow e do tenant.

## Ciclo de execução

1. Autenticar o solicitante e resolver tenant/membership no backend. Triggers de scheduler usam identidade de serviço restrita e tenant explícito.
2. Verificar entitlement, permissão, integração e orçamento antes de enfileirar.
3. Persistir execução e versão do workflow; enfileirar de forma que falhas entre persistência e fila sejam recuperáveis pelo mecanismo definido no discovery.
4. Recuperar apenas contexto permitido ao tenant e à tarefa; registrar proveniência das evidências.
5. Executar o modelo dentro dos limites, validar saída e encaminhar propostas de ferramentas ao executor controlado.
6. Aplicar validações determinísticas e revisão independente de Estratégia e Qualidade quando pertinente.
7. Obter aprovação humana quando exigida; persistir espera sem manter uma execução ativa indefinidamente.
8. Antes de cada efeito, revalidar permissões, política, orçamento, aprovação e idempotência. Aplicar a mesma verificação após retomadas.
9. Persistir resultado, evidências, consumo e auditoria; escalar falhas ou incertezas sem fabricar sucesso.

## Autorização no executor

Prompts e recomendações do modelo não concedem autoridade. O executor deve bloquear chamadas não permitidas antes de alcançar o adapter.

| Ação | Padrão e controle |
| --- | --- |
| Ler dados do tenant | Membership/identidade de serviço válida, escopo mínimo, políticas de acesso e auditoria. |
| Produzir análise ou rascunho | Permitido dentro das capacidades e limites; saída estruturada e identificada como análise/rascunho. |
| Publicar, enviar comunicação ou alterar mídia | Negado no MVP de mídia em leitura; futuras capacidades exigem política e aprovação aplicáveis. |
| Alterar orçamento | Recomendação por padrão; aumento relevante exige aprovação humana ligada ao payload. |
| Chamar ferramenta não cadastrada ou alterar permissões | Negado; agente não pode ampliar a própria allowlist ou autonomia. |

Separar quem propõe, quem revisa e quem autoriza. Uma aprovação deixa de valer se payload, destino, versão ou condições materiais mudarem; aprovação expirada ou revogada não pode ser reutilizada. URLs e instruções recuperadas de conteúdo externo não habilitam novos destinos ou ferramentas.

## Estado, idempotência e concorrência

Modelar transições válidas entre `queued`, `running`, `waiting_approval`, `completed`, `failed` e `cancelled`, incluindo metadata de retry e retomada. `completed` exige resultado persistido e confirmação dos efeitos requeridos. Efeito externo incerto deve ficar explicitamente pendente de reconciliação, sem ser marcado como sucesso.

- Persistir checkpoints suficientes para retomar sem repetir entregas já confirmadas.
- Definir lease/lock e proteção contra workers obsoletos para a mesma execução.
- Usar chave de idempotência com tenant, operação e identidade estável do evento/ação; mesma chave com payload diferente deve ser rejeitada.
- Não assumir entrega única da fila nem execução externa exatamente uma vez. Usar deduplicação e reconciliação com o fornecedor.
- Retry automático somente para falhas classificadas como transitórias e ações repetíveis com segurança, com limite e backoff.
- Timeout após possível efeito exige consulta ao estado externo ou revisão humana antes de reenviar.
- Após esgotar tentativas, registrar dead-letter e escalonamento; reprocessamento preserva vínculo com a execução original e revalida autorização.
- Cancelamento e kill switch bloqueiam novas ações. Efeitos já confirmados exigem compensação explícita, quando disponível; não prometer desfazê-los automaticamente.

## Memória, evidências e observabilidade

Contexto e memória devem ter escopo por tenant em consultas, índices, caches e armazenamento. Definições globais podem conter instruções genéricas; não podem conter Brand OS nem informação privada de clientes. Minimizar contexto, expirar informações obsoletas e propagar exclusões conforme a política definida.

Registrar correlação entre workflow, execução, chamada de ferramenta, aprovação e evento externo. Medir latência, erros, retries, bloqueios, escalonamentos, qualidade e custo por agente/tenant/workflow. Logs devem permitir diagnóstico sem expor tokens ou conteúdo sensível desnecessário. Definir retenção e acesso na etapa de segurança do discovery.

## Avaliação e liberação

Construir conjunto versionado de casos sintéticos de sucesso, falha, dados insuficientes, instrução maliciosa, tentativas de acesso cruzado, aprovação obsoleta, duplicação e limites. Critérios determinísticos verificam contratos e segurança; revisão independente avalia qualidade estratégica, Brand OS, evidências e utilidade.

Mudanças de prompt, modelo, política, recuperação ou ferramentas exigem reavaliação dos casos afetados. Definir limiares de qualidade e custo no discovery; falha de isolamento ou autorização bloqueia a liberação. A primeira execução deve ocorrer em ambiente local com adapters simulados; expansão de autonomia é gradual, por tenant, ação e integração, dentro de aprovação explícita.

A publicação do runtime e de suas versões segue [PUBLICACAO.md](PUBLICACAO.md). Publicar software não autoriza automaticamente os agentes a enviar comunicações ou alterar orçamento: as permissões por ação e tenant continuam válidas.

## Saída esperada do discovery

Apresentar escolha e justificativa de runtime/filas/scheduler, estados e transições, política de ferramentas, matriz de autonomia, limites numéricos, catálogo inicial, estratégia de memória, autorização/RLS, plano de avaliações e mecanismos de recuperação. Mapear os cenários de [VERIFICACOES.md](VERIFICACOES.md) aos componentes propostos e parar para aprovação antes da implementação estrutural.

## IA multimodelo e FinOps

Contratos canônicos de execução em [05 §9](../product/marketing-ops/05-data-model.md#9-agentic-operations); Registry, Router, Eval Engine, Model Call, Ledger e reserva em [13 §14](../product/marketing-ops/13-ai-model-routing-finops.md#14-contratos-e-contabilização). A tabela mínima acima resume responsabilidades e não constitui schema alternativo.

Configurar os limites numéricos propostos de 13 §15 antes de ativar workflows pagos. Reservas são atômicas por tenant/workflow, abrangem filhos, retries e revisão; falha faturada permanece no Ledger, custo desconhecido fica pendente. Regras determinísticas não usam LLM. Fallback e escalonamento não contornam budget, privacidade, qualidade ou kill switch de modelo/provedor.

Franquias e semântica em [08](../product/marketing-ops/08-billing-entitlements.md); custo apurado e consumo comercial são medidores distintos. Autonomia em [11](../product/marketing-ops/11-agent-governance.md#12-autonomia-canônica-e-aprovação-por-versão). Geração/edição de imagens por Design exige revisão e medição; nenhuma publicação de anúncio é autorizada por uma aprovação de imagem.
