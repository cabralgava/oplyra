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
const getOperationTasks = vi.fn(async () => ({ tasks: await listTasks(), references: await listTasks(), campaigns: await listCampaigns() }));
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
  "../../../../lib/estrategia": { getOperationTasks, listTasks, listCampaigns, createTask, changeTaskStatus },
  "../../../../lib/estrategia-form": { lerTarefa, lerId, lerRevisao, ROTULO_TAREFA, destinoDeErro, FormularioInvalido, lerEdicaoDaTarefa },
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
const page = () => exports.default!({ params: Promise.resolve({ tenantId: "empresa-a" }), searchParams: Promise.resolve({}) });
const owner = { permissions: new Set(["strategy.read", "strategy.write"]), tenantId: "empresa-a" };
const task = (status = "todo", extra = {}) => ({ id: "11111111-1111-4111-8111-111111111111", title: "Tarefa real", description: "Descrição persistida", status, campaignId: null, dueDate: null, dependsOn: [], revision: 3, ...extra });
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
});

describe("Operação oficial — apresentação e ações", () => {
  it("nega leitura antes de consultar tarefas ou campanhas", async () => {
    contextoDaEmpresa.mockResolvedValue({ permissions: new Set() });
    expect(renderToStaticMarkup(await page())).toContain("Sem permissão");
    expect(listTasks).not.toHaveBeenCalled();
    expect(listCampaigns).not.toHaveBeenCalled();
  });
  it("leitor vê dados persistidos com filtro GET e sem formulários de mutação ou CTA de criação", async () => {
    contextoDaEmpresa.mockResolvedValue({ permissions: new Set(["strategy.read"]) });
    listTasks.mockResolvedValue([task()]);
    const tree = await page();
    expect(forms(tree).filter(f => f.props.method === "get")).toHaveLength(1);
    expect(forms(tree).filter(f => f.props.method !== "get")).toHaveLength(0);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Tarefa real");
    expect(html).toContain("Descrição persistida");
    expect(html).toContain("acesso de leitura");
    expect(html).not.toContain("Criar tarefa");
  });
  it("vazio não fabrica tarefas, responsáveis ou métricas", async () => {
    const tree = await page();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Nenhuma tarefa ainda.");
    expect(html).not.toContain("Prova quantitativa");
    expect(html).not.toContain("Decomposição sugerida");
    expect(forms(tree).filter(f => f.props.method !== "get")).toHaveLength(1);
  });
  it("mostra dependências, campanha e data civil sem interpretar conteúdo como HTML", async () => {
    listTasks.mockResolvedValue([task("todo", { title: "<script>injetado</script>", campaignId: "campanha", dueDate: "2028-02-29", dependsOn: ["outra"] }), task("done", { id: "outra", title: "Revisar briefing" })]);
    listCampaigns.mockResolvedValue([{ id: "campanha", name: "Campanha persistida" }]);
    const tree = await page();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Campanha: Campanha persistida");
    expect(html).toContain("29/02/2028");
    expect(nodes(tree).find((node) => node.type === "time").props.dateTime).toBe("2028-02-29");
    expect(html).toContain("Depende de: Revisar briefing");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>injetado");
  });
  it("oferece só transições válidas; concluída reabre e cancelada é terminal", async () => {
    for (const [status, labels] of [["todo", ["Iniciar", "Cancelar"]], ["in_progress", ["Concluir", "Voltar para a fazer", "Cancelar"]], ["done", ["Reabrir"]], ["cancelled", []]] as const) {
      listTasks.mockResolvedValue([task(status)]);
      const tree = await page();
      const card = nodes(tree).find((node) => node.type === "li" && node.props.className === undefined && textOf(node).includes("Tarefa real"));
      expect(forms(card).map(textOf)).toEqual(labels);
    }
  });
  it("criação refaz contexto vivo e usa parser com assignee null", async () => {
    const tree = await page();
    const form = forms(tree).find(f => f.props.method !== "get");
    const fresh = { ...owner, userId: "contexto-vivo" };
    contextoDaEmpresa.mockResolvedValue(fresh);
    const input = new FormData(); input.set("title", "Nova tarefa");
    await expect(form.props.action(input)).rejects.toThrow("redirect:/e/empresa-a/operacao?ok=criada");
    expect(createTask).toHaveBeenCalledWith(dependencies, { ctx: fresh, content: { title: "Nova tarefa", description: "", campaignId: null, dueDate: null, assignee: null, dependsOn: [] } });
    expect(revalidatePath).toHaveBeenCalledWith("/e/empresa-a/operacao");
  });
  it("transição refaz contexto e transmite revisão sem assumir identidade do render", async () => {
    listTasks.mockResolvedValue([task("done")]);
    const tree = await page();
    const fresh = { ...owner, userId: "outro-contexto-vivo" };
    contextoDaEmpresa.mockResolvedValue(fresh);
    const input = new FormData(); input.set("tarefa", task().id); input.set("revisao", "3");
    await expect(mutationForm(tree, "Reabrir").props.action(input)).rejects.toThrow("redirect:/e/empresa-a/operacao?ok=estado");
    expect(changeTaskStatus).toHaveBeenCalledWith(dependencies, { ctx: fresh, taskId: task().id, expectedRevision: 3, to: "in_progress" });
  });
  it("dados adulterados recusam mutação e não invalidam cache nem exibem sucesso", async () => {
    listTasks.mockResolvedValue([task()]);
    const tree = await page();
    const input = new FormData(); input.set("tarefa", "nao-uuid"); input.set("revisao", "0");
    await expect(mutationForm(tree, "Iniciar").props.action(input)).rejects.toThrow("erro=FORMULARIO_INVALIDO");
    expect(changeTaskStatus).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
