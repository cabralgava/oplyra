# PR-G — preparação executável da Release 2.23 (03/11/2026)

- Estado: implementado e verificado; candidato separado para revisão, sem integração ou emissão de release.
- Branch: `prep/release-2-23-pr-g`, base `e71e7da67e65aa4012dc63c25a14e7843166c0f5`.
- Escopo: validator versionado, guarda de estado da release, transição por conteúdo exato, testes históricos e negativos, proposta de emenda ao D-1 do CR-034. CR-040 e CR-041 constam da composição proposta; CR-035 não entra. A aceitação da emenda é revisão do proprietário, não credencial produzida pelo agente.

## Implementação observada

O perfil 2.22 foi preservado integralmente em `test/contracts/cross-registry-validation-2.22.ts`: SHA-256 `11a44e8e11e8fa5d1a15abc77d40ab5fd37aa1abf179599aa879b2728e6a494d`, igual ao módulo original da base. O perfil 2.23 mantém 83 checks e substitui cinco expectativas superadas por checks com IDs distintos `-v2`. Ambos produziram 88 checks aprovados nos seus contextos próprios; a equivalência histórica inclui checks, inputs e counts, não apenas contagens.

`tools/contract-release/current-state.mjs` verifica ausência de outputs sem receita, base congelada, escopo exato, conteúdo de G, reconstrução de outputs intermediários/finais, evidência vinculada a G, reprodução congelada e equivalência G/P. A guarda corrente permanece ativa após o congelamento. Um manifest intermediário commitado não é aceito como publicação final. A política mínima da futura receita não permite apagar gates obrigatórios ou as igualdades de contagem. O módulo não concede autorização nem prova quem produziu uma evidência; a revisão de manutenção e os gates reais continuam obrigatórios.

`test/contracts/release-2.23-transition.json` é inventário de teste revisável, não receita nem manifest de release. Substitui as exceções anteriores por hashes exatos, incluindo os documentos do CR-040 sem dispensá-los antes da absorção. Na árvore candidata há 42 herdados modificados e 80 adições com conteúdo fixado; a própria lista, excluída do seu próprio hash para evitar autorreferência, também deve entrar como adição `contract_test` na receita futura, além do relatório gerado. Não há exclusão genérica de código por pasta. A classificação confirma `recipes/2.22.json`, sua evidência histórica e AGENTS como `contract_documentation`; marca-form e seu teste permanecem governados. Os números são da árvore candidata; devem ser recalculados contra o squash G antes da receita.

Os testes 2.16–2.21 consultam o snapshot publicado 2.22, que contém a cadeia histórica íntegra e coerente; preservam suas asserções de hashes e classificação. A guarda da árvore corrente é separada. O runner escolhe o perfil exportado pelo módulo do snapshot; snapshots antigos sem marcador continuam usando 2.22. Receitas e outputs futuros não participam de inputs da cross-validation.

## Verificação executada

- Suíte completa Vitest com acesso ao banco local sintético: **73 arquivos, 1.147 testes aprovados**. A primeira execução sem permissão de conexão local falhou com `EPERM`; a execução autorizada passou sem skips. Nenhum reset de banco foi executado.
- Após o reforço final das guardas e do recálculo independente: **22 arquivos, 370 testes aprovados**, incluindo contratos 2.16–2.23 e a ferramenta de release. Cenários G/P/F rodam em mini repositórios sintéticos; não emitem a release real.
- Casos negativos cobrem receita malformada, outputs fabricados/editados/parciais, base indevida, saída congelada tocada, snapshot ausente/incorreto, evidência de outro G, conteúdo fora do escopo, publicação intermediária, Playwright avulso, ordem de gates, checkout sujo, cache de outro HEAD/tree e regressão após congelamento.
- O comparador G/P rejeita tanto mudança de artefato governado quanto validator cujos inputs são contaminados pela presença de outputs. O perfil corrente também foi testado em cópia com receita/outputs futuros presentes e produziu resultado idêntico.
- Typecheck dos três pacotes core/infra/testing; typecheck estrito adicional do validator e do novo teste da release; sintaxe dos módulos .mjs; `git diff --check`: aprovados.
- Comparação byte a byte de **301 caminhos protegidos** com a base: nenhuma diferença, incluindo referência de transição, ADR-0006, registries, schemas, fixtures, migrations, manifests, relatórios e receita/evidência da 2.22.

## Limites e próximo passo

Nenhuma receita 2.23/2.24, manifest, relatório ou evidência real foi criado. Não houve execução dos comandos reais `build`, `gates` ou `reproduce` para novas releases, ensaio, ativação, emissão de concessão, mudança de ruleset ou chamada à produção. A reprodução da 2.22 é somente leitura e faz parte dos testes da ferramenta.

A PR #9 continua fora deste candidato e deve esperar o congelamento. O ensaio permanece pré-requisito da emissão. Depois da revisão e integração de PR-G, G será o SHA real do squash; recalcular inventário e contagens, cumprir o ensaio e só então preparar PR-P. Em PR-P, a receita não congelada deve apontar para a evidência versionada com seu hash, pois `.oplyra/` não é publicada. P conterá outputs finais e receita não congelada; PR-F aponta para P e vincula `evidence.baseCommit` a G. Manter estabilidade dos artefatos governados até PR-F.

Status de qualidade: **aprovado com ressalvas** para revisão do candidato; gates completos de emissão e ensaio continuam pendentes. Revisão executada por IA, sem alegação de revisão humana independente.
