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
  "../../../../lib/operacao-prazos": { hojeDaOperacao },
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

const A="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const rootPath="/e/empresa-a/operacao";
const dated=(n:number,dueDate:string|null,status="todo",extra={})=>task(status,{id:`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`,title:`Tarefa prazo ${n}`,dueDate,campaignId:A,...extra});
const dataset=[dated(1,"2026-11-19"),dated(2,"2026-11-20","in_progress"),dated(3,"2026-11-21"),dated(4,null),dated(5,"2026-02-30"),dated(6,"2020-01-01","done"),dated(7,null,"cancelled")];
const read=(tasks=dataset,references=tasks)=>getOperationTasks.mockResolvedValue({tasks,references,campaigns:[{id:A,name:"Campanha A"},{id:B,name:"Campanha B"}]});
const cards=(tree:any)=>nodes(tree).filter(n=>n.type==="li"&&n.props.id?.startsWith("tarefa-"));
const ids=(tree:any)=>cards(tree).map(n=>n.props.id);
const editor=(tree:any)=>nodes(tree).find(n=>n.type?.name==="EditorDaTarefa");
const editForm=(tree:any)=>{const e=editor(tree);return nodes(e.type(e.props)).find(n=>n.type==="form");};
function editData(id=dataset[0]!.id){const d=new FormData();d.set("editar_tarefa",id);d.set("editar_revisao","3");d.set("editar_title","Título mantido");d.set("editar_campaignId",A);d.set("editar_dueDate","2026-11-21");return d;}

describe("Operação — filtro de prazo combinado com campanha",()=>{
  it("ausência mantém todas inclusive terminais e ordem dos selects preserva campanha→Aplicar",async()=>{
    read();const tree=await page();expect(ids(tree)).toHaveLength(7);
    const form=forms(tree).find(n=>n.props.method==="get");
    expect(nodes(form).filter(n=>n.type==="select").map(n=>n.props.name)).toEqual(["prazo","campanha"]);
    expect(nodes(form).find(n=>n.props?.name==="prazo").props.defaultValue).toBe("todas");
    expect(nodes(form).at(-1).props.type).toBe("submit");
  });
  it("cada categoria exibe apenas abertas correspondentes, sem terminais",async()=>{
    read();for(const[token,n]of[["atrasadas",1],["hoje",2],["futuros",3],["sem-prazo",4],["indisponiveis",5]]as const){
      const tree=await page({prazo:token});expect(ids(tree)).toEqual([`tarefa-${dataset[n-1]!.id}`]);
      expect(renderToStaticMarkup(tree)).toContain("Tarefas exibidas: 1.");
    }
  });
  it("resumo continua sobre a campanha antes do filtro prazo e explica a diferença",async()=>{
    read();const tree=await page({campanha:A,prazo:"atrasadas"});
    expect(getOperationTasks).toHaveBeenCalledWith(dependencies,owner,{kind:"campaign",campaignId:A});
    const summary=nodes(tree).find(n=>n.props?.["aria-labelledby"]==="resumo-prazos");
    const total=nodes(summary).find(n=>n.type==="div"&&textOf(n).startsWith("Tarefas abertas"));
    expect(textOf(total)).toBe("Tarefas abertas5");expect(textOf(summary)).toContain("O filtro de prazo não altera este resumo.");
    expect(ids(tree)).toHaveLength(1);
  });
  it("refs e dependências fora do prazo permanecem na edição e âncora recebe só IDs visíveis",async()=>{
    const selected={...dataset[0]!,dependsOn:[dataset[2]!.id]};read([selected,dataset[2]!]);
    const tree=await page({prazo:"atrasadas"});expect(ids(tree)).toEqual([`tarefa-${selected.id}`]);
    expect(renderToStaticMarkup(tree)).toContain("Depende de: Tarefa prazo 3 — A fazer");
    expect(editor(tree).props.tarefas.map((t:any)=>t.id)).toEqual([selected.id,dataset[2]!.id]);
    expect(nodes(tree).find(n=>n.type?.name==="TarefaDestino").props.taskIds).toEqual([selected.id]);
  });
  it("filtro relativo sem data mostra indisponibilidade, nunca vazio ou quantidade falsos",async()=>{
    hojeDaOperacao.mockResolvedValue(null);read();const tree=await page({prazo:"atrasadas"});const html=renderToStaticMarkup(tree);
    expect(ids(tree)).toHaveLength(0);expect(html).toContain("O filtro de prazo não pode ser aplicado");
    expect(html).not.toContain("Nenhuma tarefa aberta corresponde");expect(html).not.toContain("Tarefas exibidas:");
    expect(nodes(tree).some(n=>n.props?.["aria-label"]==="Filtro de prazo indisponível")).toBe(true);
    expect(hojeDaOperacao).toHaveBeenCalledTimes(1);
  });
  it("sem dia indisponíveis inclui datas desconhecidas, sem prazo ainda separa null",async()=>{
    hojeDaOperacao.mockResolvedValue(null);read();
    expect(ids(await page({prazo:"indisponiveis"}))).toHaveLength(4);
    expect(ids(await page({prazo:"sem-prazo"}))).toEqual([`tarefa-${dataset[3]!.id}`]);
  });
  it("categoria disponível vazia é explícita e limpar remove ambos os filtros",async()=>{
    read([dataset[3]!]);const tree=await page({campanha:A,prazo:"atrasadas"});const html=renderToStaticMarkup(tree);
    expect(html).toContain("Nenhuma tarefa aberta corresponde a este filtro de prazo.");
    expect(html).toContain("Tarefas exibidas: 0.");
    expect(nodes(tree).find(n=>n.type==="a"&&textOf(n)==="Limpar filtro").props.href).toBe(rootPath);
  });
  it("prazo malformado/duplicado recusa antes da leitura/metadata/mutações",async()=>{
    for(const prazo of["", " ","overdue",["hoje"],["hoje","futuros"]]){
      const tree=await page({campanha:A,prazo});expect(renderToStaticMarkup(tree)).toContain("Filtro de prazo inválido.");
      expect(forms(tree)).toHaveLength(0);expect(cards(tree)).toHaveLength(0);
    }
    expect(getOperationTasks).not.toHaveBeenCalled();expect(hojeDaOperacao).not.toHaveBeenCalled();expect(createTask).not.toHaveBeenCalled();
  });
  it("criação mantém os filtros validados e ignora tentativas de sobrescrevê-los no body",async()=>{
    read();const tree=await page({campanha:A,prazo:"atrasadas"});const d=new FormData();d.set("title","Nova tarefa");d.set("prazo","hoje");d.set("campanha",B);
    await expect(mutationForm(tree,"Criar tarefa").props.action(d)).rejects.toThrow(`${rootPath}?campanha=${A}&prazo=atrasadas&ok=criada`);
    expect(createTask.mock.calls[0][1].content.dueDate).toBeNull();
    expect(createTask.mock.calls[0][1].content.campaignId).toBeNull();expect(revalidatePath).toHaveBeenCalledWith(rootPath);
  });
  it("estado preserva prazo/campanha e concluída deixa o recorte após releitura",async()=>{
    read();const tree=await page({campanha:A,prazo:"hoje"});const d=new FormData();d.set("tarefa",dataset[1]!.id);d.set("revisao","3");
    await expect(mutationForm(tree,"Concluir").props.action(d)).rejects.toThrow(`${rootPath}?campanha=${A}&prazo=hoje&ok=estado`);
    read(dataset.map(t=>t.id===dataset[1]!.id?{...t,status:"done",revision:4}:t));expect(ids(await page({campanha:A,prazo:"hoje"}))).toHaveLength(0);
    expect(changeTaskStatus.mock.calls[0][1]).toMatchObject({taskId:dataset[1]!.id,expectedRevision:3});
  });
  it("edição e seus erros/fechamento mantêm filtros/hash, com revisão e sem editar responsável",async()=>{
    read();const tree=await page({campanha:A,prazo:"atrasadas"});const e=editor(tree);
    expect(nodes(e.type(e.props)).find(n=>n.type==="a").props.href).toBe(`${rootPath}?campanha=${A}&prazo=atrasadas#tarefa-${dataset[0]!.id}`);
    await expect(editForm(tree).props.action(editData())).rejects.toThrow(`${rootPath}?campanha=${A}&prazo=atrasadas&ok=salva#tarefa-${dataset[0]!.id}`);
    expect(saveTaskDetails.mock.calls[0][1]).toMatchObject({taskId:dataset[0]!.id,expectedRevision:3});expect(saveTaskDetails.mock.calls[0][1].content).not.toHaveProperty("assignee");
    saveTaskDetails.mockRejectedValueOnce({code:"CONFLICT_VERSION"});
    await expect(editForm(tree).props.action(editData())).rejects.toThrow(`campanha=${A}&prazo=atrasadas&erro=CONFLICT_VERSION&editar=${dataset[0]!.id}#editar-${dataset[0]!.id}`);
  });
  it("Viewer filtra sem controles de mutação e sem afrouxar read",async()=>{
    read();contextoDaEmpresa.mockResolvedValue({...owner,permissions:new Set(["strategy.read"])});const tree=await page({prazo:"hoje"});
    expect(ids(tree)).toHaveLength(1);expect(forms(tree)).toHaveLength(1);expect(forms(tree)[0].props.method).toBe("get");expect(editor(tree)).toBeUndefined();
    getOperationTasks.mockClear();hojeDaOperacao.mockClear();contextoDaEmpresa.mockResolvedValue({...owner,permissions:new Set()});
    await page({prazo:"hoje"});expect(getOperationTasks).not.toHaveBeenCalled();expect(hojeDaOperacao).not.toHaveBeenCalled();
  });
});
