# Estado do trabalho — Oplyra

Checkpoint operacional deste repositório. Validar o conteúdo contra os arquivos reais e contra a autorização vigente ao retomar. Não substituir este registro por checkpoint de outro workspace.

## Situação atual — 15/09/2026

- **Etapa:** Fase 0 concluída documentalmente; reconciliação documental aplicada após a substituição da referência protegida. **Implementação não iniciada.**
- **Autorização vigente:** reconciliação documental e realinhamento do protótipo (15/09/2026). Decisões de stack e recorte tomadas em 15/09; a **execução local do I-01 ainda depende de aceite explícito**. Publicação e efeitos externos seguem não autorizados.
- **Referência protegida:** [00 — Documento de Transição v2.2, de 13/09/2026](../product/marketing-ops/00-documento-transicao.md). SHA-256 `79a251380fe7f596bfeb7b43f5b599d7c441b9aed5a8ad3c6dec368bd7e1435b`, conferido em 15/09/2026. Somente leitura.
- **Precedência:** [ATUALIZACOES](../product/marketing-ops/ATUALIZACOES.md) registra as decisões posteriores e a regra de ancoragem dos identificadores DEC.
- **Aprovação de discovery ou de incremento:** nenhuma registrada.

## Reconciliação de 15/09/2026

**Motivo.** Entre 13/09 e 15/09 a referência protegida foi substituída (v2.2 no lugar da v2.3 que sustentava os documentos derivados) e as instruções e o checkpoint foram sobrescritos por versões de outro workspace, que não continha os documentos 01–18, os ADRs, o registro de decisões, as skills nem os protótipos. Isso produziu afirmações falsas para este repositório e quebrou a ancoragem das decisões, porque os identificadores DEC mudaram de significado entre versões.

**Aplicado nesta reconciliação:**

- Referência corrigida para v2.2 em CLAUDE, README, ATUALIZACOES e índice de produto.
- Ancoragem das decisões normalizada: `DEC-0xx` apenas quando corresponde à numeração da v2.2 §27; Stripe, budgets, imagens e arquitetura multimodelo passam a citar ATUALIZACOES, sem identificador inventado.
- Índice de produto refeito com os arquivos que existem; removida a afirmação de que apenas o 00 estaria disponível.
- Este checkpoint restaurado, preservando as definições de 15/09 sobre domínios e referência visual; removida a referência a `entregaveis/`, pasta que pertence ao ambiente de preparação e não existe aqui.
- Escopo de vídeo reconciliado nos documentos derivados: análise de ativo enviado permitida, geração nativa não.
- Método de campanha (DEC-017) incorporado a requisitos, fluxos, agentes, testes e experimentos.
- Direção visual unificada no guia de interface; protótipo claro preservado como histórico e versão realinhada publicada.

## Entregas existentes

| Entrega | Situação | Evidência |
| --- | --- | --- |
| Instruções e README | Atualizados nesta reconciliação | [CLAUDE](../../CLAUDE.md), [README](../../README.md) |
| Documentos de produto 01–18 | Presentes; reconciliados com a v2.2 | [Índice](../product/marketing-ops/README.md) |
| ADRs 0001–0008 e registro de decisões | Presentes; ADR-0001 aprovada, demais propostas | [Decisões](../decisions/README.md) |
| Harness | Documentado | [DESENVOLVIMENTO](DESENVOLVIMENTO.md), [VERIFICACOES](VERIFICACOES.md), [PRODUTO](PRODUTO.md), [PUBLICACAO](PUBLICACAO.md) |
| Preparação do I-01 | Contratos e critérios de aceite definidos; stack decidida em 15/09; **aguardando aceite do escopo de execução** | [PREPARACAO-I01](PREPARACAO-I01.md) |
| Skills | Quatro presentes e aplicadas; duas adaptadas | [SKILLS-COMPATIBILIDADE](SKILLS-COMPATIBILIDADE.md) |
| Protótipo vigente | Realinhado ao guia de interface | [performance-mvp.html](../product/marketing-ops/prototypes/performance-mvp.html) |
| Protótipo histórico | Tema claro, preservado sem uso normativo | [performance-mvp-legacy-claro.html](../product/marketing-ops/prototypes/performance-mvp-legacy-claro.html) |
| Marca e interface | Fornecidas pelo usuário | [Manual de marca](../brand/oplyra_brand_system.md), [Guia Figma](../product/marketing-ops/GUIA-INTERFACE-FIGMA.md) |
| Relatório da reconciliação anterior | Histórico de 11/09 | [RELATORIO-RECONCILIACAO](RELATORIO-RECONCILIACAO.md) |

Existência de arquivo não equivale a aplicação de skill, nem a verificação executada, nem a aprovação.

## Verificações executadas

| Data | Verificação | Resultado e limite |
| --- | --- | --- |
| 11/09 | Links e âncoras Markdown, títulos 01–18, nomes antigos, rastreabilidade FX/TST/EXP/I-0x | Sem pendências no conjunto de então |
| 11/09 | Protótipo conceitual no navegador, estado lido no DOM: geração, edição, falha, limite, consumo, aprovação por versão, troca de empresa, viewport 768 px | Aprovado; teclado por injeção não confirmado; sem leitor de tela nem dispositivo real |
| 15/09 | Inventário do repositório, SHA-256 da referência, mapeamento dos identificadores DEC entre versões, varredura de domínios e de menções a vídeo | Base desta reconciliação |
| 15/09 | Revarredura de links e âncoras após as alterações | Registrada na entrega correspondente |

Nenhum teste de aplicação foi executado: não há código, banco, ambiente ou agentes. EXP-01 a EXP-05 continuam especificados e não executados. O diretório **não é repositório Git**; comparações usam cópias e hashes.

## Skills

As quatro skills citadas em CLAUDE existem em `.claude/skills/`: `ddd-rapido-arquiteto`, `clean-architecture-arquiteto`, `verificacao-qualidade-codigo` e `apple-design`. Foram lidas e aplicadas neste repositório na ordem DDD → Clean Architecture → verificação, com `apple-design` no trabalho de UX. Duas receberam adaptação autorizada: escopo da skill de qualidade e delimitador YAML de `apple-design`. Trechos de CRM Imob L4S, L4S e Lovable foram desconsiderados e estão registrados em [SKILLS-COMPATIBILIDADE](SKILLS-COMPATIBILIDADE.md).

## Domínios oficiais — 15/09/2026

Landing page e site institucional em `https://oplyra.io`; aplicativo em `https://app.oplyra.io`. Substitui `oplyra.com.br` e `app.oplyra.com.br` (DEC-009) para novas especificações. Registro documental: não comprova registro de domínio, DNS, TLS ou publicação, e desenvolvimento local continua em endereços locais.

## Referência visual — 15/09/2026

O [Guia de interface Figma](../product/marketing-ops/GUIA-INTERFACE-FIGMA.md) é a referência visual vigente, coerente com o [manual de marca](../brand/oplyra_brand_system.md): tema escuro, roxo `#5B3DF5`, Manrope em títulos e Inter no produto, comparação em 1440 px.

**Frames inspecionados: nenhum.** A abertura do arquivo Figma falhou; os nodes `4:9`, `4:268` e `4:492` seguem por conferir. Medidas, grid, espaçamentos, raios, sombras, tamanhos tipográficos, ícones e composição de gráficos permanecem pendentes, assim como a confirmação da sidebar no Dashboard. Os valores do guia vieram do material fornecido pelo usuário, não de extração dos frames.

## Ambientes e publicação

- Desenvolvimento: Supabase local via Docker, ainda não configurado.
- Produção: projeto Supabase separado, não criado.
- Versão publicada: nenhuma. Aprovação de deploy: nenhuma.
- Nenhuma conta de fornecedor, cobrança, benchmark pago ou infraestrutura foi criada.

## Pendências e próximo passo

1. **Aceitar o escopo de execução do I-01** ([PREPARACAO-I01](PREPARACAO-I01.md) §8). Stack e recorte já estão decididos: TypeScript, pnpm workspaces, Next.js, Vitest/pgTAP/Playwright, Git local e escopo enxuto; Turborepo adiado. Enquanto o aceite não vier, nenhum scaffold, migration, ambiente, repositório Git ou gasto pode ser criado.
2. Pendências econômicas e comerciais: medidores e período, quinta ocorrência semanal, COGS e rateio, limites por workflow, cobrança de pilotos. Cada uma bloqueia a capacidade correspondente, não o trabalho local.
3. Pendências criadas pelo escopo de vídeo: provedor de análise multimodal, medidor e franquia, custo por ativo, limites de formato e retenção dos derivados.
4. Inspecionar os nodes do Figma quando houver acesso e registrar medidas reais, substituindo as propostas.
5. Após aprovação do incremento, implementar a fundação e preencher os comandos reais em [VERIFICACOES](VERIFICACOES.md).

## Modelo para próxima atualização

```text
Etapa e status:
Objetivo e escopo autorizado:
Arquivos/versão de referência:
Entregas concluídas:
Verificações: resultado, evidência e limitações
Trabalho parcial e efeitos já executados:
Bloqueios ou decisões pendentes:
Aprovação: referência, escopo e versão, se houver
Próxima ação autorizada:
```
