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
const hojeDaOperacao = vi.fn();
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
  "../../../../lib/estrategia": { ...await import("../apps/web/src/lib/estrategia"), summarizeTaskDependencies: (await import("../apps/web/src/lib/estrategia")).summarizeTaskDependencies, getOperationTasks, listTasks, listCampaigns, createTask, changeTaskStatus },
  "../../../../lib/estrategia-form": { lerTarefa, lerId, lerRevisao, ROTULO_TAREFA, destinoDeErro, FormularioInvalido, lerEdicaoDaTarefa },
  "../../../../lib/operacao-prazos": { hojeDaOperacao },
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
  hojeDaOperacao.mockResolvedValue("2026-11-20");
});

// Boundary real compilado com composição controlada: não inicializa pool/credenciais.
const core = await import("../packages/core/src/domain/access-context.ts");
const strategy = await import("../apps/web/src/lib/estrategia");
const boundarySource = readFileSync(new URL("../apps/web/src/lib/operacao-prazos.ts", import.meta.url), "utf8");
const boundaryCompiled = await transform(boundarySource, { filename: "operacao-prazos.ts", jsc: { parser: { syntax: "typescript" } }, module: { type: "commonjs" } });
const boundary: { hojeDaOperacao?: (...args: any[]) => Promise<string | null> } = {};
new Function("require", "exports", boundaryCompiled.code)((name: string) => {
  if (name === "@oplyra/core") return core;
  if (name === "./deps") return { deps: {} };
  if (name === "./estrategia") return strategy;
  throw new Error(`Import inesperado: ${name}`);
}, boundary);
function clockDeps(timezone: string = "America/Sao_Paulo", instant = "2026-11-21T01:30:00Z") {
  const tx = {};
  const findById = vi.fn(async () => ({ id: owner.tenantId, timezone }));
  const withUserTransaction = vi.fn(async (_ctx: unknown, f: any) => f(tx));
  const now = vi.fn(() => new Date(instant));
  return { tx, tenants: { findById }, uow: { withUserTransaction }, clock: { now } };
}
function read(tasks: any[]) { getOperationTasks.mockResolvedValue({ tasks, references: tasks, campaigns: [] }); }
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const dated = (n: number, dueDate: string | null, status = "todo") => task(status, { id: id(n), title: `Tarefa prazo ${n}`, dueDate });
const listIds = (tree: any, state: string) => {
  const column = nodes(tree).find(n => n.type === "section" && n.props["aria-labelledby"] === `coluna-${state}`);
  return nodes(column).filter(n => n.type === "li").map(n => n.props.id);
};

describe("Dia civil da empresa na Operação", () => {
  it("recusa falta de read antes de consultar metadados ou relógio", async () => {
    const deps = clockDeps();
    await expect(boundary.hojeDaOperacao!({ ...owner, permissions: new Set() }, deps)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(deps.uow.withUserTransaction).not.toHaveBeenCalled(); expect(deps.clock.now).not.toHaveBeenCalled();
  });
  it("usa empresa autorizada e uma leitura do relógio no fuso real, não um dia UTC presumido", async () => {
    const deps = clockDeps();
    expect(await boundary.hojeDaOperacao!({ ...owner, timezone: "Pacific/Kiritimati" }, deps)).toBe("2026-11-20");
    expect(deps.tenants.findById).toHaveBeenCalledWith(deps.tx, owner.tenantId);
    expect(deps.uow.withUserTransaction).toHaveBeenCalledTimes(1); expect(deps.clock.now).toHaveBeenCalledTimes(1);
    const ahead = clockDeps("Pacific/Kiritimati");
    expect(await boundary.hojeDaOperacao!(owner, ahead)).toBe("2026-11-21");
  });
  it("empresa ausente/alheia não empresta seu fuso nem toca o relógio", async () => {
    const deps = clockDeps();
    deps.tenants.findById.mockResolvedValueOnce(null as any).mockResolvedValueOnce({ id: "empresa-b", timezone: "UTC" });
    expect(await boundary.hojeDaOperacao!(owner, deps)).toBeNull();
    expect(await boundary.hojeDaOperacao!(owner, deps)).toBeNull(); expect(deps.clock.now).not.toHaveBeenCalled();
  });
  it("timezone ou instante inválido devolvem indisponível sem inventar data", async () => {
    expect(await boundary.hojeDaOperacao!(owner, clockDeps("Fuso/Inexistente"))).toBeNull();
    expect(await boundary.hojeDaOperacao!(owner, clockDeps("America/Sao_Paulo", "inválido"))).toBeNull();
  });
  it("erro inesperado de consulta ou clock propaga, sem virar dia padrão", async () => {
    const deps = clockDeps(); deps.tenants.findById.mockRejectedValueOnce(new Error("banco indisponível"));
    await expect(boundary.hojeDaOperacao!(owner, deps)).rejects.toThrow("banco indisponível");
    deps.clock.now.mockImplementationOnce(() => { throw new Error("relógio indisponível"); });
    await expect(boundary.hojeDaOperacao!(owner, deps)).rejects.toThrow("relógio indisponível");
  });
});

describe("Operação — prioridade visual dos prazos", () => {
  it("ordena abertas por data, preserva empates e mantém sem prazo no final sem mudar referências", async () => {
    const original = [dated(1,null), dated(2,"2026-11-25"), dated(3,"2026-11-19"), dated(4,"2026-11-19"), dated(5,"2026-11-20","in_progress"), dated(6,null,"in_progress"), dated(7,"2026-11-18","in_progress")];
    read(original); const before = structuredClone(original); const tree = await page();
    expect(listIds(tree,"todo")).toEqual([id(3),id(4),id(2),id(1)].map(x=>`tarefa-${x}`));
    expect(listIds(tree,"in_progress")).toEqual([id(7),id(5),id(6)].map(x=>`tarefa-${x}`));
    expect(original).toEqual(before); await expect(getOperationTasks.mock.results[0].value).resolves.toMatchObject({ references: original });
    expect(renderToStaticMarkup(tree)).toContain("Datas iguais mantêm a ordem anterior.");
  });
  it("classifica Atrasada/Hoje/futuro fora do selo e mantém dateTime civil", async () => {
    read([dated(1,"2026-11-19"),dated(2,"2026-11-20"),dated(3,"2026-11-21"),dated(4,null)]);
    const tree = await page(); const html = renderToStaticMarkup(tree);
    expect(html).toContain("Atrasada"); expect(html).toContain("Hoje"); expect(html).toContain("Prazo futuro"); expect(html).toContain("Sem prazo");
    expect(nodes(tree).filter(n=>n.type==="time").map(n=>n.props.dateTime)).toEqual(["2026-11-19","2026-11-20","2026-11-21"]);
    const badges = nodes(tree).filter(n=>n.type==="span" && n.props?.className?.startsWith?.("selo"));
    expect(badges).toHaveLength(4); expect(badges.every(n=>textOf(n)==="A fazer")).toBe(true);
  });
  it("concluídas/canceladas mantêm ordem original e data sem atraso ativo", async () => {
    read([dated(1,"2026-11-25","done"), dated(2,"2026-11-18","done"), dated(3,"2026-11-25","cancelled"),dated(4,"2026-11-18","cancelled")]);
    const tree = await page(); const html = renderToStaticMarkup(tree);
    expect(listIds(tree,"done")).toEqual([`tarefa-${id(1)}`,`tarefa-${id(2)}`]);
    const section = nodes(tree).find(n=>n.type==="section" && n.props["aria-labelledby"]==="canceladas");
    expect(nodes(section).filter(n=>n.type==="li").map(n=>n.props.id)).toEqual([`tarefa-${id(3)}`,`tarefa-${id(4)}`]);
    const cardHtml = nodes(tree).filter(n=>n.type==="li" && n.props.id?.startsWith("tarefa-")).map(n=>renderToStaticMarkup(n)).join("");
    expect(cardHtml).not.toContain("Atrasada"); expect(cardHtml).not.toContain("Prazo futuro"); expect(nodes(tree).filter(n=>n.type==="time")).toHaveLength(4);
  });
  it("dia indisponível não classifica atrasos, mantém datas e aviso honesto", async () => {
    hojeDaOperacao.mockResolvedValue(null); read([dated(1,"2026-11-18"),dated(2,null)]);
    const tree = await page(); const html = renderToStaticMarkup(tree);
    expect(html).toContain("Classificação de prazos indisponível."); expect(html).toContain("18/11/2026");
    const cardHtml = nodes(tree).filter(n=>n.type==="li" && n.props.id?.startsWith("tarefa-")).map(n=>renderToStaticMarkup(n)).join("");
    expect(cardHtml).not.toContain("Atrasada"); expect(cardHtml).not.toContain("Prazo futuro"); expect(html).toContain("Sem prazo");
  });
  it("data impossível não fabrica time/atraso e fica no grupo final", async () => {
    read([dated(1,"2026-02-30"),dated(2,"2026-11-20"),dated(3,null)]); const tree = await page();
    expect(listIds(tree,"todo")).toEqual([`tarefa-${id(2)}`,`tarefa-${id(1)}`,`tarefa-${id(3)}`]);
    const invalid = nodes(tree).find(n=>n.type==="li" && n.props.id===`tarefa-${id(1)}`);
    expect(textOf(invalid)).toContain("Prazo indisponível"); expect(nodes(invalid).filter(n=>n.type==="time")).toHaveLength(0);
    expect(textOf(invalid)).not.toContain("Atrasada");
  });
  it("filtro ou permissão recusados não consultam metadados de prazos", async () => {
    contextoDaEmpresa.mockResolvedValueOnce({ ...owner, permissions: new Set() }); await page();
    await page({ campanha: "invalida" }); expect(hojeDaOperacao).not.toHaveBeenCalled();
  });
  it("Leitor recebe ordenação e dados reais sem formulários de mutação", async () => {
    contextoDaEmpresa.mockResolvedValue({ ...owner, permissions: new Set(["strategy.read"]) });
    read([dated(1,null),dated(2,"2026-11-20")]); const tree = await page();
    expect(listIds(tree,"todo")).toEqual([`tarefa-${id(2)}`,`tarefa-${id(1)}`]);
    expect(forms(tree)).toHaveLength(1); expect(forms(tree)[0].props.method).toBe("get"); expect(renderToStaticMarkup(tree)).not.toContain("Criar tarefa");
  });
});
