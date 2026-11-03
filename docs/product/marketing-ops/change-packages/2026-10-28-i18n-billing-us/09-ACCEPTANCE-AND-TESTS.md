# Critérios de aceite e plano de testes

**Status:** casos especificados, todos os testes de produto abaixo **não executados** nesta entrega documental. **Destino recomendado:** vincular ao CR e a `docs/product/marketing-ops/15-test-plan.md`. IDs `CP-*` são locais ao pacote, sem criar gates/erros/actions de runtime.

## Matriz mínima

Executar os quatro pares `pt-BR/BRL`, `pt-BR/USD`, `en-US/BRL`, `en-US/USD`, com pelo menos dois tenants sintéticos e pessoa com membership em ambos. Casos financeiros verificam moeda e valores tipados além do texto exibido. Growth só é habilitado em fixture explicitamente elegível; nenhuma fixture prova liberação comercial. Preservar também tenant sem assinatura, locale inesperado, override válido/expirado e estado financeiro desconhecido.

Camadas: **C** contrato/validador; **U** domínio/caso de uso/fake; **I** integração local com Auth/persistência/RLS reais; **E** E2E local com provider fake; **S** Stripe teste autorizado; **O** verificação operacional autorizada. Stripe sandbox não substitui testes de RLS; E2E com fake não prova billing real.

## Casos verificáveis

| ID | Req. | Cenário e resultado esperado | Camadas |
| --- | --- | --- | --- |
| CP-01 | R-01/05 | Os quatro pares idioma/moeda exibem preço/moeda corretos, mantendo tenant e direitos | U/E/S |
| CP-02 | R-01 | Catálogos pt-BR/en-US têm mesmas chaves, parâmetros, pluralização e mensagens críticas completas | C/U |
| CP-03 | R-05 | Pessoa troca idioma de tela; contrato, Price, currency e contexto de marca permanecem iguais | U/E |
| CP-04 | R-05 | Trocar tenant refaz autorização/fallback; cache não contém marca ou billing do outro | I/E |
| CP-05 | R-01/05 | Locale ausente/inválido usa política de fallback; entrada de cobrança não herda moeda dessa escolha | U/E |
| CP-06 | R-01 | Login, convite, validação, erros, vazio/carregamento e labels acessíveis funcionam nos dois idiomas | E |
| CP-07 | R-01/05 | Formatar minor units BRL/USD, datas/fusos e percentuais não altera valores nem parse canônico | U/E |
| CP-08 | R-01 | Texto longo e nomes reais do domínio cabem em desktop/mobile; foco/teclado/leitor de tela preservados | E |
| CP-09 | R-05 | outputLocale da tarefa difere da UI; produção segue canal/marca/pedido válido e registra versão | C/U |
| CP-10 | R-05/06 | Pedido conflitante com claim/voz L2 não sobrescreve verdade; gera conflito/resolução | U |
| CP-11 | R-05/06 | Tradução de peça aprovada cria derivado e invalida approval para versão executada alterada | U/I |
| CP-12 | R-05 | Trocar idioma não promove conversa ou preferência a L1/L2 | U/I |
| CP-13 | R-02 | Catálogo completo tem preço manual por plano/moeda/intervalo/versão, sem consulta cambial para preço | C/U |
| CP-14 | R-02/08 | Preço/intervalo/tax behavior/approval ausentes bloqueiam publicação; null nunca vira zero | C/U |
| CP-15 | R-02/06 | Cliente envia amount/Price ID/moeda inválidos ou oferta expirada; servidor rejeita sem cobrar | U/E/S |
| CP-16 | R-02 | Câmbio financeiro muda; BRL contratado fica igual e líquido USD pode mudar sem alterar Price | U/S/O |
| CP-17 | R-02/08 | Nova versão BRL não muda USD ou assinaturas antigas; oferta nova usa versão aprovada vigente | C/U/S |
| CP-18 | R-02 | Adaptive Pricing/canal não permitido tentam alterar presentment; validação detecta divergência e bloqueia liberação | S/O |
| CP-19 | R-02/08 | Troca de moeda não é mudança de locale; sem fluxo homologado, operação é impedida | U/E |
| CP-20 | R-06 | Mesmo clique/operação repetida ou dois workers concorrentes resultam em uma aquisição efetiva | U/I/S |
| CP-21 | R-06 | Mesma idempotency key com payload diferente gera conflito sem chamada financeira nova | U/I/S |
| CP-22 | R-09 | Timeout após criação externa mantém efeito incerto; reconciliação encontra recurso sem duplicar | U/I/S |
| CP-23 | R-09 | Retry após janela do provider exige reconciliação/unicidade local, sem recriar efeito por nova chave | U/I |
| CP-24 | R-06/09 | Assinatura de webhook ausente/inválida, corpo alterado ou replay temporal fora da política são rejeitados | U/S |
| CP-25 | R-06/09 | Falha de inbox antes do commit não recebe 2xx de sucesso; reentrega persiste e processa | I/S |
| CP-26 | R-09 | Queda após persistência/ack e antes do worker permite retomada sem perder evento | I/S |
| CP-27 | R-09 | Evento idêntico repetido e eventos distintos do mesmo pagamento não duplicam direito, consumo ou aviso | U/I/S |
| CP-28 | R-09 | Eventos fora de ordem e mesmo created convergem ao estado atual; timestamp não decide versão | U/I/S |
| CP-29 | R-09 | Dois snapshots lidos em paralelo não fazem estado velho sobrescrever novo; versão obsoleta refaz leitura | I |
| CP-30 | R-06 | Evento válido de conta/ambiente diferente ou mapping ausente entra em quarentena sem conceder acesso | U/I/S |
| CP-31 | R-06 | Metadata forjada/e-mail igual não permite associar Customer/Subscription ao tenant errado | U/I/S |
| CP-32 | R-06 | Leitura/escrita/listagem de invoice, preço privado e billing profile B por pessoa de A são negadas | I/E |
| CP-33 | R-06 | Membership removida ou permissão revogada após agendamento bloqueia a operação no momento do efeito | U/I |
| CP-34 | R-06 | Portal Session não aceita Customer ID arbitrário e não expõe outro tenant da mesma pessoa | U/E/S |
| CP-35 | R-03/06 | Chave live no ambiente teste ou mapping test em live causa falha fechada; SDK só em adapter | C/U/O |
| CP-36 | R-06/09 | Primeiro pagamento incomplete/ação requerida não concede plano pago novo por redirect ou evento isolado | U/E/S |
| CP-37 | R-06 | Plano pago concede somente capacidade disponível; Growth indisponível e ação sem permission continuam negadas | U/I |
| CP-38 | R-06 | Invoice zero/cupom/crédito/pagamento externo/trial seguem política explícita sem serem confundidos | U/S |
| CP-39 | R-06/08 | Renovação atualiza período uma vez; falha aplica grace aprovado sem suposição de duração | U/I/S |
| CP-40 | R-06/08 | Upgrade/downgrade calcula preview e aceite correto; item não é duplicado; capability muda na vigência correta | U/E/S |
| CP-41 | R-06/08 | Mudança de plano, fuso ou moeda não reinicia franquia; reservas concorrentes impedem excedente | U/I |
| CP-42 | R-08 | Cancelar no fim do ciclo preserva direito até data; cancelamento imediato/refund exigem política própria | U/S |
| CP-43 | R-06/09 | Refund parcial/total concorrente não excede pagamento; retry não repete; estado pendente não é sucesso | U/I/S |
| CP-44 | R-06/09 | Disputa/fraude não apaga tenant nem executa restrição fora da política; caso tem dono e trilha | U/S |
| CP-45 | R-03/04 | Invoice/recibo da LLC têm valor/moeda/período/seller/idioma corretos; aberto não aparece como comprovante pago | E/S |
| CP-46 | R-04 | UI distingue invoice e recibo e não promete NFS-e; termos aceitos têm versão/locale/ator recuperáveis | C/E/S |
| CP-47 | R-09 | Webhook perdido e alteração manual no Dashboard são detectados por reconciliação paginada e idempotente | U/I/S |
| CP-48 | R-03/10 | Reconciliação relaciona bruto/fees/refund/FX/settlement/payout sem soma multimoeda ou regra 1 payout=1 tenant | U/S/O |
| CP-49 | R-10 | Mensalidade Oplyra não gera revenue.recorded no tenant; análises de clientes preservam fonte/coverage/null | C/U |
| CP-50 | R-10 | Custos microUSD/budgets de IA não mudam com moeda da assinatura e não recebem valores de preço | U/I |
| CP-51 | R-06/07 | Autonomy aceita apenas quatro valores; permission none não vira autonomy; approval de qualidade não libera execução financeira | C/U |
| CP-52 | R-07 | Schema desconhecido, action/event/error/owner não registrados e refs inválidas falham antes do efeito | C/U |
| CP-53 | R-07 | Compatibilidade é demonstrada para produtores/leitores antigos e novos; campo obrigatório novo exige estratégia major | C/I |
| CP-54 | R-06/11 | Nenhum segredo/cartão/URL sensível/PII desnecessária aparece em logs, prompts, fixtures ou exports do pacote | C/I |
| CP-55 | R-09/12 | Retry limitado, lease expirado, dead-letter e replay governado não duplicam efeitos e mantêm correlation/causation | U/I |
| CP-56 | R-12 | Backfill dry run mantém valores/assinaturas originais e não infere currency por locale | I |
| CP-57 | R-12 | Kill switch para compra nova mantém ingestão/reconciliação; runbook trata renovações existentes separadamente | I/S/O |
| CP-58 | R-12 | Rollback preserva dados financeiros, snapshots e audit trail; reabertura exige reconciliação saudável | I/O |

## Fixtures e evidência

Cada contrato futuro exige exemplo válido mínimo e fixtures negativas de campos ausentes, versão desconhecida, moeda divergente, tenant mismatch, pagamento duplicado, approval inválido, Price desconhecido e estado financeiro inesperado. Business invariants não resolvidas por JSON Schema precisam de testes de domínio e de concorrência.

Para cada execução, registrar caso, versão de contrato/código, ambiente, API/SDK quando aplicável, dados sintéticos usados, comando ou procedimento, resultado, evidência e limitações. `não executado` não pode aparecer como `passou`. Revisão própria por IA não é aprovação humana independente. A matriz especifica testes; somente [VALIDATION.md](VALIDATION.md) registra verificações feitas nesta entrega.

## Checklist antes de incorporação estrutural

- [ ] Baseline do checkout de destino reconciliada; Freeze v1 preservado.
- [ ] ADR/CR com IDs atribuídos e status correto; DP-11a e propostas técnicas separadas.
- [ ] Schemas específicos com owner, `$id`, versão e fixtures; comunicação interna no envelope canônico.
- [ ] Permissions de billing separadas de permissions abstratas de agentes; atores e serviços registrados.
- [ ] Cross-validation completa dos deltas e referências relevantes passou; manifest de release emitido pelo processo canônico.
- [ ] Implementação posterior respeita contratos; testes locais e negativos passaram no código efetivo.

## Checklist antes de cobrar

- [ ] Preços de cada plano/moeda/intervalo, tax behavior e políticas de lifecycle aprovados.
- [ ] LLC, conta Stripe US, banco EUA e settlement target verificados; nenhuma elegibilidade presumida.
- [ ] Validação jurídica/contábil e documentação comercial concluídas para a operação pretendida.
- [ ] Textos críticos pt-BR/en-US, termos e amostras Stripe revisados; limitações resolvidas.
- [ ] Casos S aplicáveis executados em conta/versão identificadas, com sandbox autorizado.
- [ ] Monitoramento, reconciliação, incidentes, retenção e responsáveis definidos.
- [ ] Deploy e ativação cobertos por autorização válida; kill switch e recuperação testados.
- [ ] Primeiras operações live verificadas por procedimento autorizado; não declarar lançamento apenas com sandbox verde.

## Verificações futuras disponíveis no repositório

O `package.json` consultado declara `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:e2e`, `pnpm scan:secrets`, `pnpm build` e `pnpm verificar`. As ferramentas `release:reproduce`, `release:build` e `release:gates` têm processo próprio e devem ser lidas antes de uso. Não se propõe comando inexistente de cross-validation. Esta entrega documental não executou esses gates de produto, não iniciou serviços e não usou Stripe.
