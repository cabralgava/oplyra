// Porta de catálogo do runtime na web, com carga LAZY e falha tipada. Os registries congelados (docs/product/**) são
// lidos do disco por `catalogoDeAgentesCongelado`, e o bundle serverless (Netlify) pode não incluí-los. A web só lista,
// lê e cancela execuções e aciona a interrupção: nenhum desses caminhos consulta o catálogo (só submissão e worker).
// Se um dia algum caminho consultar, a falha é um erro de domínio claro, nunca um ENOENT cru, e nada é inventado.
import type { AgentCatalog } from "../../../../packages/core/src/runtime/domain.ts";

export class CatalogoIndisponivel extends Error {
  readonly code = "CATALOGO_INDISPONIVEL";
  constructor(causa?: unknown) {
    super("O catálogo de agentes não está disponível neste ambiente.", { cause: causa });
    this.name = "CatalogoIndisponivel";
  }
}

/** Nada é lido na criação; a primeira consulta carrega (e guarda) o catálogo, ou lança `CatalogoIndisponivel`. */
export function catalogoLazy(carregar: () => AgentCatalog): () => AgentCatalog {
  let guardado: AgentCatalog | undefined;
  return () => {
    if (guardado) return guardado;
    try { guardado = carregar(); } catch (e) { throw new CatalogoIndisponivel(e); }
    return guardado;
  };
}
