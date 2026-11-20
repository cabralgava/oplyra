import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const React = requireWeb("react");
const { renderToStaticMarkup } = requireWeb("react-dom/server");
const { transform, loadBindings } = requireWeb("next/dist/build/swc");
await loadBindings();
const strategy = await import("../apps/web/src/lib/estrategia");
const form = await import("../apps/web/src/lib/estrategia-form");
const contextoDaEmpresa = vi.fn();
const getCampaign = vi.fn();
const listCampaignTasks = vi.fn();
const listExperiments = vi.fn();
const listObjectives = vi.fn();
const redirect = vi.fn((url: string): never => { throw new Error(`redirect:${url}`); });
const deps = {};
const source = readFileSync(new URL("../apps/web/src/app/e/[tenantId]/estrategia/campanhas/[campaignId]/page.tsx", import.meta.url), "utf8");
const compiled = await transform(source, { filename: "campanha-tarefas.tsx", jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "classic" } } }, module: { type: "commonjs" } });
const modules: Record<string, unknown> = {
  "next/link": ({ href, children, ...props }: any) => React.createElement("a", { href, ...props }, children),
  "next/navigation": { redirect }, "next/cache": { revalidatePath: vi.fn() },
  "../../../../../../lib/session": { contextoDaEmpresa },
  "../../../../../../lib/deps-estrategia": { strategyDeps: deps },
  "../../../../../../lib/deps-marca": { brandDeps: {} },
  "../../../../../../lib/estrategia": { ...strategy, getCampaign, listCampaignTasks, listExperiments, listObjectives },
  "../../../../../../lib/estrategia-form": form,
  "@oplyra/core/brand": { getBrandOverview: vi.fn() },
  "../../../../../../components/botao-enviar": { BotaoEnviar: ({ children }: any) => React.createElement("button", null, children) },
  "../../../../../../components/aviso-estrategia": { AvisoDeErro: () => null, AvisoSemPermissao: () => React.createElement("p", null, "Sem permissão") },
  "./campanha-detalhe.module.css": { __esModule: true, default: {} },
};
const exports: { default?: (props: unknown) => Promise<any> } = {};
new Function("require", "exports", "React", compiled.code)((name: string) => {
  if (!(name in modules)) throw new Error(`Import não previsto: ${name}`);
  return modules[name];
}, exports, React);

const CAMPAIGN = "22222222-2222-4222-8222-222222222222";
const TASK = "33333333-3333-4333-8333-333333333333";
const ctx = { tenantId: "empresa-a", permissions: new Set(["strategy.read", "strategy.write"]) };
const method = Object.fromEntries(strategy.ELEMENTOS_DO_METODO.map(k => [k, "Método salvo"]));
const campaign = { id: CAMPAIGN, name: "Campanha salva", status: "paused", revision: 6, trackingKey: "campanha-salva", objectiveId: null, productKey: null, method, createdAt: new Date("2026-11-19T12:00:00Z"), activatedAt: null };
const task = (extra = {}) => ({ id: TASK, tenantId: ctx.tenantId, campaignId: CAMPAIGN, title: "Revisar briefing", description: "Trabalho persistido", status: "in_progress", dueDate: "2028-02-29", assignee: { kind: "user", userId: "responsavel-interno" }, createdBy: "criador-interno", dependsOn: ["dependencia-interna"], revision: 9, ...extra });
function nodes(element: any): any[] {
  if (!element || typeof element !== "object") return [];
  if (Array.isArray(element)) return element.flatMap(nodes);
  return [element, ...nodes(element.props?.children)];
}
const page = (campaignId = CAMPAIGN) => exports.default!({ params: Promise.resolve({ tenantId: ctx.tenantId, campaignId }), searchParams: Promise.resolve({}) });
const section = (tree: any) => nodes(tree).find(n => n.type === "section" && n.props["aria-labelledby"] === "tarefas-vinculadas");
const html = (tree: any) => renderToStaticMarkup(section(tree));

beforeEach(() => {
  vi.clearAllMocks();
  contextoDaEmpresa.mockResolvedValue(ctx);
  getCampaign.mockResolvedValue(campaign);
  listCampaignTasks.mockResolvedValue([task()]);
  listExperiments.mockResolvedValue([]);
  listObjectives.mockResolvedValue([]);
});

describe("Tarefas vinculadas no detalhe oficial de campanha", () => {
  it("confere identidade/permissão antes de consultar campanha ou tarefas", async () => {
    contextoDaEmpresa.mockResolvedValue({ ...ctx, permissions: new Set() });
    const tree = await page();
    expect(renderToStaticMarkup(tree)).toContain("Sem permissão");
    expect(getCampaign).not.toHaveBeenCalled();
    expect(listCampaignTasks).not.toHaveBeenCalled();
  });

  it("consulta o caso de uso com contexto resolvido e ID da campanha autorizada", async () => {
    const tree = await page();
    expect(contextoDaEmpresa).toHaveBeenCalledWith(ctx.tenantId);
    expect(listCampaignTasks).toHaveBeenCalledWith(deps, ctx, CAMPAIGN);
    const links = nodes(tree).filter(n => n.type === "a");
    expect(links.some(n => n.props.href === "#tarefas-vinculadas" && n.props.children === "Tarefas")).toBe(true);
  });

  it("vazio é explícito sem tarefas simuladas, progresso ou contagens inventadas", async () => {
    listCampaignTasks.mockResolvedValue([]);
    const result = html(await page());
    expect(result).toContain("Nenhuma tarefa vinculada a esta campanha.");
    expect(result).toContain(`href="/e/empresa-a/operacao"`);
    expect(result).not.toContain("Ver na Operação");
    expect(result).not.toContain("<progress");
    expect(result).not.toContain("<li");
  });

  it("mostra título, estado, data civil e navegação para o cartão próprio", async () => {
    const result = html(await page());
    expect(result).toContain("Revisar briefing");
    expect(result).toContain("Trabalho persistido");
    expect(result).toContain("Em andamento");
    expect(result).toContain('<time dateTime="2028-02-29">29/02/2028</time>');
    expect(result).toContain(`href="/e/empresa-a/operacao#tarefa-${TASK}"`);
    expect(result).toContain("Ver na Operação");
  });

  it("inclui todos os estados reais e data ausente sem converter null em valor fictício", async () => {
    listCampaignTasks.mockResolvedValue(["todo", "in_progress", "done", "cancelled"].map((status, i) => task({ id: `tarefa-${i}`, title: `Tarefa ${i}`, status, dueDate: null })));
    const result = html(await page());
    for (const label of ["A fazer", "Em andamento", "Concluída", "Cancelada"]) expect(result).toContain(label);
    expect((result.match(/Sem prazo definido/g) ?? []).length).toBe(4);
    expect(result).not.toContain("<time");
    expect(result).not.toContain("null");
  });

  it("Leitor recebe somente a leitura e links, sem controles de edição de tarefa", async () => {
    contextoDaEmpresa.mockResolvedValue({ ...ctx, permissions: new Set(["strategy.read"]) });
    const result = html(await page());
    expect(result).toContain("Revisar briefing");
    expect(result).toContain("Ver na Operação");
    expect(result).not.toContain("<form");
    expect(result).not.toContain("<button");
    expect(result).not.toContain("Editar tarefa");
  });

  it("renderiza conteúdo como texto e não serializa responsável, criador ou dependências", async () => {
    listCampaignTasks.mockResolvedValue([task({ title: "<img src=x onerror=ataque()>", description: "<script>conteudo-inseguro</script>" })]);
    const result = html(await page());
    expect(result).toContain("&lt;img");
    expect(result).toContain("&lt;script&gt;conteudo-inseguro&lt;/script&gt;");
    expect(result).not.toContain("<img");
    expect(result).not.toContain("<script");
    for (const value of ["responsavel-interno", "criador-interno", "dependencia-interna"]) expect(result).not.toContain(value);
  });

  it("campanha inexistente/alheia ou ID inválido não consulta tarefas", async () => {
    getCampaign.mockRejectedValue(new strategy.CampaignNotFound());
    await expect(page()).rejects.toThrow("erro=CAMPAIGN_NOT_FOUND");
    expect(listCampaignTasks).not.toHaveBeenCalled();
    getCampaign.mockClear();
    await expect(page("sem-id")).rejects.toThrow("erro=CAMPAIGN_NOT_FOUND");
    expect(getCampaign).not.toHaveBeenCalled();
  });

  it("campanha removida durante a nova leitura mantém a recusa canônica", async () => {
    listCampaignTasks.mockRejectedValue(new strategy.CampaignNotFound());
    await expect(page()).rejects.toThrow("redirect:/e/empresa-a/estrategia?erro=CAMPAIGN_NOT_FOUND");
  });

  it("falha inesperada da leitura propaga sem fingir lista vazia", async () => {
    const failure = new Error("leitura-indisponivel");
    listCampaignTasks.mockRejectedValue(failure);
    await expect(page()).rejects.toBe(failure);
  });
});
