# Revisão arquitetural DDD

## 1. Diagnóstico geral

## 2. O que o modelo atual comunica

## 3. Linguagem ubíqua encontrada

## 4. Termos ambíguos ou inconsistentes

## 5. Regras de negócio espalhadas

## 6. Entidades candidatas

## 7. Objetos de Valor candidatos

## 8. Agregados candidatos

## 9. Services inchados ou anêmicos

## 10. Repositórios com vazamento de infraestrutura

## 11. Acoplamentos perigosos

## 12. Integrações que exigem camada anticorrupção

## 13. Bounded contexts sugeridos

## 14. Refatoração incremental

### Fase 1 — Baixo risco

### Fase 2 — Organização do domínio

### Fase 3 — Proteção de invariantes

### Fase 4 — Integrações e anticorrupção

## 15. Checklist de validação
- [ ] O código usa termos do domínio
- [ ] As regras centrais estão fora da UI
- [ ] As regras centrais estão fora da infraestrutura
- [ ] Agregados protegem invariantes
- [ ] Integrações externas não contaminam o domínio
- [ ] Testes cobrem regras críticas
