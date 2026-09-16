# Guia de interface e referência Figma — Oplyra

**Data:** 15/09/2026  
**Versão:** 1.0  
**Fonte:** especificação e identificação dos frames fornecidas pelo usuário.  
**Verificação visual:** pendente; o arquivo Figma não pôde ser aberto nesta sessão. Cores, fontes, dimensões e IDs abaixo foram transcritos do material fornecido, não extraídos por inspeção dos frames.

## Finalidade e precedência

Orientar Claude Code e demais agentes de desenvolvimento na implementação coerente da interface Oplyra, uma plataforma SaaS de Marketing Operations voltada à gestão de campanhas e estratégias. O design adota dashboard moderno, tema escuro e acentos em roxo/violeta.

Este guia é a referência visual documental. Leia-o junto de [CLAUDE.md](../../../CLAUDE.md), das [atualizações de produto](ATUALIZACOES.md) e do [estado do trabalho](../../harness/ESTADO.md). Requisitos de produto, permissões, entitlements, isolamento e aprovações continuam regidos pelos documentos e decisões vigentes. Um botão ou módulo no Figma não comprova funcionalidade implementada nem autoriza ampliar o MVP.

As diretrizes visuais expressas pelo usuário orientam a interface. Detalhes não informados devem ser conferidos nos frames; se o acesso não estiver disponível, registrar uma proposta explícita. Não apresentar valores estimados como medidas extraídas do Figma. Se houver divergência entre este guia, frames posteriores ou decisões aprovadas, registrar a diferença e resolver conforme a instrução aplicável, sem substituir silenciosamente uma decisão.

## Endereços oficiais

- **Landing page e site institucional:** `https://oplyra.io`.
- **Aplicativo e telas internas:** `https://app.oplyra.io`.

Definição fornecida pelo usuário em 15/09/2026. A landing page apresenta o produto; as telas de Dashboard, Campanhas e Central Estratégica pertencem ao aplicativo. Usar esses endereços em exemplos, navegação entre site e app e especificações de produção. Isso não confirma configuração de DNS, certificado ou publicação. Ver [registro de domínios](ATUALIZACOES.md).

## Projeto e telas de referência

- **Projeto:** [Oplyra — Document no Figma](https://www.figma.com/design/i0et0FwrIIYJPodGglQiiC/Document).
- **File Key:** `i0et0FwrIIYJPodGglQiiC`.

| Tela | Node ID | Frame de referência | Dimensões informadas | Descrição fornecida |
| --- | --- | --- | --- | --- |
| [Dashboard](https://www.figma.com/design/i0et0FwrIIYJPodGglQiiC/Document?node-id=4-9) | `4:9` | `dashboard-oplyra` | 1440 × 1024 px | Painel principal com topbar e área de conteúdo. |
| [Campanhas Lista](https://www.figma.com/design/i0et0FwrIIYJPodGglQiiC/Document?node-id=4-268) | `4:268` | `campanhas-lista` | 1440 × 1335 px | Listagem de campanhas com sidebar de navegação. |
| [Central Estratégica](https://www.figma.com/design/i0et0FwrIIYJPodGglQiiC/Document?node-id=4-492) | `4:492` | `central-estrategica` | 1440 × 2078 px | Central de estratégias com sidebar e conteúdo expandido. |

Os nomes seguem a convenção informada; confirmar a árvore efetiva no Figma durante a inspeção. IDs identificam nós de design e não definem rotas da aplicação. As alturas representam os frames fornecidos, não alturas fixas obrigatórias para as páginas implementadas.

## Layout e navegação

- **Dark theme first:** tema escuro como padrão.
- **Base desktop:** 1440 px de largura para comparação com os frames; conteúdo deve adaptar-se à janela disponível.
- **Estrutura:** sidebar e área principal de conteúdo (`main-row` / `Frame`), com topbar conforme a composição da tela.
- **Sidebar fixa:** navegação lateral persistente em todas as telas internas no desktop, conforme a diretriz geral fornecida. A descrição do Dashboard só explicita topbar e conteúdo; confirmar sua composição ao inspecionar o frame e registrar eventual divergência com essa diretriz.
- **Topbar:** barra superior global indicada no Dashboard; verificar sua composição e aplicação às outras telas, sem inventar controles.
- **Conteúdo:** manter rolagem adequada para páginas longas, sem recortar Central Estratégica ou Campanhas à altura do frame.
- **Consistência:** extrair grid, espaçamentos, alinhamentos, larguras, bordas, raios e sombras dos frames; centralizar os valores confirmados no design system.

### Adaptação responsiva

A base de 1440 px não limita o produto a desktop. Em larguras menores, reorganizar cards, formulários e área principal, preservando ordem de leitura e ações essenciais. Quando a sidebar fixa comprometer o espaço útil, propor navegação recolhível ou drawer acessível; documentar essa adaptação porque não há frames móveis fornecidos.

Breakpoints, largura da sidebar e alturas da topbar ainda não foram informados. Defini-los de acordo com a stack existente e o comportamento do conteúdo, registrando-os como decisões de implementação. Tabelas podem ter rolagem localizada quando necessária, sem causar rolagem horizontal da página inteira.

## Paleta de cores

Os nomes de tokens abaixo são uma proposta de mapeamento semântico para implementação, não nomes confirmados de variáveis do Figma. Preservar os valores fornecidos e reutilizar tokens, evitando cores literais duplicadas em componentes.

### Fundos

| Token sugerido | Cor | Uso informado |
| --- | --- | --- |
| `color-bg-primary` | `#0c1023` | Background principal, escuro profundo. |
| `color-bg-secondary` | `#0a1520` | Background secundário. |
| `color-surface-card` | `#111e2c` | Cards e painéis. |
| `color-surface-alternate` | `#141a2e` | Background alternativo. |
| `color-surface-section` | `#1a2235` | Seções. |
| `color-surface-elevated` | `#1e2640` | Superfícies elevadas. |

### Destaques e ações

| Token sugerido | Cor | Uso informado |
| --- | --- | --- |
| `color-action-primary` | `#5b3df5` | Roxo primário, ações principais e CTAs. |
| `color-action-hover` | `#7c5ff7` | Roxo claro, hover/variação. |
| `color-accent-soft` | `#a78bfa` | Roxo suave, acentos secundários. |
| `color-interactive` | `#7c6bff` | Violeta, elementos interativos. |

### Status

| Token sugerido | Cor | Uso informado |
| --- | --- | --- |
| `color-status-success` | `#16a36a` | Sucesso. |
| `color-status-error` | `#e5484d` | Erro/alerta. |
| `color-status-warning` | `#f59e0b` | Aviso, amarelo/âmbar. |
| `color-status-info` | `#2f7df6` | Informação. |
| `color-accent-teal` | `#22d3c5` | Destaque alternativo. |

### Texto

| Token sugerido | Cor | Uso informado |
| --- | --- | --- |
| `color-text-primary` | `#ffffff` | Texto principal. |
| `color-text-secondary` | `#cbd5e1` | Texto secundário. |
| `color-text-tertiary` | `#8a9bb0` | Texto terciário. |
| `color-text-disabled` | `#5f6b85` | Texto desabilitado. |
| `color-text-label` | `#a0bdd0` | Labels e subtítulos. |

Validar contraste nas combinações reais de texto, fundo, controles e estados. A presença de uma cor na paleta não garante acessibilidade em qualquer combinação. Registrar ajustes necessários de contraste sem alterar silenciosamente a identidade visual.

## Tipografia

| Aplicação | Família | Peso informado |
| --- | --- | --- |
| Títulos de página | Manrope | ExtraBold, 800. |
| Subtítulos e seções | Manrope | Bold, 700. |
| Labels e botões | Inter | Semi Bold, 600, ou Bold, 700. |
| Corpo de texto | Inter | Regular, 400, ou Medium, 500. |
| Dados e métricas | Inter | Medium, 500. |

Inter é a família principal da UI; Manrope destaca títulos. Google Fonts é a fonte de distribuição sugerida pelo usuário. Usar o mecanismo de carregamento adotado pelo projeto, com fallback sans-serif. Tamanhos, entrelinhas e espaçamento entre letras devem ser extraídos dos frames; não foram especificados no texto de origem.

## Componentes e nomenclatura

- Manter frames em kebab-case: `dashboard-oplyra`, `campanhas-lista`, `central-estrategica`.
- Referências de layout: `topbar`, `sidebar`, `main-row`.
- Seguir as convenções reais de código do repositório para componentes, arquivos e rotas; kebab-case dos frames não impõe a nomenclatura de componentes React.
- Reutilizar a estrutura de navegação, títulos, cards, botões, formulários, indicadores de status e componentes de dados efetivamente encontrados nas telas.
- Separar componentes visuais de regras de domínio e integrações. Dados demonstrativos do design não devem aparecer como métricas reais da operação.
- Prever carregamento, vazio, erro, sucesso, indisponibilidade e estados desabilitados conforme o fluxo, além da aparência preenchida do frame.
- Ações por ícone precisam de nome acessível; foco e navegação por teclado devem ser verificáveis. Status não deve depender somente da cor.

## Stack sugerida e decisões existentes

| Camada | Sugestão fornecida | Orientação de adoção |
| --- | --- | --- |
| Framework | React / Next.js | Seguir a stack aprovada no repositório de desenvolvimento; esta referência não autoriza migração. |
| Estilização | Tailwind CSS | Mapear tokens para o mecanismo de tema existente; confirmar versão e convenções locais. |
| Ícones | Lucide Icons ou Phosphor Icons | Escolher uma família coerente com os frames e com as dependências existentes; não instalar ambas por padrão. |
| Gráficos | Recharts ou Chart.js | Usar a biblioteca aprovada ou propor uma escolha fundamentada quando necessário. |
| Fontes | Google Fonts: Inter e Manrope | Preservar famílias e pesos, seguindo a estratégia de carregamento do projeto. |

Estas opções foram apresentadas como sugestões. Não substituem ADRs aprovados, Supabase, isolamento por tenant ou Clean Architecture. Conferir o repositório ativo antes de concluir que a stack ainda está em aberto. Cópias históricas de reconciliação não representam automaticamente o estado atual da aplicação.

## Procedimento para Claude Code e outros agentes

1. Ler as instruções do repositório, o estado atual, este guia e as decisões relevantes para a tela.
2. Identificar a tela e abrir seu node no Figma por uma ferramenta disponível e autorizada. Registrar data e frame consultado; usar captura/exportação como evidência quando possível.
3. Conferir componentes existentes e levantar medidas e estados que faltam. Distinguir extração do Figma, especificação do usuário e proposta de implementação.
4. Mapear a tela aos requisitos de produto e ao incremento autorizado. Layout não define sozinho comportamento, permissões ou integrações.
5. Implementar usando tokens e componentes compartilhados, dentro da stack e escopo já aprovados. Sem acesso ao Figma, usar esta especificação para o trabalho possível e registrar a limitação de fidelidade visual.
6. Comparar a tela com o frame em 1440 px, testar adaptação a larguras menores, teclado, foco, contraste e estados relevantes. Registrar diferenças intencionais e motivos.
7. Atualizar o estado do trabalho com arquivos alterados, evidências reais e pendências. Não declarar equivalência visual sem comparação efetiva.

## Critérios de aceite da implementação futura

- Tema escuro, paleta e hierarquia tipográfica aplicados por tokens reutilizáveis.
- Navegação e composição conferidas nos nodes correspondentes; eventual diferença do Dashboard documentada.
- Comparação visual realizada na largura de referência, sem impor altura fixa aos conteúdos.
- Layout utilizável em larguras menores, com navegação acessível e sem corte de ações essenciais.
- Estados de carregamento, vazio, erro, indisponibilidade e permissões coerentes com o produto.
- Dados reais separados de placeholders; informação indisponível não apresentada como zero ou resultado confirmado.
- Ações e estados respeitam permissões, entitlements, aprovação e estágio de implementação.
- Evidências visuais e funcionais registradas segundo [VERIFICACOES.md](../../harness/VERIFICACOES.md).

## Pendências de inspeção

Confirmar no Figma: composição do Dashboard e sidebar; componentes e variantes; grid e espaçamentos; dimensões de navegação; raios, bordas e sombras; tamanhos tipográficos; ícones; composição de gráficos; interações e telas responsivas, se existirem. Essas pendências limitam a verificação de fidelidade visual, mas não impedem o uso deste guia documental.
