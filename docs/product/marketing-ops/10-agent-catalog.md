# Oplyra — Agent Catalog

**Versão documental:** 0.2  
**Data:** 11 de setembro de 2026  
**Autoridade:** detalhamento do 00 v2.2, com decisões posteriores e regra de ancoragem em [ATUALIZACOES](ATUALIZACOES.md). Citar `DEC-0xx` apenas quando o identificador existir na v2.2. Propostas técnicas permanecem propostas.

## 1. Catálogo inicial

### Orquestrador

**Papel:** diretor da operação.  
**Responsabilidades:** transformar objetivos em planos, decompor trabalho, delegar, controlar dependências, aprovações e bloqueios.  
**Autonomia inicial:** recommend/draft conforme workflow.  
**Observação:** usar lógica determinística sempre que suficiente; escalar modelo somente quando necessário.

### Account e Projetos

**Papel:** Account/Gestor de Projetos.  
**Responsabilidades:** tarefas, responsáveis, prazos, riscos, pendências, status e decisões.

### Mídia Paga

**Papel:** gestor de tráfego.  
**Responsabilidades:** analisar campanhas, alertas, orçamento, públicos, testes, pausas e redistribuições.  
**Autonomia inicial:** recomendação; alterações relevantes exigem aprovação.

### Copywriting

**Papel:** copywriter.  
**Responsabilidades:** anúncios, landing pages, roteiros textuais, e-mails, mensagens, hooks, CTAs e versões, inclusive derivados de vídeos enviados pelo cliente a partir de transcrição e análise.

### Design

**Papel:** direção de criação assistida.  
**Responsabilidades:** conceito, briefing visual, geração de imagens, edição/adaptação de imagens, leitura de ativos enviados para briefing e consistência de marca e formatos.  
**Fora de escopo:** gerar, editar ou renderizar vídeo.

### Estratégia e Qualidade

**Papel:** supervisor independente.  
**Responsabilidades:** alinhamento estratégico, Brand OS, evidências, riscos, critérios de aceite, quality gate e verificação da estrutura de campanha e da hipótese do teste (DEC-017).

### Performance e Inteligência

**Papel:** analista de resultados.  
**Responsabilidades:** funil, metas, anomalias, hipóteses, riscos e oportunidades.

### Relatórios e Check-ins

**Papel:** analista executivo.  
**Responsabilidades:** consolidar resultados, entregas, pendências, decisões e próximos passos.

### Social Media — Growth

**Papel:** especialista orgânico.  
**Responsabilidades:** calendário, adaptação por canal, aprovação, publicação e desempenho.

### E-mail Marketing — Growth

**Papel:** especialista de e-mail.  
**Responsabilidades:** campanhas, segmentação, testes, entregabilidade e conversão.

### Lifecycle — Growth

**Papel:** especialista de jornadas.  
**Responsabilidades:** réguas, nutrição, reativação, gatilhos e automações.

### Revenue Intelligence — Growth

**Papel:** especialista em receita.  
**Responsabilidades:** conectar marketing, pipeline, vendas, receita e atribuição avançada.

## 2. Contrato conceitual

```json
{
  "agentDefinition": {
    "id": "uuid",
    "tenantId": "uuid|null",
    "key": "string",
    "name": "string",
    "version": 1,
    "objective": "string",
    "instructions": "markdown",
    "allowedTools": ["string"],
    "requiredContext": ["string"],
    "inputSchema": "json-schema",
    "outputSchema": "json-schema",
    "autonomyLevel": "recommend|draft|approval_required|policy_execute",
    "qualityGateAgentKey": "string|null",
    "active": true
  }
}
```

## 3. Regras para escolha de modelo

O catálogo de agentes não deve fixar um modelo. Cada workflow associa o agente a uma capacidade e quality threshold. O Router escolhe o modelo elegível mais econômico.

## 4. Métricas por agente

- taxa de sucesso;
- quality score;
- taxa de reprovação;
- retries;
- latência;
- custo médio;
- custo p90/p95;
- custo por ação aprovada;
- necessidade de intervenção humana.
