import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { EstrategiaResumo as Componente } from "../apps/web/src/components/estrategia-resumo";

// React pertence ao workspace web; o teste não acrescenta dependências à raiz.
const requireWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createElement } = requireWeb("react");
const { renderToStaticMarkup } = requireWeb("react-dom/server");
// A configuração web preserva JSX para Next. Compilamos o componente sem mudar essa configuração.
const source = readFileSync(new URL("../apps/web/src/components/estrategia-resumo.tsx", import.meta.url), "utf8");
const { transform, loadBindings } = requireWeb("next/dist/build/swc");
await loadBindings();
const compiled = await transform(source, { filename: "estrategia-resumo.tsx", jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "classic" } } }, module: { type: "commonjs" } });
const componentExports: { EstrategiaResumo?: typeof Componente } = {};
new Function("require", "exports", compiled.code)(requireWeb, componentExports);
const EstrategiaResumo = componentExports.EstrategiaResumo!;

const objetivo = {
  name: "Qualificar demanda", status: "active", primary: true,
  periodStart: "2026-11-01", periodEnd: "2026-12-31",
  kpis: [{ key: "reunioes", name: "Reuniões", target: 30, unit: "reuniões" }],
};
const render = (objetivos: Parameters<typeof EstrategiaResumo>[0]["objetivos"], campanhas: Parameters<typeof EstrategiaResumo>[0]["campanhas"] = []) =>
  renderToStaticMarkup(createElement(EstrategiaResumo, { objetivos, campanhas }));
const contagem = (html: string, nome: string) => html.match(new RegExp(`<dt>${nome}</dt><dd>(\\d+)</dd>`))?.[1];

describe("Resumo real da Central Estratégica", () => {
  it("estado vazio oferece orientação e não inventa progresso", () => {
    const html = render([]);
    expect(html).toContain("Nenhum objetivo principal definido");
    expect(html).toContain("Progresso e projeção ainda não estão disponíveis.");
    for (const nome of ["Objetivos ativos", "Campanhas ativas", "Campanhas planejadas"]) expect(contagem(html, nome)).toBe("0");
    expect(html).not.toContain("<progress");
    expect(html).not.toContain("Alvo:");
  });

  it("seleciona somente principal ativo e distingue alvo de resultado", () => {
    const html = render([{ ...objetivo, name: "Principal antigo", status: "archived" }, objetivo]);
    expect(html).toContain('<h2 id="meta-principal">Qualificar demanda</h2>');
    expect(html).not.toContain("Principal antigo");
    expect(html).toContain("Alvo: 30 reuniões");
    expect(html).toContain("2026-11-01 a 2026-12-31");
    expect(html).toContain("Alvos definidos no objetivo.");
    expect(html).not.toContain("<progress");
    expect(contagem(html, "Objetivos ativos")).toBe("1");
  });

  it("conta estados da operação sem incluir campanhas pausadas, concluídas ou canceladas", () => {
    const html = render([objetivo, { ...objetivo, primary: false }, { ...objetivo, status: "archived" }],
      ["active", "draft", "paused", "completed", "cancelled", "draft"].map((status) => ({ status })));
    expect(contagem(html, "Objetivos ativos")).toBe("2");
    expect(contagem(html, "Campanhas ativas")).toBe("1");
    expect(contagem(html, "Campanhas planejadas")).toBe("2");
  });

  it("objetivo ativo não principal não aparece como meta primária", () => {
    expect(render([{ ...objetivo, primary: false }])).toContain("Nenhum objetivo principal definido");
  });

  it("conteúdo persistido é texto, sem interpretar HTML", () => {
    const html = render([{ ...objetivo, name: '<img src=x onerror="alert(1)">', kpis: [{ key: "a", name: "<script>ataque</script>", target: 2.5, unit: "<b>un</b>" }] }]);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Alvo: 2.5 &lt;b&gt;un&lt;/b&gt;");
  });
});
