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

const ID = "11111111-1111-4111-8111-111111111111", CAMPAIGN = "22222222-2222-4222-8222-222222222222";
const taskN = (n: number, dueDate: string | null, status = "todo", extra = {}) => task(status, { id: `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`, title: `Tarefa ${n}`, dueDate, ...extra });
const section = (tree: any) => nodes(tree).find(n=>n.type==="section" && n.props["aria-labelledby"]==="resumo-prazos");
const counts = (tree: any) => Object.fromEntries(nodes(section(tree)).filter(n=>n.type==="div").filter(n=>nodes(n).some(x=>x.type==="dt")).map(n=>[textOf(nodes(n).find(x=>x.type==="dt")),textOf(nodes(n).find(x=>x.type==="dd"))]));
const read = (tasks: any[], references=tasks, campaigns:any[]=[]) => getOperationTasks.mockResolvedValue({tasks,references,campaigns});
const expected = (over={}) => ({"Tarefas abertas":"0","Atrasadas":"0","Hoje":"0","Prazos futuros":"0","Sem prazo":"0","Prazos indisponíveis":"0",...over});

describe("Operação oficial — resumo dos prazos das tarefas abertas",()=>{
  it("particiona abertas por prazo sem incluir concluídas/canceladas",async()=>{
    read([taskN(1,"2026-11-19"),taskN(2,"2026-11-20","in_progress"),taskN(3,"2026-11-21"),taskN(4,null),taskN(5,"2020-01-01","done"),taskN(6,null,"cancelled")]);
    const tree=await page();
    expect(counts(tree)).toEqual(expected({"Tarefas abertas":"4","Atrasadas":"1","Hoje":"1","Prazos futuros":"1","Sem prazo":"1"}));
    expect(textOf(section(tree))).toContain("Concluídas e canceladas não entram neste resumo.");
    expect(textOf(section(tree))).toContain("Referência: 20/11/2026.");
    expect(nodes(section(tree)).filter(n=>n.type==="li" || n.props?.className?.startsWith?.("selo"))).toHaveLength(0);
  });
  it("usa só tarefas filtradas, não referências de outra campanha nem tenant forjado",async()=>{
    const own=taskN(1,"2026-11-20");
    read([own,taskN(2,"2026-11-19","todo",{tenantId:"empresa-b"})],[own,taskN(3,"2026-11-19")],[{id:CAMPAIGN,name:"Campanha selecionada"}]);
    const tree=await page({campanha:CAMPAIGN});
    expect(counts(tree)).toEqual(expected({"Tarefas abertas":"1","Hoje":"1"}));
    expect(textOf(section(tree))).toContain("Escopo: tarefas abertas da campanha Campanha selecionada.");
  });
  it("identifica escopo all/avulsas/campanha com o nome autorizado escapado",async()=>{
    read([],[],[{id:CAMPAIGN,name:"<script>Campanha</script>"}]);
    expect(textOf(section(await page()))).toContain("todas as tarefas abertas desta empresa");
    expect(textOf(section(await page({campanha:"avulsas"})))).toContain("tarefas abertas avulsas desta empresa");
    const html=renderToStaticMarkup(section(await page({campanha:CAMPAIGN})));
    expect(html).toContain("&lt;script&gt;Campanha&lt;/script&gt;"); expect(html).not.toContain("<script>");
  });
  it("fuso/dia indisponível não apresenta zeros relativos como resultados verificados",async()=>{
    hojeDaOperacao.mockResolvedValue(null); read([taskN(1,"2026-11-20"),taskN(2,null),taskN(3,"2026-02-30")]);
    const tree=await page();
    expect(counts(tree)).toEqual(expected({"Tarefas abertas":"3","Atrasadas":"Indisponível","Hoje":"Indisponível","Prazos futuros":"Indisponível","Sem prazo":"1","Prazos indisponíveis":"2"}));
    expect(renderToStaticMarkup(tree)).toContain("Classificação de prazos indisponível.");
    expect(textOf(section(tree))).toContain("Referência de data indisponível.");
  });
  it("zero aberto real com dia válido é zero, inclusive com terminais visíveis",async()=>{
    read([taskN(1,"2020-01-01","done"),taskN(2,null,"cancelled")]); const tree=await page();
    expect(counts(tree)).toEqual(expected()); expect(nodes(tree).filter(n=>n.type==="li")).toHaveLength(2);
  });
  it("datas malformadas têm bucket explícito e não são prazo ou atraso inventados",async()=>{
    read([taskN(1,"2026-02-30"),taskN(2,"amanhã"),taskN(3,null)]);
    expect(counts(await page())).toEqual(expected({"Tarefas abertas":"3","Sem prazo":"1","Prazos indisponíveis":"2"}));
  });
  it("dia indisponível e lista vazia ainda deixam classificação relativa desconhecida",async()=>{
    hojeDaOperacao.mockResolvedValue(null); read([]);
    expect(counts(await page())).toEqual(expected({"Atrasadas":"Indisponível","Hoje":"Indisponível","Prazos futuros":"Indisponível"}));
  });
  it("aproveita leitura/hoje existentes uma vez, sem buscar metadados adicionais",async()=>{
    read([taskN(1,null)]); await page();
    expect(getOperationTasks).toHaveBeenCalledTimes(1); expect(hojeDaOperacao).toHaveBeenCalledTimes(1);
  });
  it("filtro inválido/alheio ou falta de read não exibe agregado nem metadados",async()=>{
    contextoDaEmpresa.mockResolvedValueOnce({...owner,permissions:new Set()}); expect(section(await page())).toBeUndefined();
    expect(section(await page({campanha:"inválida"}))).toBeUndefined();
    getOperationTasks.mockRejectedValueOnce(Object.assign(new Error("privado"),{code:"CAMPAIGN_NOT_FOUND"}));
    expect(section(await page({campanha:CAMPAIGN}))).toBeUndefined(); expect(hojeDaOperacao).not.toHaveBeenCalled();
  });
  it("Leitor recebe resumo real sem ações novas ou controles de escrita",async()=>{
    contextoDaEmpresa.mockResolvedValue({...owner,permissions:new Set(["strategy.read"])}); read([taskN(1,"2026-11-20")]);
    const tree=await page(); expect(counts(tree)).toEqual(expected({"Tarefas abertas":"1","Hoje":"1"}));
    expect(forms(tree)).toHaveLength(1); expect(forms(tree)[0].props.method).toBe("get"); expect(nodes(section(tree)).some(n=>n.type==="button" || n.type==="a")).toBe(false);
  });
  it("releitura após mudança de estado ou prazo atualiza resumo preservando tarefa/revisão",async()=>{
    const own=taskN(1,"2026-11-19","todo",{id:ID}); read([own]);
    const tree=await page(); const d=new FormData(); d.set("tarefa",ID); d.set("revisao","3");
    await expect(mutationForm(tree,"Iniciar").props.action(d)).rejects.toThrow("ok=estado");
    read([{...own,status:"done",revision:4}]); expect(counts(await page())).toEqual(expected());
    read([{...own,dueDate:"2026-11-21",revision:5}]); expect(counts(await page())).toEqual(expected({"Tarefas abertas":"1","Prazos futuros":"1"}));
    expect(changeTaskStatus.mock.calls[0][1]).toMatchObject({taskId:ID,expectedRevision:3});
  });
});
