import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Componente e ações reais com portas controladas; banco/Auth são exercitados no E2E.
const requireWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const React = requireWeb("react");
const { renderToStaticMarkup } = requireWeb("react-dom/server");
const { transform, loadBindings } = requireWeb("next/dist/build/swc");
await loadBindings();
const form = await import("../apps/web/src/lib/estrategia-form");
const contextoDaEmpresa = vi.fn();
const listTasks = vi.fn();
const getOperationTasks = vi.fn(async () => ({ tasks: await listTasks(), references: await listTasks(), campaigns: await listCampaigns() }));
const listCampaigns = vi.fn();
const saveTaskDetails = vi.fn();
const revalidatePath = vi.fn();
const redirect = vi.fn((url: string): never => { throw new Error(`redirect:${url}`); });
const dependencies = {};
const source = readFileSync(new URL("../apps/web/src/app/e/[tenantId]/operacao/page.tsx", import.meta.url), "utf8");
const compiled = await transform(source, { filename: "operacao-edicao.tsx", jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "classic" } } }, module: { type: "commonjs" } });
const modules: Record<string, unknown> = {
  "next/navigation": { redirect }, "next/cache": { revalidatePath },
  "../../../../lib/session": { contextoDaEmpresa }, "../../../../lib/deps-estrategia": { strategyDeps: dependencies },
  "../../../../lib/estrategia": { getOperationTasks, listTasks, listCampaigns, createTask: vi.fn(), changeTaskStatus: vi.fn(), saveTaskDetails },
  "../../../../lib/estrategia-form": form,
  "../../../../lib/operacao-filtro": await import("../apps/web/src/lib/operacao-filtro"),
  "../../../../components/tarefa-destino": { TarefaDestino: () => null },
  "../../../../components/botao-enviar": { BotaoEnviar: ({ children }: { children: unknown }) => React.createElement("button", { type: "submit" }, children) },
  "../../../../components/aviso-estrategia": { AvisoDeErro: () => null, AvisoSemPermissao: () => React.createElement("p", null, "Sem permissão") },
  "./operacao.module.css": { default: {} },
};
const exports: { default?: (props: unknown) => Promise<any> } = {};
new Function("require", "exports", "React", compiled.code)((name: string) => {
  if (!(name in modules)) throw new Error(`Import não previsto: ${name}`);
  return modules[name];
}, exports, React);
const ID = "11111111-1111-4111-8111-111111111111", OTHER = "22222222-2222-4222-8222-222222222222";
const owner = { permissions: new Set(["strategy.read", "strategy.write"]), tenantId: "empresa-a" };
const task = (extra = {}) => ({ id: ID, title: "Revisar oferta", description: "Descrição salva", status: "in_progress", campaignId: OTHER, dueDate: "2028-02-29", dependsOn: [OTHER], assignee: { kind: "user", userId: "pessoa" }, revision: 3, ...extra });
function nodes(element: any): any[] {
  if (element === null || element === undefined || typeof element !== "object") return [];
  if (Array.isArray(element)) return element.flatMap(nodes);
  return [element, ...nodes(element.props?.children)];
}
const editors = (tree: any) => nodes(tree).filter((n) => typeof n.type === "function" && n.type.name === "EditorDaTarefa");
const expand = (node: any) => node.type(node.props);
const editorForm = (node: any) => nodes(expand(node)).find((n) => n.type === "form");
const page = (search = {}) => exports.default!({ params: Promise.resolve({ tenantId: "empresa-a" }), searchParams: Promise.resolve(search) });
function input() {
  const d = new FormData();
  d.set("editar_tarefa", ID); d.set("editar_revisao", "3"); d.set("editar_title", "Oferta revisada");
  d.set("editar_description", "Novo detalhe"); d.set("editar_campaignId", OTHER); d.set("editar_dueDate", "2028-02-29"); d.append("editar_dep", OTHER);
  return d;
}
beforeEach(() => {
  vi.clearAllMocks();
  contextoDaEmpresa.mockResolvedValue(owner);
  listTasks.mockResolvedValue([task(), task({ id: OTHER, title: "Preparar briefing", status: "cancelled", campaignId: null, dependsOn: [] })]);
  listCampaigns.mockResolvedValue([{ id: OTHER, name: "Campanha persistida" }]);
});

describe("Edição oficial de tarefa", () => {
  it("parser usa apenas os campos de edição e não aceita responsável/estado/revisão extra no conteúdo", () => {
    const d = input();
    d.set("assignee", "forjado"); d.set("editar_assignee", "forjado"); d.set("editar_status", "cancelled"); d.set("editar_revision", "99");
    d.set("title", "campo da criação"); d.set("revisao", "99");
    expect(form.lerEdicaoDaTarefa(d)).toEqual({ taskId: ID, expectedRevision: 3, content: { title: "Oferta revisada", description: "Novo detalhe", campaignId: OTHER, dueDate: "2028-02-29", dependsOn: [OTHER] } });
  });
  it("parser recusa IDs, revisão e dependências malformados sem atingir a operação", () => {
    for (const [field, value] of [["editar_tarefa", "outro"], ["editar_revisao", "0"], ["editar_dep", "invalido"]]) {
      const d = input(); d.set(field!, value!);
      expect(() => form.lerEdicaoDaTarefa(d)).toThrow(form.FormularioInvalido);
    }
  });
  it("preenche os valores persistidos e mantém dependência cancelada sem editar responsável/estado", async () => {
    const editor = editors(await page())[0]!;
    const tree = expand(editor);
    const fields = nodes(tree).filter((n) => n.type === "input" || n.type === "textarea" || n.type === "select");
    const byName = (name: string) => fields.filter((n) => n.props.name === name);
    expect(byName("editar_title")[0].props.defaultValue).toBe("Revisar oferta");
    expect(byName("editar_description")[0].props.defaultValue).toBe("Descrição salva");
    expect(byName("editar_dueDate")[0].props.defaultValue).toBe("2028-02-29");
    expect(byName("editar_campaignId")[0].props.defaultValue).toBe(OTHER);
    expect(byName("editar_dep")[0].props.defaultChecked).toBe(true);
    expect(byName("editar_dep").map((n) => n.props.value)).not.toContain(ID);
    expect(fields.map((n) => n.props.name)).not.toContain("assignee");
    expect(fields.map((n) => n.props.name)).not.toContain("status");
    expect(fields.every((n) => n.props.name.startsWith("editar_"))).toBe(true);
  });
  it("salvar refaz contexto e envia só detalhes, ID e revisão ao caso de uso", async () => {
    const editor = editors(await page())[0]!;
    const fresh = { ...owner, userId: "sessao-viva" };
    contextoDaEmpresa.mockResolvedValue(fresh);
    await expect(editorForm(editor).props.action(input())).rejects.toThrow(`redirect:/e/empresa-a/operacao?ok=salva#tarefa-${ID}`);
    expect(saveTaskDetails).toHaveBeenCalledWith(dependencies, { ctx: fresh, taskId: ID, expectedRevision: 3, content: { title: "Oferta revisada", description: "Novo detalhe", campaignId: OTHER, dueDate: "2028-02-29", dependsOn: [OTHER] } });
    expect(revalidatePath).toHaveBeenCalledWith("/e/empresa-a/operacao");
  });
  it("ID adulterado não troca o alvo bound nem aparece no retorno", async () => {
    const editor = editors(await page())[0]!, d = input(); d.set("editar_tarefa", OTHER);
    await expect(editorForm(editor).props.action(d)).rejects.toThrow(`erro=FORMULARIO_INVALIDO&editar=${ID}#editar-${ID}`);
    expect(saveTaskDetails).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect.mock.calls[0]![0]).not.toContain(OTHER);
  });
  it("conflito não invalida cache nem anuncia sucesso e reabre somente o editor conhecido", async () => {
    const editor = editors(await page())[0]!;
    saveTaskDetails.mockRejectedValueOnce({ code: "CONFLICT_VERSION", message: "interno não deve aparecer" });
    await expect(editorForm(editor).props.action(input())).rejects.toThrow(`erro=CONFLICT_VERSION&editar=${ID}#editar-${ID}`);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect.mock.calls[0]![0]).not.toContain("interno");
  });
  it("falha na identidade fresca interrompe antes da leitura ou mutação de detalhes", async () => {
    const editor = editors(await page())[0]!;
    contextoDaEmpresa.mockRejectedValueOnce(new Error("sessão revogada"));
    await expect(editorForm(editor).props.action(input())).rejects.toThrow("sessão revogada");
    expect(saveTaskDetails).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("leitor e tarefa cancelada não recebem editor, concluída mantém edição", async () => {
    listTasks.mockResolvedValue([task({ status: "cancelled" })]);
    expect(editors(await page())).toHaveLength(0);
    listTasks.mockResolvedValue([task({ status: "done" })]);
    expect(editors(await page())).toHaveLength(1);
    contextoDaEmpresa.mockResolvedValue({ ...owner, permissions: new Set(["strategy.read"]) });
    expect(editors(await page())).toHaveLength(0);
  });
  it("query só abre o editor próprio e a chave de revisão força fechamento após salvar", async () => {
    const initial = editors(await page())[0]!;
    expect(expand(initial).props.open).toBe(false);
    expect(expand(editors(await page({ editar: OTHER }))[0]!).props.open).toBe(false);
    expect(expand(editors(await page({ editar: ID }))[0]!).props.open).toBe(true);
    listTasks.mockResolvedValue([task({ revision: 4 })]);
    const updated = editors(await page())[0]!;
    expect(updated.key).not.toBe(initial.key);
    expect(expand(updated).props.open).toBe(false);
  });
  it("conteúdo salvo é escapado nos campos e labels individuais não colidem com criação", async () => {
    listTasks.mockResolvedValue([task({ title: "<img src=x>", description: "<script>teste</script>", dependsOn: [] })]);
    const editor = editors(await page())[0]!;
    const html = renderToStaticMarkup(expand(editor));
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>teste</script>");
    expect(html).toContain("Título da tarefa");
    expect(html).toContain("editar_title");
  });
});
