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
const saveTaskDetails = vi.fn();
const revalidatePath = vi.fn();
const redirect = vi.fn((url: string): never => { throw new Error(`redirect:${url}`); });
const dependencies = {};
const root = "../apps/web/src/app/e/[tenantId]/operacao/";
const source = readFileSync(new URL(`${root}page.tsx`, import.meta.url), "utf8");
const compiled = await transform(source, { filename: "operacao.tsx", jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "classic" } } }, module: { type: "commonjs" } });
const modules: Record<string, unknown> = {
  "next/navigation": { redirect }, "next/cache": { revalidatePath },
  "../../../../lib/session": { contextoDaEmpresa }, "../../../../lib/deps-estrategia": { strategyDeps: dependencies },
  "../../../../lib/estrategia": { filterTasksByDueDate: (await import("../apps/web/src/lib/estrategia")).filterTasksByDueDate, summarizeOpenTaskDueDates: (await import("../apps/web/src/lib/estrategia")).summarizeOpenTaskDueDates, isValidCivilDate: (await import("../apps/web/src/lib/estrategia")).isValidCivilDate, classifyTaskDueDate: (await import("../apps/web/src/lib/estrategia")).classifyTaskDueDate, sortTasksByDueDate: (await import("../apps/web/src/lib/estrategia")).sortTasksByDueDate, summarizeTaskDependencies: (await import("../apps/web/src/lib/estrategia")).summarizeTaskDependencies, getOperationTasks, listTasks, listCampaigns, createTask, changeTaskStatus, saveTaskDetails },
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

const filtro = await import("../apps/web/src/lib/operacao-filtro");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const campaignFilter = { kind: "campaign", campaignId: A };
const pathname = "/e/empresa-a/operacao";
const selected = task("in_progress", { campaignId: A, dependsOn: [B], assignee: { kind: "user", userId: "pessoa" } });
const reference = task("todo", { id: B, title: "Dependência de outra campanha", campaignId: B });
const campaigns = [{ id: A, name: "Campanha A" }, { id: B, name: "Campanha B" }];
const read = (tasks = [selected]) => ({ tasks, references: [selected, reference], campaigns });
const editor = (tree: any) => nodes(tree).find(n => n.type?.name === "EditorDaTarefa");
function editInput() { const d = new FormData(); d.set("editar_tarefa", selected.id); d.set("editar_revisao", "3"); d.set("editar_title", "Editada"); d.set("editar_campaignId", A); d.append("editar_dep", B); return d; }

describe("Filtro oficial de tarefas por campanha", () => {
  it("aceita somente formas canônicas, normaliza UUID e recusa query duplicada ou vazia", () => {
    expect(filtro.lerFiltroOperacao(undefined)).toEqual({ kind: "all" });
    expect(filtro.lerFiltroOperacao("todas")).toEqual({ kind: "all" });
    expect(filtro.lerFiltroOperacao("avulsas")).toEqual({ kind: "unlinked" });
    expect(filtro.lerFiltroOperacao(A.toUpperCase())).toEqual(campaignFilter);
    for (const value of ["", " ", "all", "null", "../", [A], [A, B], null, 1]) expect(() => filtro.lerFiltroOperacao(value)).toThrow();
  });
  it("parser de prazo só aceita tokens portugueses canônicos, nunca arrays ou fallback", () => {
    expect(filtro.lerFiltroPrazo(undefined)).toBe("all");
    for (const [value, kind] of [["todas","all"],["atrasadas","overdue"],["hoje","today"],["futuros","upcoming"],["sem-prazo","undated"],["indisponiveis","unclassified"]]) {
      expect(filtro.lerFiltroPrazo(value)).toBe(kind);
      expect(filtro.valorFiltroPrazo(kind as any)).toBe(value);
    }
    for (const value of ["", " ", "all", "overdue", "Hoje", "__proto__", ["hoje"], ["hoje","futuros"], null, 1]) expect(() => filtro.lerFiltroPrazo(value)).toThrow();
  });
  it("compõe os dois filtros com erro/hash e remove filtros antigos duplicados", () => {
    expect(filtro.manterFiltroOperacao(`${pathname}?campanha=${B}&campanha=${B}&prazo=todas&prazo=hoje&erro=ERRO#tarefa-x`, campaignFilter as any, "upcoming")).toBe(`${pathname}?campanha=${A}&prazo=futuros&erro=ERRO#tarefa-x`);
    expect(filtro.manterFiltroOperacao(`${pathname}?prazo=hoje&campanha=${A}&ok=salva`, {kind:"all"}, "all")).toBe(`${pathname}?ok=salva`);
    expect(filtro.manterFiltroOperacao(pathname, {kind:"all"}, "undated")).toBe(`${pathname}?prazo=sem-prazo`);
  });
  it("preserva query e fragmentos nos destinos sem adicionar filtro à vista geral", () => {
    expect(filtro.manterFiltroOperacao(`${pathname}?erro=CONFLICT_VERSION&editar=x#editar-x`, campaignFilter as any)).toBe(`${pathname}?campanha=${A}&erro=CONFLICT_VERSION&editar=x#editar-x`);
    expect(filtro.manterFiltroOperacao(pathname, { kind: "unlinked" })).toBe(`${pathname}?campanha=avulsas`);
    expect(filtro.manterFiltroOperacao(pathname, { kind: "all" })).toBe(pathname);
  });
  it("não consulta portas antes da permissão de leitura", async () => {
    contextoDaEmpresa.mockResolvedValue({ permissions: new Set() });
    await page({ campanha: A }); expect(getOperationTasks).not.toHaveBeenCalled();
  });
  it("query malformada não consulta nem exibe quadro, criação ou vazio falso", async () => {
    for (const value of ["", "ruim", [A, B]]) {
      const html = renderToStaticMarkup(await page({ campanha: value }));
      expect(html).toContain('role="alert"'); expect(html).toContain("Limpar filtro");
      expect(html).not.toContain("Nenhuma tarefa"); expect(html).not.toContain("Criar tarefa"); expect(html).not.toContain("A fazer");
    }
    expect(getOperationTasks).not.toHaveBeenCalled();
  });
  it("campanha alheia ou ausente tem a mesma recusa sem nomes e sem fallback", async () => {
    getOperationTasks.mockRejectedValue(Object.assign(new Error("nome privado"), { code: "CAMPAIGN_NOT_FOUND" }));
    const html = renderToStaticMarkup(await page({ campanha: A }));
    expect(html).toContain("Filtro de campanha inválido ou indisponível"); expect(html).not.toContain("nome privado"); expect(html).not.toContain("Nenhuma tarefa");
    expect(getOperationTasks).toHaveBeenCalledWith(dependencies, owner, campaignFilter);
  });
  it("erro inesperado não vira filtro inválido nem uma lista vazia", async () => {
    getOperationTasks.mockRejectedValue(new Error("indisponível"));
    await expect(page({ campanha: A })).rejects.toThrow("indisponível");
  });
  it("separa cartões filtrados de referências de edição e dependências", async () => {
    getOperationTasks.mockResolvedValue(read()); const tree = await page({ campanha: A });
    expect(nodes(tree).filter(n => n.type === "li").map(n => n.props.id)).toEqual([`tarefa-${selected.id}`]);
    expect(renderToStaticMarkup(tree)).toContain("Depende de: Dependência de outra campanha");
    const e = editor(tree); expect(e.props.tarefas).toEqual([selected, reference]);
    const expanded = e.type(e.props);
    expect(nodes(expanded).find(n => n.props?.name === "editar_dep").props.defaultChecked).toBe(true);
    expect(nodes(expanded).find(n => n.props?.name === "editar_revisao").props.value).toBe(3);
    const anchor = nodes(tree).find(n => n.type?.name === "TarefaDestino"); expect(anchor.props.taskIds).toEqual([selected.id]);
    expect(nodes(tree).find(n => n.props?.id === "filtro-campanha").props.defaultValue).toBe(A);
  });
  it("avulsas e campanha vazias têm estados honestos e acesso de leitura mantém só GET", async () => {
    contextoDaEmpresa.mockResolvedValue({ ...owner, permissions: new Set(["strategy.read"]) });
    for (const [value, text] of [["avulsas", "Nenhuma tarefa avulsa."], [A, "Nenhuma tarefa vinculada a esta campanha."]]) {
      const tree = await page({ campanha: value }); const html = renderToStaticMarkup(tree);
      expect(html).toContain(text); expect(forms(tree)).toHaveLength(1); expect(forms(tree)[0].props.method).toBe("get"); expect(html).not.toContain("Criar tarefa");
    }
  });
  it("criação refaz leitura autorizada e mantém filtro só na navegação, sem presumir vínculo", async () => {
    getOperationTasks.mockResolvedValue(read()); const tree = await page({ campanha: "avulsas" });
    const d = new FormData(); d.set("title", "Avulsa");
    await expect(mutationForm(tree, "Criar tarefa").props.action(d)).rejects.toThrow(`${pathname}?campanha=avulsas&ok=criada`);
    expect(getOperationTasks).toHaveBeenLastCalledWith(dependencies, owner, { kind: "unlinked" });
    expect(createTask.mock.calls[0][1].content.campaignId).toBeNull(); expect(revalidatePath).toHaveBeenCalledWith(pathname);
  });
  it("estado mantém filtro e revisão após revalidação viva", async () => {
    getOperationTasks.mockResolvedValue(read()); const tree = await page({ campanha: A }); const d = new FormData(); d.set("tarefa", selected.id); d.set("revisao", "3");
    await expect(mutationForm(tree, "Concluir").props.action(d)).rejects.toThrow(`${pathname}?campanha=${A}&ok=estado`);
    expect(changeTaskStatus.mock.calls[0][1]).toMatchObject({ expectedRevision: 3, to: "done" });
    expect(getOperationTasks).toHaveBeenCalledTimes(2);
  });
  it("salvar preserva filtro, dependência fora do filtro e só envia detalhes", async () => {
    getOperationTasks.mockResolvedValue(read()); const tree = await page({ campanha: A }); const e = editor(tree);
    const form = nodes(e.type(e.props)).find(n => n.type === "form");
    await expect(form.props.action(editInput())).rejects.toThrow(`${pathname}?campanha=${A}&ok=salva#tarefa-${selected.id}`);
    expect(saveTaskDetails.mock.calls[0][1].content).toMatchObject({ dependsOn: [B], campaignId: A });
    expect(saveTaskDetails.mock.calls[0][1].content).not.toHaveProperty("assignee"); expect(saveTaskDetails.mock.calls[0][1].content).not.toHaveProperty("status");
    expect(nodes(e.type(e.props)).find(n => n.type === "a").props.href).toBe(`${pathname}?campanha=${A}#tarefa-${selected.id}`);
  });
  it("criação sugere somente a campanha validada e erros de edição mantêm filtro/editor", async () => {
    getOperationTasks.mockResolvedValue(read());
    const tree = await page({ campanha: A });
    expect(nodes(tree).find(n => n.props?.name === "campaignId").props.defaultValue).toBe(A);
    const e = editor(tree), form = nodes(e.type(e.props)).find(n => n.type === "form");
    saveTaskDetails.mockRejectedValueOnce({ code: "CONFLICT_VERSION", message: "interno" });
    await expect(form.props.action(editInput())).rejects.toThrow(`campanha=${A}&erro=CONFLICT_VERSION&editar=${selected.id}#editar-${selected.id}`);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect.mock.calls[0][0]).not.toContain("interno");
    const all = await page(); expect(nodes(all).find(n => n.props?.name === "campaignId").props.defaultValue).toBe("");
  });
  it("revogação do filtro após render impede as três mutações e preserva o filtro no erro", async () => {
    getOperationTasks.mockResolvedValue(read()); const tree = await page({ campanha: A });
    getOperationTasks.mockRejectedValue(Object.assign(new Error("removida"), { code: "CAMPAIGN_NOT_FOUND" }));
    const e = editor(tree), d = new FormData(); d.set("tarefa", selected.id); d.set("revisao", "3");
    await expect(mutationForm(tree, "Concluir").props.action(d)).rejects.toThrow(`campanha=${A}&erro=CAMPAIGN_NOT_FOUND`);
    await expect(mutationForm(tree, "Criar tarefa").props.action(new FormData())).rejects.toThrow(`campanha=${A}&erro=CAMPAIGN_NOT_FOUND`);
    await expect(nodes(e.type(e.props)).find(n => n.type === "form").props.action(editInput())).rejects.toThrow(`campanha=${A}&erro=CAMPAIGN_NOT_FOUND&editar=${selected.id}`);
    expect(createTask).not.toHaveBeenCalled(); expect(changeTaskStatus).not.toHaveBeenCalled(); expect(saveTaskDetails).not.toHaveBeenCalled(); expect(revalidatePath).not.toHaveBeenCalled();
  });
});
