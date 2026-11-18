// Composição do Product Agent Runtime na web (I-02, tela de execuções). Arquivo próprio: `deps.ts` é governado.
// A web só LÊ, cancela e aciona/libera a interrupção, sempre como pessoa (RLS e permissão no banco). Nenhum worker roda aqui.
import { auditLog, relogio } from "@oplyra/infra";
import { runRepository, killSwitchRepository, catalogoDeAgentesCongelado } from "../../../../packages/infra/src/runtime-repository.ts";
import type { RuntimeDeps } from "./execucoes";
import { deps } from "./deps";
import { catalogoLazy } from "./catalogo-runtime";

export const runtimeDeps: RuntimeDeps = {
  uow: deps.uow, runs: runRepository, killSwitch: killSwitchRepository,
  agents: { catalog: catalogoLazy(() => catalogoDeAgentesCongelado()) }, audit: auditLog, clock: relogio,
};
