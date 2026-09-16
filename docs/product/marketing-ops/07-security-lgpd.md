# Oplyra — Security & LGPD

**Versão documental:** 0.2  
**Data:** 11 de setembro de 2026  
**Autoridade:** detalhamento do 00 v2.2, com decisões posteriores e regra de ancoragem em [ATUALIZACOES](ATUALIZACOES.md). Citar `DEC-0xx` apenas quando o identificador existir na v2.2. Propostas técnicas permanecem propostas.

## 1. Objetivo

Estabelecer requisitos mínimos de segurança e privacidade desde a fundação do SaaS multi-tenant.

## 2. Isolamento por tenant

- autorização em backend;
- RLS obrigatória nas tabelas de tenant, junto com autorização no backend (ADR-0001);
- storage isolado logicamente;
- credenciais por tenant;
- contexto de IA restrito ao tenant;
- testes automatizados de isolamento.

## 3. Identidade e acesso

Papéis iniciais:

- Owner;
- Administrador;
- Gestor de Marketing;
- Tráfego;
- Conteúdo/Social;
- Copywriter;
- Designer;
- Comercial;
- Executivo;
- Leitura;
- Operador parceiro/agência.

Permissões devem ser verificadas na interface, backend, banco/storage, integrações, ferramentas de agentes e aprovações.

## 4. Segredos e credenciais

- nunca expor secrets no frontend;
- criptografia em repouso;
- menor privilégio;
- logs sem tokens/PII desnecessária;
- revogação e rotação conforme fornecedor;
- suporte auditado.

## 5. LGPD

Requisitos:

- base legal/consentimento quando necessário;
- unsubscribe;
- suppression;
- retenção configurável;
- exportação;
- exclusão;
- minimização;
- finalidade;
- auditoria.

A política jurídica detalhada ainda deverá ser validada antes da operação comercial em escala.

## 6. IA e dados

- não enviar dados desnecessários;
- Brand OS e contexto de tenant não podem ser reutilizados entre clientes;
- prompts globais não incorporam conteúdo privado de tenants;
- ferramentas devem usar allowlist;
- inputs externos tratados como não confiáveis;
- proteção contra prompt injection;
- memória segregada por tenant;
- política de dados por provedor ainda deverá ser formalizada.

## 7. Ações de risco

Devem exigir aprovação humana ou política explícita:

- aumento relevante de orçamento;
- publicação externa;
- disparos em massa;
- alteração de automações críticas;
- ações irreversíveis;
- operações fora de budget.

## 8. Resiliência

- backups;
- recuperação;
- idempotência;
- retries limitados;
- dead-letter;
- rate limiting;
- circuit breaker;
- kill switch para integrações/agentes.

## 9. Auditoria

Registrar:

- ator humano/agente;
- tenant;
- ação;
- antes/depois quando aplicável;
- aprovação;
- ferramenta/provedor;
- custo quando houver;
- resultado;
- data/hora.

## 10. Pendências

- política formal de retenção;
- DPA/termos de fornecedores;
- política de dados usada por IA;
- SLA/SLO;
- processo de incidentes;
- requisitos jurídicos de e-mail e canais sociais por mercado.

## 11. Detalhamento e vínculos de segurança

### 11.1 Autorização e operações privilegiadas

Supabase Auth fornece identidade; membership e permissão são verificadas pelo backend e RLS. ADR-0003 propõe claims verificadas com escopo de transação, papéis restritos e schemas fora da Data API, condicionados ao EXP-01. ADR-0008 define proposta de CLI delimitada e suporte somente leitura por concessão temporária. Não interpretar essas propostas como implementação aprovada.

### 11.2 Credenciais

DP-16 propõe cifragem envelope na aplicação (alternativa Vault), com versionamento de chave, rotação e procedimento de recuperação. Gerenciador, responsáveis e periodicidade permanecem pendentes. Catálogo de operações privilegiadas em ADR-0008; credenciais de migrations não servem ao tráfego normal.

### 11.3 Dados pessoais e IA

Transcrições e demais derivados de ativos enviados podem conter dados pessoais e herdam tenant, permissões e retenção do ativo de origem (DEC-015); tratá-los com a mesma política do conteúdo original. DP-27 propõe excluir PII de leads/contatos de prompts, ferramentas, contexto recuperado, memória e logs. TST-20/21 testam agregados pequenos e campos livres; a regra de suprimir grupos menores que cinco é proposta de teste, não prova de anonimização. Revisar risco de reidentificação e política por provedor em DP-09c antes de dados reais. Não afirmar residência, retenção ou ZDR com base em referência antiga sem contrato aplicável.

### 11.4 Recuperação

Metas RPO/RTO permanecem decisão DP-07b. EXP-04 verifica banco, objetos do Storage e papéis em destino descartável autorizado; backup de metadados não prova recuperação de arquivos. Estratégia de réplica, retenção e cifragem é proposta, sem serviço contratado. Fonte do procedimento em 16 §8.

### 11.5 Documentos e incidentes

DP-22 lista política, termos, DPA, termo de piloto, suboperadores e avaliação de impacto quando aplicável. Responsável e validação jurídica permanecem pendentes; esta especificação não declara conformidade. Incidentes usam classificação/resposta de 16 §12 e procedimento jurídico a validar.

### 11.6 Retenção

Prazos de retenção do discovery são propostas por classe de dado, incluindo logs, eventos, ativos e backups. A decisão precisa reconciliar finalidade, exclusão, recuperação e obrigações aplicáveis. Não transformar os 30 dias do experimento de Storage em política universal de dados pessoais.
