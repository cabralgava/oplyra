# Skills — disponibilidade, origem e compatibilidade com a Oplyra

> Atualizado em 11/09/2026 na correção solicitada pelo usuário. A cópia local de verificacao-qualidade-codigo foi adaptada à Oplyra; o fechamento YAML de apple-design foi corrigido. DDD e Clean Architecture foram preservadas. DP-21c concluída para essas duas correções; não houve aprovação de stack, publicação ou adoção das regras de outros produtos.

## Alterações aplicadas nesta revisão

- Qualidade: escopo Oplyra, caminhos reais do harness, escopo por tenant/vínculo/permissão, invariantes da Oplyra, FinOps/imagens/Stripe e comparação sem Git quando necessário.
- Apple Design: delimitador final do frontmatter corrigido para três hífens; corpo preservado.
- Origem: arquivos locais fornecidos em /Users/cmii/Documents/Projetos/Oplyra; autoria original não verificada. Backup byte a byte e hashes preservados fora do projeto antes da aplicação.
- As tabelas seguintes são histórico dos achados anteriores: números de linha e “mudança proposta” não descrevem necessariamente a versão adaptada. Usar esta seção para estado atual; propostas de limpeza cosmética em DDD/Clean permanecem opcionais.

## 1. Disponibilidade verificada neste repositório

| Skill | Arquivos presentes | Leitura integral | Aplicação no discovery |
| --- | --- | --- | --- |
| `ddd-rapido-arquiteto` | `SKILL.md`, `README.md`, `references/ddd-conceitos.md`, `templates/prd-ddd.md`, `templates/revisao-arquitetural.md`, `templates/workshop-linguagem-ubiqua.md` | Sim, nesta execução | [03-domain-model](../product/marketing-ops/03-domain-model.md) |
| `clean-architecture-arquiteto` | `SKILL.md`, `README.md`, `references/principles.md`, `templates/architecture-template.md`, `templates/audit-template.md`, `templates/lovable-prompt-template.md`, `templates/use-case-template.md` | Sim, nesta execução | [04-architecture](../product/marketing-ops/04-architecture.md) |
| `verificacao-qualidade-codigo` | `SKILL.md` | Sim, nesta execução | Verificação documental do G1 ([ESTADO](ESTADO.md)) |
| `apple-design` | `SKILL.md` | Sim, nesta execução | [14-ux-flows](../product/marketing-ops/14-ux-flows.md) e protótipo |

## 2. Origem declarada nos próprios arquivos

| Skill | Origem declarada | Lacuna |
| --- | --- | --- |
| `ddd-rapido-arquiteto` | README: skill "baseada no conteúdo conceitual do arquivo 'Domain Driven Design Rapido.pdf'" | Autor, versão e data da skill não registrados |
| `clean-architecture-arquiteto` | README: "síntese operacional dos conceitos"; declara não incluir o PDF original | Autor, versão, data e fonte do material-base não registrados |
| `verificacao-qualidade-codigo` | Não há README nem declaração de origem. O conteúdo indica ter sido escrita para o "CRM Imob L4S" | Origem, autor e versão desconhecidos |
| `apple-design` | Seção "Referência": adaptação independente inspirada em *Apple Design*, de Emil Kowalski (link para repositório no GitHub), e em conceitos públicos da Apple | Versão e data não registradas; licença do material de inspiração não verificada |

## 3. Histórico dos trechos incompatíveis ou específicos de outros produtos

Linhas referentes aos arquivos lidos em 11/09/2026. Citações curtas e parciais.

### 3.1 `verificacao-qualidade-codigo/SKILL.md`

| Local | Trecho | Problema | Tratamento atual | Mudança proposta |
| --- | --- | --- | --- | --- |
| L3 (descrição) | "…deploys do CRM Imob L4S" | Escopo declarado de outro produto | Desconsiderado: a skill é aplicada como verificação genérica | Trocar o escopo para "Oplyra" ou para escopo neutro |
| L16–L19 (Limite da autorização) | "OK para implementação" autoriza "criar migrations versionadas, operar o Supabase local" | Compatível em espírito, mas define a semântica de autorização por conta própria; na Oplyra prevalecem CLAUDE, DESENVOLVIMENTO e PUBLICACAO | Aplicado só como regra mais restritiva: nada remoto sem autorização explícita | Referenciar o harness da Oplyra em vez de definir a semântica de aprovação |
| L26 (Fluxo, passo 4) | "seguir integralmente `docs/local-development.md`" | Arquivo inexistente na Oplyra; convenção de outro repositório | Desconsiderado | Apontar para os comandos reais em `docs/harness/VERIFICACOES.md` |
| L59 (Gates Supabase, item 8) | "escopo por organização, filial, equipe e registro" | Modelo de escopo do CRM (filial e equipe) não existe no domínio da Oplyra | Generalizado para "empresa (tenant), vínculo e permissão" | Substituir pelo modelo da Oplyra (empresa, vínculo, papel, permissão) |
| L63–L74 (Regras críticas do CRM Imob L4S) | Limites de "40 fotos por imóvel", "uma única geração… de descrição por imóvel", "distribuição… de leads", "tenant por hostname", "duplicidade SEO" | Regras de negócio de outro produto; importá-las violaria DEC-001 (greenfield) | **Integralmente desconsiderado** | Substituir por referência às invariantes e cenários da Oplyra ([03](../product/marketing-ops/03-domain-model.md) §7, [VERIFICACOES](VERIFICACOES.md)) |
| L37–L44 (Gates mínimos) | Lint, tipos, testes, build, E2E, acessibilidade | **Compatível** | Aplicável após existir código | — |
| L78–L93 (Resultado final) | Formato de relatório e status `aprovado \| aprovado com ressalvas \| bloqueado` | **Compatível** | Aplicado | — |

### 3.2 `clean-architecture-arquiteto/SKILL.md` e anexos

| Local | Trecho | Problema | Tratamento atual | Mudança proposta |
| --- | --- | --- | --- | --- |
| SKILL L3 (descrição) | "projetos Lovable, Supabase, Netlify, CRM, WhatsApp… produtos L4S" | Contexto de produtos e stack não aprovados para a Oplyra | Ativação por princípios genéricos; menções a produtos ignoradas | Descrição neutra, sem produtos |
| SKILL L41 (Frameworks & Drivers) | "Lovable, APIs externas, Evolution API, Meta" | Exemplos de fornecedores de outro produto | Tratados só como exemplos de "detalhes", sem adoção | Exemplos neutros ou da Oplyra (Supabase, Meta Ads, Google Ads, provedor de IA) |
| SKILL L81–L91 (Regra para projetos Lovable + Supabase) | "Quando o usuário estiver usando Lovable, Supabase e Netlify"; exemplos "enviar WhatsApp, transferir atendimento" | Premissa de stack (Lovable, Netlify) e casos de uso de CRM | **Princípios gerais aplicados** (regras fora de UI e SDK, adapters, casos de uso claros); premissas de stack e exemplos de CRM desconsiderados | Seção genérica "projetos com Supabase", sem Lovable/Netlify e com exemplos neutros |
| SKILL L95–L126 (Estrutura recomendada) | Pasta `infrastructure/whatsapp/` | Integração não prevista no MVP | Estrutura adaptada por contexto delimitado ([04](../product/marketing-ops/04-architecture.md) §12) | Remover pasta específica |
| SKILL L218–L267 (Formato para prompt Lovable) e `templates/lovable-prompt-template.md` | Prompt para a ferramenta Lovable | Ferramenta não adotada na Oplyra | Não utilizado | Tornar opcional/genérico ("prompt para agente de desenvolvimento") ou remover da cópia usada pela Oplyra |
| README (exemplos de uso) | "Revise a arquitetura do meu CRM…"; "atendimento humano no WhatsApp" | Exemplos de outro produto | Ignorados | Exemplos da Oplyra |
| `references/principles.md`, demais templates | Princípios, auditoria, casos de uso | **Compatível** | Aplicado | — |

### 3.3 `ddd-rapido-arquiteto`

| Local | Trecho | Avaliação |
| --- | --- | --- |
| SKILL (exemplos de entidades e VOs) | "Imóvel, Contrato, Lead"; "FaixaDePreço" | **Compatível**: exemplos ilustrativos, sem regra de negócio; não viram modelo da Oplyra |
| README (teste rápido) | "Modele um CRM imobiliário usando DDD… WhatsApp" | Exemplo de outro produto; ignorado. Proposta: exemplo neutro. Sem impacto na aplicação |

### 3.4 `apple-design`

| Local | Trecho | Avaliação |
| --- | --- | --- |
| SKILL L41 (rótulos) | "`Imóveis`, `Leads` e `Agenda`" | **Compatível**: exemplo de rótulos específicos |
| Frontmatter L1–L5 | Separador final formado por uma linha longa de hífens, fora do padrão YAML usual | Problema técnico de formatação a verificar; não afeta a leitura manual |

## 4. Regras de uso até a adaptação

1. Aplicar apenas as orientações compatíveis listadas acima. Instruções do projeto (CLAUDE, DESENVOLVIMENTO, VERIFICACOES, PUBLICACAO) prevalecem.
2. Não importar regras de negócio, stack, pastas ou dependências de CRM Imob L4S, L4S, Lovable, Netlify, Evolution API ou WhatsApp.
3. Alterações locais de qualidade e frontmatter estão cobertas pela correção solicitada (DP-21c). Preservar origem e registrar novas alterações; não transportar regras legadas para o produto.
4. A cada nova execução, verificar se os arquivos mudaram (data e conteúdo) antes de reutilizar este registro.
