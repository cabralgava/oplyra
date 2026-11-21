// Ponto único de importação do contexto Strategy para a web (I-04). Os `package.json` de core e infra são
// artefatos governados e ainda não têm as entradas `@oplyra/core/strategy` e `@oplyra/infra/strategy`
// (evolução governada pendente). Até lá, o caminho relativo fica ISOLADO aqui: quando as entradas
// existirem, só este arquivo muda.
export * from "../../../../packages/core/src/domain/strategy.ts";
export * from "../../../../packages/core/src/domain/strategy-errors.ts";
export type { StrategyDeps } from "../../../../packages/core/src/application/strategy-ports.ts";
export * from "../../../../packages/core/src/application/use-cases/strategy.ts";
export * from "../../../../packages/core/src/application/use-cases/strategy-objectives.ts";
export * from "../../../../packages/core/src/application/use-cases/strategy-experiments.ts";
export * from "../../../../packages/core/src/application/use-cases/strategy-tasks.ts";
export * from "../../../../packages/core/src/domain/task-dependencies.ts";
export * from "../../../../packages/core/src/domain/task-due-dates.ts";
export * from "../../../../packages/core/src/domain/task-due-summary.ts";
export * from "../../../../packages/core/src/domain/task-due-filter.ts";
