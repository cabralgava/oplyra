// CR-031 — T1 (estático): toda semente de `content.event_outbox` nos testes de
// integração informa `available_at` explicitamente. Com o default `now()` (relógio
// real) os testes que usam relógios injetados em setembro de 2026 dependeriam do
// momento da execução. Exceção deliberada e documentada: o teste de regressão
// T2, que semeia sem `available_at` para provar a semântica vigente. Testes que semeiam a
// outbox sem nunca reivindicá-la (relógio real irrelevante) não são afetados.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;
const EXCECOES = new Set(["packages/infra/test/outbox-claim-determinism.integration.test.ts"]);

function testesDeIntegracao(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(join(RAIZ, dir))) {
    if (nome === "node_modules" || nome === "test-results") continue;
    const caminho = `${dir}/${nome}`;
    if (statSync(join(RAIZ, caminho)).isDirectory()) testesDeIntegracao(caminho, saida);
    else if (/\.integration\.test\.ts$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

/** Trechos SQL `insert into content.event_outbox …` (até o fim do template ou da string) sem `available_at`. */
export function insercoesSemAvailableAt(fonte: string): string[] {
  const achados: string[] = [];
  const re = /insert\s+into\s+content\.event_outbox\b/gi;
  for (let m = re.exec(fonte); m; m = re.exec(fonte)) {
    const resto = fonte.slice(m.index);
    const fim = resto.search(/`|"\s*,\s*\[|"\s*\)/);
    const trecho = fim < 0 ? resto : resto.slice(0, fim);
    if (!/available_at/i.test(trecho)) achados.push(trecho.slice(0, 60).replace(/\s+/g, " "));
  }
  return achados;
}

describe("T1 — sementes da outbox com relógio explícito", () => {
  const arquivos = [...testesDeIntegracao("packages"), ...testesDeIntegracao("test")];

  it("há testes de integração com semente da outbox", () => {
    const comSemente = arquivos.filter((f) => /insert\s+into\s+content\.event_outbox/i.test(readFileSync(join(RAIZ, f), "utf8")));
    expect(comSemente).toEqual(expect.arrayContaining([
      "packages/infra/test/design-agent-copy-draft-consumer.integration.test.ts",
      "packages/infra/test/outbox-dispatcher-cycle.integration.test.ts",
      "packages/infra/test/outbox-claim-determinism.integration.test.ts",
    ]));
  });

  it("nenhum teste de integração semeia `content.event_outbox` sem `available_at` (exceto o teste T2 documentado)", () => {
    // Só importam os testes que reivindicam eventos com relógio injetado; um teste que semeia a outbox
    // sem nunca reivindicar (por exemplo, exclusão em cascata) não depende do relógio.
    const usaClaim = /createOutboxDispatcherCycle|criarOutboxDispatcherAdapter|requestedAt|claim_outbox_events/;
    const violacoes = arquivos.filter((f) => !EXCECOES.has(f) && usaClaim.test(readFileSync(join(RAIZ, f), "utf8")))
      .flatMap((f) => insercoesSemAvailableAt(readFileSync(join(RAIZ, f), "utf8")).map((t) => `${f}: ${t}`));
    expect(violacoes).toEqual([]);
  });

  it("o detector pega a semente sem `available_at` e aceita a explícita", () => {
    const sem = "await q(`insert into content.event_outbox (tenant_id, payload) values ($1, $2)`, [x]);";
    const com = "await q(`insert into content.event_outbox (tenant_id, payload, available_at) values ($1, $2, '2026-09-21T23:00:00Z'::timestamptz)`, [x]);";
    expect(insercoesSemAvailableAt(sem)).toHaveLength(1);
    expect(insercoesSemAvailableAt(com)).toEqual([]);
    expect(insercoesSemAvailableAt(sem + com + sem)).toHaveLength(2);
  });

  it("a exceção documentada existe e é o teste T2", () => {
    for (const f of EXCECOES) expect(readFileSync(join(RAIZ, f), "utf8")).toContain("T2");
  });
});
