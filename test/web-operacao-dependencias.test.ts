import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Executa o componente de servidor sem banco; os testes E2E exercitam a integração real.
const requireWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const React = requireWeb("react");
const { renderToStaticMarkup } = requireWeb("react-dom/server");
const { transform, loadBindings } = requireWeb("next/dist/build/swc");
await loadBindings();
const { lerTarefa, lerId, lerRevisao, ROTULO_TAREFA, destinoDeErro, FormularioInvalido, lerEdicaoDaTarefa } = await import("../apps/web/src/lib/estrategia-form");
const contextoDaEmpresa = vi.fn();
const listTasks = vi.fn();
const getOperationTasks = vi.fn();
const listCampaigns = vi.fn();
const createTask = vi.fn();
const changeTaskStatus = vi.fn();
const revalidatePath = vi.fn();
const redirect = vi.fn((url: string): never => { throw new Error(`redirect:${url}`); });
const dependencies = {};
const root = "../apps/web/src/app/e/[tenantId]/operacao/";
const source = readFileSync(new URL(`${root}page.tsx`, import.meta.url), "utf8");
const compiled = await transform(source, { filename: "operacao.tsx", jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "classic" } } }, module: { type: "commonjs" } });
const modules: Record<string, unknown> = {
  "next/navigation": { redirect }, "next/cache": { revalidatePath },
  "../../../../lib/session": { contextoDaEmpresa }, "../../../../lib/deps-estrategia": { strategyDeps: dependencies },
  "../../../../lib/estrategia": { filterTasksByDueDate: (await import("../apps/web/src/lib/estrategia")).filterTasksByDueDate, summarizeOpenTaskDueDates: (await import("../apps/web/src/lib/estrategia")).summarizeOpenTaskDueDates, isValidCivilDate: (await import("../apps/web/src/lib/estrategia")).isValidCivilDate, classifyTaskDueDate: (await import("../apps/web/src/lib/estrategia")).classifyTaskDueDate, sortTasksByDueDate: (await import("../apps/web/src/lib/estrategia")).sortTasksByDueDate, summarizeTaskDependencies: (await import("../apps/web/src/lib/estrategia")).summarizeTaskDependencies, getOperationTasks, listTasks, listCampaigns, createTask, changeTaskStatus },
  "../../../../lib/estrategia-form": { lerTarefa, lerId, lerRevisao, ROTULO_TAREFA, destinoDeErro, FormularioInvalido, lerEdicaoDaTarefa },
  "../../../../lib/operacao-prazos": { hojeDaOperacao: async () => "2026-11-20" },
  // Adapter de navegação é testado com UUIDs reais na suíte própria; estas fixtures legadas usam empresa-a.
  "../../../../lib/operacao-tarefa-navegacao": { linkDetalheDaTarefa: (tenant: string, task: string) => `/e/${encodeURIComponent(tenant)}/operacao/tarefas/${encodeURIComponent(task)}` },
  "../../../../lib/operacao-navegacao": { ...await import("../apps/web/src/lib/operacao-navegacao"), linkCampanhaDaOperacao: (tenant: string, campaign: string) => `/e/${encodeURIComponent(tenant)}/estrategia/campanhas/${encodeURIComponent(campaign)}` },
  "../../../../lib/operacao-filtro": await import("../apps/web/src/lib/operacao-filtro"),
  "../../../../components/tarefa-destino": { TarefaDestino: () => null },
  "../../../../components/botao-enviar": { BotaoEnviar: ({ children }: { children: unknown }) => React.createElement("button", { type: "submit" }, children) },
  "../../../../components/aviso-estrategia": {
    AvisoDeErro: () => null,
    AvisoSemPermissao: () => React.createElement("p", null, "Sem permissão"),
  },
  "./operacao.module.css": { default: {} },
};
const exports: { default?: (props: unknown) => Promise<any> } = {};
new Function("require", "exports", "React", compiled.code)((name: string) => {
  if (!(name in modules)) throw new Error(`Import não previsto: ${name}`);
  return modules[name];
}, exports, React);
const page = (search = {}) => exports.default!({ params: Promise.resolve({ tenantId: "empresa-a" }), searchParams: Promise.resolve(search) });
const owner = { permissions: new Set(["strategy.read", "strategy.write"]), tenantId: "empresa-a" };
const task = (status = "todo", extra = {}) => ({ tenantId: "empresa-a", id: "11111111-1111-4111-8111-111111111111", title: "Tarefa real", description: "Descrição persistida", status, campaignId: null, dueDate: null, dependsOn: [], revision: 3, ...extra });
function nodes(element: any): any[] {
  if (element === null || element === undefined || typeof element !== "object") return [];
  if (Array.isArray(element)) return element.flatMap(nodes);
  return [element, ...nodes(element.props?.children)];
}
const forms = (tree: any) => nodes(tree).filter((node) => node.type === "form");
const textOf = (element: any): string => {
  if (Array.isArray(element)) return element.map(textOf).join("");
  if (typeof element === "string" || typeof element === "number") return String(element);
  return element?.props ? textOf(element.props.children) : "";
};
const mutationForm = (tree: any, label: string) => forms(tree).find((form) => textOf(form).includes(label));
beforeEach(() => {
  vi.clearAllMocks();
  contextoDaEmpresa.mockResolvedValue(owner);
  listTasks.mockResolvedValue([]);
  listCampaigns.mockResolvedValue([]);
  getOperationTasks.mockResolvedValue({ tasks: [], references: [], campaigns: [] });
});

const OTHER = "22222222-2222-4222-8222-222222222222", THIRD = "33333333-3333-4333-8333-333333333333";
const dependency = (status = "todo", extra = {}) => task(status, { id: OTHER, title: "Preparar briefing", ...extra });
const note = (tree: any) => nodes(tree).find(n => n.props?.role === "note" && n.props?.["aria-label"] === "Situação das dependências");
function read(tasks: any[], references = tasks) { getOperationTasks.mockResolvedValue({ tasks, references, campaigns: [] }); }
function card(tree: any) { return nodes(tree).find(n => n.type === "li" && n.props.id === `tarefa-${task().id}`); }

describe("Operação oficial — sinalização de dependências", () => {
  it("sem dependências não inventa alerta, novo estado ou resumo", async () => {
    read([task()]); const tree = await page();
    expect(note(tree)).toBeUndefined(); expect(renderToStaticMarkup(tree)).not.toContain("Depende de:");
    expect(textOf(card(tree))).toContain("A fazer");
  });
  it("pendentes mantêm nome/estado próprios e sinalização separada do estado da tarefa", async () => {
    for (const state of ["todo", "in_progress"]) {
      read([task(state, { dependsOn: [OTHER, THIRD] })], [dependency(), dependency("in_progress", { id: THIRD, title: "Revisar oferta" })]);
      const tree = await page(); const html = renderToStaticMarkup(tree);
      expect(textOf(note(tree))).toContain("Dependências sem conclusão");
      expect(textOf(note(tree))).toContain("Pendentes: 2"); expect(textOf(note(tree))).toContain("não impede alterar o estado");
      expect(html).toContain("Preparar briefing — A fazer"); expect(html).toContain("Revisar oferta — Em andamento");
      expect(nodes(card(tree)).filter(n => n.props?.className?.startsWith?.("selo"))).toHaveLength(1);
    }
  });
  it("todas concluídas retiram atenção sem apagar a informação das dependências", async () => {
    read([task("todo", { dependsOn: [OTHER] })], [dependency("done")]);
    const tree = await page(); expect(textOf(note(tree))).toContain("Dependências concluídas");
    expect(textOf(note(tree))).toContain("Concluídas: 1"); expect(textOf(note(tree))).not.toContain("sem conclusão");
    expect(renderToStaticMarkup(tree)).toContain("Preparar briefing — Concluída");
  });
  it("cancelada é distinguida de concluída e continua pedindo atenção em tarefa aberta", async () => {
    read([task("todo", { dependsOn: [OTHER] })], [dependency("cancelled")]);
    const tree = await page(); expect(textOf(note(tree))).toContain("Dependências sem conclusão");
    expect(textOf(note(tree))).toContain("Canceladas: 1"); expect(textOf(note(tree))).toContain("Concluídas: 0");
    expect(renderToStaticMarkup(tree)).toContain("Preparar briefing — Cancelada");
  });
  it("dependência ausente ou foreign só aparece indisponível, sem título, ID ou estado alheio", async () => {
    contextoDaEmpresa.mockResolvedValue({ ...owner, permissions: new Set(["strategy.read"]) });
    read([task("todo", { dependsOn: [OTHER, THIRD] })], [dependency("done", { tenantId: "empresa-b", title: "Segredo da outra empresa" })]);
    const tree = await page(); const html = renderToStaticMarkup(tree);
    expect(html).toContain("Dependência indisponível"); expect(textOf(note(tree))).toContain("Indisponíveis: 2");
    expect(textOf(note(tree))).toContain("Concluídas: 0"); expect(html).not.toContain("Segredo da outra empresa");
    expect(html).not.toContain(OTHER); expect(html).not.toContain(THIRD);
  });
  it("concluída e cancelada mantêm informação histórica sem sinal de bloqueio ativo", async () => {
    for (const state of ["done", "cancelled"]) {
      read([task(state, { dependsOn: [OTHER] })], [dependency()]); const tree = await page();
      expect(textOf(note(tree))).toContain("Dependências registradas");
      expect(textOf(note(tree))).toContain("Pendentes: 1"); expect(textOf(note(tree))).not.toContain("Dependências sem conclusão");
      expect(textOf(note(tree))).not.toContain("não impede");
    }
  });
  it("usa referências completas fora da campanha filtrada sem trazer seus cartões", async () => {
    read([task("todo", { dependsOn: [OTHER], campaignId: THIRD })], [dependency("in_progress", { campaignId: OTHER })]);
    const tree = await page({ campanha: THIRD });
    expect(nodes(tree).filter(n => n.type === "li").map(n => n.props.id)).toEqual([`tarefa-${task().id}`]);
    expect(renderToStaticMarkup(tree)).toContain("Depende de: Preparar briefing — Em andamento");
    expect(textOf(note(tree))).toContain("Pendentes: 1");
  });
  it("Leitor recebe o sinal real e apenas GET, sem qualquer controle de mutação", async () => {
    contextoDaEmpresa.mockResolvedValue({ ...owner, permissions: new Set(["strategy.read"]) });
    read([task("todo", { dependsOn: [OTHER] })], [dependency()]); const tree = await page();
    expect(textOf(note(tree))).toContain("Dependências sem conclusão");
    expect(forms(tree)).toHaveLength(1); expect(forms(tree)[0].props.method).toBe("get");
    expect(nodes(tree).some(n => n.type?.name === "EditorDaTarefa")).toBe(false);
  });
  it("sinalização não desabilita nem intercepta a transição já permitida", async () => {
    read([task("todo", { dependsOn: [OTHER] })], [dependency()]); const tree = await page();
    const start = mutationForm(tree, "Iniciar"); expect(start).toBeDefined();
    expect(nodes(start).some(n => n.props?.disabled)).toBe(false);
    const data = new FormData(); data.set("tarefa", task().id); data.set("revisao", "3");
    await expect(start.props.action(data)).rejects.toThrow("?ok=estado");
    expect(changeTaskStatus).toHaveBeenCalledWith(dependencies, { ctx: owner, taskId: task().id, expectedRevision: 3, to: "in_progress" });
  });
  it("nomes e estados derivados são escapados sem adicionar conteúdo do responsável", async () => {
    read([task("todo", { dependsOn: [OTHER] })], [dependency("todo", { title: "<img onerror=segredo>", assignee: { kind: "user", userId: "dono-interno" } })]);
    contextoDaEmpresa.mockResolvedValue({ ...owner, permissions: new Set(["strategy.read"]) });
    const html = renderToStaticMarkup(await page());
    expect(html).toContain("&lt;img onerror=segredo&gt;"); expect(html).not.toContain("<img onerror"); expect(html).not.toContain("dono-interno");
  });
});
