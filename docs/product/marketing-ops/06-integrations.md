# Oplyra — Integrations

**Versão documental:** 0.2  
**Data:** 11 de setembro de 2026  
**Autoridade:** detalhamento do 00 v2.2, com decisões posteriores e regra de ancoragem em [ATUALIZACOES](ATUALIZACOES.md). Citar `DEC-0xx` apenas quando o identificador existir na v2.2. Propostas técnicas permanecem propostas.

## 1. Princípio

Toda integração externa deverá passar por interface/adapter. Nenhum SDK de fornecedor pode definir o domínio interno.

## 2. Integrações aprovadas/prioritárias

### Fundação/MVP Performance

1. autenticação — Supabase Auth (ADR-0001);
2. **Stripe Billing + Stripe Payments**;
3. Meta Ads;
4. Google Ads;
5. API/webhooks de entrada de conversões comerciais;
6. provedores de IA;
7. Supabase Storage;
8. scheduler/filas.

### Growth

1. provedor de e-mail — pendente;
2. redes sociais suportadas — pendente;
3. n8n;
4. primeiro conector comercial dedicado — pendente;
5. WhatsApp oficial em fase posterior, com consentimento.

## 3. Stripe

Responsabilidades do adapter:

- clientes de billing;
- assinaturas;
- planos/preços externos;
- pagamentos;
- webhooks;
- status de cobrança;
- invoices;
- cancelamento/renovação;
- conciliação com subscription interna.

Regras:

- Stripe é infraestrutura, não domínio;
- IDs da Stripe devem ser external IDs;
- webhooks precisam de assinatura/verificação e idempotência;
- taxas da Stripe entram no cálculo de preço/margem, fora dos budgets operacionais de US$ 40/85.

## 4. Meta Ads e Google Ads

MVP inicialmente em modo leitura:

- contas;
- campanhas;
- anúncios;
- orçamento;
- métricas;
- snapshots;
- alertas/recomendações.

Ações de alteração de orçamento ou publicação devem permanecer sob governança e aprovação explícita conforme nível de autonomia.

## 5. Dados comerciais externos

Contrato de entrada deve permitir:

- contatos;
- leads;
- origem;
- etapa;
- reuniões;
- propostas;
- contratos;
- receita;
- perdas;
- feedback de qualidade.

Métodos:

- API;
- webhooks;
- imports controlados;
- conectores dedicados futuros.

## 6. E-mail — Growth

Provedor ainda pendente. O adapter deve suportar, conforme capacidade do fornecedor:

- envio;
- templates;
- eventos;
- bounce/complaint;
- unsubscribe/suppression;
- métricas;
- domínios/remetentes;
- webhooks.

O plano Growth inicia com franquia de **25.000 e-mails/mês**.

## 7. Social — Growth

Integrações sociais do MVP ainda pendentes. A arquitetura deve permitir:

- agendamento/publicação onde API permitir;
- métricas;
- status/falhas;
- fallback manual quando limitações de API impedirem execução.

## 8. IA

Provedores iniciais candidatos/aprovados para arquitetura:

- OpenAI;
- Anthropic.

Nenhum agente deve depender permanentemente de um modelo específico.

## 9. Imagens

Geração e edição de imagens deverão ser abstraídas por provider interface própria e contabilizadas por ação/custo. O fornecedor específico poderá variar por qualidade, custo e disponibilidade.

Vídeo não é gerado, editado nem renderizado. A análise de vídeos enviados pelo cliente é suportada por provider interface própria, com transcrição, resumo e derivados textuais contabilizados por ativo ou por volume processado. Provedor, formatos, tamanho máximo e retenção dos derivados continuam pendentes.

## 10. Segurança de integrações

- credenciais criptografadas;
- secrets fora do frontend;
- menor privilégio;
- rotation/revogação quando aplicável;
- webhooks verificados;
- idempotência;
- rate limiting;
- auditoria;
- isolamento por tenant.

## 11. Detalhamento de integração para os incrementos

### 11.1 Rastreamento e confiança

Proposta: chave de campanha única por tenant e imutável após ativação; usar como utm_campaign, com utm_source, utm_medium e utm_content definidos por canal/versão. Não incluir PII em UTMs. Normalização preserva valor original e versão da regra.

Métricas de fornecedor são snapshots datados, com janela de reprocessamento configurada por adapter. Conversão reportada por plataforma não equivale a receita confirmada. Indicador derivado herda a confiança mais restritiva das fontes e informa dados ausentes; métricas não recebidas aparecem como indisponíveis, não como zero.

### 11.2 Acessos Meta/Google (DP-19)

Preparação documental: contratos, fixtures e cenários sem chamadas reais. Antes de conectar contas: definir entidade titular, responsáveis, escopos mínimos e credenciais de teste; confirmar requisitos atuais de verificação/revisão de app nas plataformas. Criar apps, solicitar acesso ou conectar contas são ações externas separadas; esta documentação não comprova acesso concedido.

### 11.3 E-mail transacional e marketing

SMTP de Auth, convites e avisos da Fundação são transacionais, com provedor ainda pendente em DP-08a. Campanhas em massa, segmentação e franquia de envios pertencem ao Growth. Não contabilizar convites como campanha de marketing nem antecipar Growth pela necessidade de Auth.

### 11.4 Entrada de sinais comerciais

Proposta: autenticar fonte e resolver tenant no servidor; ignorar/rejeitar tenantId enviado no corpo. Evento tem sourceId/externalEventId, tipo, instante, versão e chave de rastreamento; idempotência por fonte/evento e conflito de payload explícito. Correções referenciam supersedes sem apagar histórico. Limitar lote/tamanho/rate e responder por item. Política de PII permanece em 07/DP-27; hashes não são prova automática de anonimização.
