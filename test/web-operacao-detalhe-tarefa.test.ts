// Ambas as páginas reais + adapter real com UUIDs válidos. Portas controladas, sem Auth/SQL hospedados.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
const requireWeb=createRequire(new URL("../apps/web/package.json",import.meta.url));
const React=requireWeb("react"),{renderToStaticMarkup}=requireWeb("react-dom/server"),{transform,loadBindings}=requireWeb("next/dist/build/swc");
await loadBindings();
const strategy=await import("../apps/web/src/lib/estrategia"),form=await import("../apps/web/src/lib/estrategia-form"),navigation=await import("../apps/web/src/lib/operacao-navegacao");
const T="11111111-1111-4111-8111-111111111111",C="22222222-2222-4222-8222-222222222222",TASK="33333333-3333-4333-8333-333333333333",OTHER="44444444-4444-4444-8444-444444444444",E="55555555-5555-4555-8555-555555555555";
const owner={tenantId:T,userId:"66666666-6666-4666-8666-666666666666",permissions:new Set(["strategy.read","strategy.write"])};
const getTaskDetails=vi.fn(),hojeDaOperacao=vi.fn();
const contextoDaEmpresa=vi.fn(),getOperationTasks=vi.fn(),getCampaign=vi.fn(),listCampaignTasks=vi.fn(),listExperiments=vi.fn(),listObjectives=vi.fn(),getBrandOverview=vi.fn(),revalidatePath=vi.fn();
const redirect=vi.fn((url:string):never=>{throw new Error(`redirect:${url}`);});
const saveCampaignDraft=vi.fn(),activateCampaign=vi.fn(),pauseCampaign=vi.fn(),resumeCampaign=vi.fn(),completeCampaign=vi.fn(),cancelCampaign=vi.fn(),planExperiment=vi.fn(),startExperiment=vi.fn(),concludeExperiment=vi.fn(),cancelExperiment=vi.fn();
const methods=Object.fromEntries(strategy.ELEMENTOS_DO_METODO.map(k=>[k,"Método existente"]));
const campaign=(extra={})=>({id:C,tenantId:T,name:"Campanha oficial",status:"active",revision:4,trackingKey:"campanha-oficial",objectiveId:null,productKey:null,method:methods,createdAt:new Date("2026-11-20T12:00:00Z"),activatedAt:null,...extra});
const task=(extra={})=>({id:TASK,tenantId:T,campaignId:C,title:"Tarefa oficial",description:"Descrição salva",status:"todo",dueDate:"2026-11-19",dependsOn:[],revision:2,assignee:null,createdAt:new Date("2026-11-20T12:34:00Z"),...extra});
const domain={...strategy,getTaskDetails,getOperationTasks,getCampaign,listCampaignTasks,listExperiments,listObjectives,saveCampaignDraft,activateCampaign,pauseCampaign,resumeCampaign,completeCampaign,cancelCampaign,planExperiment,startExperiment,concludeExperiment,cancelExperiment};
async function compile(path:string,depth:string){
  const source=readFileSync(new URL(`../apps/web/src/app/e/[tenantId]/${path}`,import.meta.url),"utf8");
  const compiled=await transform(source,{filename:path,jsc:{parser:{syntax:"typescript",tsx:true},transform:{react:{runtime:"classic"}}},module:{type:"commonjs"}});
  const modules:Record<string,unknown>={"next/link":({href,children,...props}:any)=>React.createElement("a",{href,...props},children),"next/navigation":{redirect},"next/cache":{revalidatePath},"@oplyra/core/brand":{getBrandOverview}};
  for(const[name,value]of Object.entries({"lib/session":{contextoDaEmpresa},"lib/deps-estrategia":{strategyDeps:{}},"lib/deps-marca":{brandDeps:{}},"lib/estrategia":domain,"lib/estrategia-form":form,"lib/operacao-filtro":await import("../apps/web/src/lib/operacao-filtro"),"lib/operacao-navegacao":navigation,"lib/operacao-tarefa-navegacao":await import("../apps/web/src/lib/operacao-tarefa-navegacao"),"lib/operacao-prazos":{hojeDaOperacao},"components/tarefa-destino":{TarefaDestino:()=>null},"components/botao-enviar":{BotaoEnviar:({children}:any)=>React.createElement("button",{type:"submit"},children)},"components/aviso-estrategia":{AvisoDeErro:()=>null,AvisoSemPermissao:()=>React.createElement("p",null,"Sem permissão")}}))modules[`${depth}${name}`]=value;
  modules[path.includes("tarefas/[taskId]")?"./tarefa-detalhe.module.css":path.startsWith("operacao")?"./operacao.module.css":"./campanha-detalhe.module.css"]={__esModule:true,default:{}};
  const exported:{default?:(props:any)=>Promise<any>}={};
  new Function("require","exports","React",compiled.code)((name:string)=>{if(!(name in modules))throw new Error(`Import inesperado: ${name}`);return modules[name];},exported,React);
  return exported.default!;
}
const operationPage=await compile("operacao/page.tsx","../../../../"),campaignPage=await compile("estrategia/campanhas/[campaignId]/page.tsx","../../../../../../");
const operation=(search={})=>operationPage({params:Promise.resolve({tenantId:T}),searchParams:Promise.resolve(search)});
const detail=(search={})=>campaignPage({params:Promise.resolve({tenantId:T,campaignId:C}),searchParams:Promise.resolve(search)});
function nodes(el:any):any[]{if(!el||typeof el!=="object")return[];if(Array.isArray(el))return el.flatMap(nodes);return[el,...nodes(el.props?.children)];}
function text(el:any):string{if(Array.isArray(el))return el.map(text).join("");if(typeof el==="string"||typeof el==="number")return String(el);return el?.props?text(el.props.children):"";}
const links=(tree:any,label:string)=>nodes(tree).filter(n=>(n.type==="a"||typeof n.type==="function")&&n.props?.href&&text(n)===label);
const query=(extra={})=>({origem:"operacao",op_campanha:C,op_prazo:"atrasadas",op_tarefa:TASK,...extra});
const rootPath=`/e/${T}/operacao`,campaignPath=`/e/${T}/estrategia/campanhas/${C}`;
const input=()=>{const d=new FormData();d.set("campanha",C);d.set("revisao","4");return d;};
function assertContext(url:string,extra:Record<string,string>={}){const u=new URL(url,"https://oplyra.invalid");expect(u.pathname).toBe(campaignPath);expect(u.searchParams.get("origem")).toBe("operacao");expect(u.searchParams.get("op_campanha")).toBe(C);expect(u.searchParams.get("op_prazo")).toBe("atrasadas");expect(u.searchParams.get("op_tarefa")).toBe(TASK);for(const[k,v]of Object.entries(extra))expect(u.searchParams.get(k)).toBe(v);}
async function action(fn:Function,data:FormData){await expect(fn(data)).rejects.toThrow("redirect:");return redirect.mock.calls.at(-1)![0];}
beforeEach(()=>{vi.clearAllMocks();contextoDaEmpresa.mockResolvedValue(owner);getOperationTasks.mockResolvedValue({tasks:[task()],references:[task()],campaigns:[campaign()]});getCampaign.mockResolvedValue(campaign());listCampaignTasks.mockResolvedValue([task()]);listExperiments.mockResolvedValue([]);listObjectives.mockResolvedValue([]);getBrandOverview.mockResolvedValue({current:null});getTaskDetails.mockResolvedValue({task:task(),campaign:campaign(),dependencies:[],unavailableDependencyCount:0});hojeDaOperacao.mockResolvedValue("2026-11-20");});

const taskPage=await compile("operacao/tarefas/[taskId]/page.tsx","../../../../../../");
const taskDetail=(search={},taskId=TASK)=>taskPage({params:Promise.resolve({tenantId:T,taskId}),searchParams:Promise.resolve(search)});
const taskNavigation=await import("../apps/web/src/lib/operacao-tarefa-navegacao");
const taskPath=`/e/${T}/operacao/tarefas/${TASK}`;
const readTask=(t=task(),extra={})=>getTaskDetails.mockResolvedValue({task:t,campaign:campaign(),dependencies:[],unavailableDependencyCount:0,...extra});
const dd=(tree:any,label:string)=>{const group=nodes(tree).find(n=>n.type==="div"&&Array.isArray(n.props.children)&&n.props.children.some((x:any)=>x?.type==="dt"&&text(x)===label));return text(nodes(group).find(n=>n.type==="dd"));};

describe("Detalhe oficial somente de leitura da tarefa",()=>{
  it("builder só aceita rota Task UUID e substitui a âncora pelo alvo canônico",()=>{
    const retorno=navigation.lerRetornoOperacao(query())!;
    expect(taskNavigation.linkDetalheDaTarefa(T,TASK,retorno)).toBe(`${taskPath}?origem=operacao&op_campanha=${C}&op_prazo=atrasadas&op_tarefa=${TASK}`);
    expect(taskNavigation.linkDetalheDaTarefa(T,OTHER,retorno)).toContain(`op_tarefa=${OTHER}`);
    expect(taskNavigation.linkDetalheDaTarefa(T.toUpperCase(),TASK.toUpperCase(),{...retorno,campanha:{kind:"campaign",campaignId:C.toUpperCase() as any}})).toBe(`${taskPath}?origem=operacao&op_campanha=${C}&op_prazo=atrasadas&op_tarefa=${TASK}`);
    for(const bad of["https://evil.test","//evil.test","../",`${TASK}/extra`,"",`${TASK}\n`])expect(()=>taskNavigation.linkDetalheDaTarefa(bad,TASK,retorno)).toThrow();
    expect(()=>taskNavigation.linkDetalheDaTarefa(T,"../",retorno)).toThrow();
    expect(()=>taskNavigation.linkDetalheDaTarefa(T,TASK,{...retorno,prazo:"invalid"}as any)).toThrow();
  });
  it("guard semântico confere tarefa/campanha e avulsas sem ampliar a leitura",()=>{
    const retorno=navigation.lerRetornoOperacao(query())!;
    expect(()=>taskNavigation.validarRetornoDaTarefa(retorno,task()as any)).not.toThrow();
    expect(()=>taskNavigation.validarRetornoDaTarefa(null,task()as any)).not.toThrow();
    for(const invalid of[{...retorno,tarefaId:OTHER},{...retorno,campanha:{kind:"campaign",campaignId:OTHER}},{...retorno,campanha:{kind:"unlinked"}},undefined])expect(()=>taskNavigation.validarRetornoDaTarefa(invalid as any,task()as any)).toThrow();
    expect(()=>taskNavigation.validarRetornoDaTarefa({...retorno,campanha:{kind:"unlinked"}},task({campaignId:null})as any)).not.toThrow();
  });
  it("renderiza dados autorizados e só links, sem formulários/mutações",async()=>{
    const tree=await taskDetail();const html=renderToStaticMarkup(tree);
    expect(html).toContain("Tarefa oficial");expect(dd(tree,"Descrição")).toBe("Descrição salva");expect(dd(tree,"Estado")).toBe("A fazer");expect(dd(tree,"Revisão")).toBe("2");
    expect(dd(tree,"Registro")).toContain("UTC");expect(nodes(tree).find(n=>n.type==="time"&&n.props.dateTime.includes("T")).props.dateTime).toBe("2026-11-20T12:34:00.000Z");
    expect(nodes(tree).some(n=>n.type==="form"||n.type==="button")).toBe(false);expect(nodes(tree).filter(n=>n.props?.className?.startsWith?.("selo"))).toHaveLength(1);
    expect(getTaskDetails).toHaveBeenCalledWith(expect.anything(),owner,TASK);expect(hojeDaOperacao).toHaveBeenCalledTimes(1);
  });
  it("sem origem abre Operação all com âncora; com origem conserva prazo/campanha",async()=>{
    const plain=await taskDetail();expect(links(plain,"Abrir na Operação")[0].props.href).toBe(`${rootPath}#tarefa-${TASK}`);
    const scoped=await taskDetail(query());expect(links(scoped,"Voltar à Operação")[0].props.href).toBe(`${rootPath}?campanha=${C}&prazo=atrasadas#tarefa-${TASK}`);
    expect(links(scoped,"Ver campanha")[0].props.href).toBe(`${campaignPath}?origem=operacao&op_campanha=${C}&op_prazo=atrasadas&op_tarefa=${TASK}`);
    expect(renderToStaticMarkup(scoped)).toContain("A tarefa pode ficar fora desse recorte ao voltar.");
  });
  it("ID inválido, ausente e alheio recebem o mesmo texto sem dados privados",async()=>{
    const invalid=renderToStaticMarkup(await taskDetail({},"invalid"));expect(getTaskDetails).not.toHaveBeenCalled();
    getTaskDetails.mockRejectedValue(new strategy.TaskNotFound());const hidden=renderToStaticMarkup(await taskDetail());
    for(const html of[invalid,hidden]){expect(html).toContain("Tarefa não encontrada ou indisponível nesta empresa.");expect(html).not.toContain("Tarefa oficial");expect(html).toContain(`href="${rootPath}"`);}
    expect(hojeDaOperacao).not.toHaveBeenCalled();
  });
  it("retorno malformado/repetido recusa antes do caso de uso ou metadados",async()=>{
    for(const invalid of[{op_prazo:"hoje"},query({origem:["operacao"]}),query({op_tarefa:""}),query({op_prazo:["hoje","futuros"]})])expect(renderToStaticMarkup(await taskDetail(invalid))).toContain("Contexto de retorno à Operação inválido ou indisponível.");
    expect(getTaskDetails).not.toHaveBeenCalled();expect(hojeDaOperacao).not.toHaveBeenCalled();
  });
  it("retorno para outro alvo/campanha ou avulsas incompatível recusa antes do relógio",async()=>{
    for(const invalid of[query({op_tarefa:OTHER}),query({op_campanha:OTHER}),query({op_campanha:"avulsas"})]){
      const html=renderToStaticMarkup(await taskDetail(invalid));expect(html).toContain("Contexto de retorno à Operação inválido ou indisponível.");expect(html).not.toContain("Tarefa oficial");
    }
    expect(hojeDaOperacao).not.toHaveBeenCalled();
  });
  it("responsável é Você/outra pessoa/agente/sem, sem UUID/email/agentkey exibidos",async()=>{
    for(const[assignee,label,secret]of[[null,"Sem responsável",""],[{kind:"user",userId:owner.userId},"Você",owner.userId],[{kind:"user",userId:E},"Outra pessoa",E],[{kind:"agent",agentKey:"agente-secreto"},"Agente","agente-secreto"]]as const){
      readTask(task({assignee}));const tree=await taskDetail();expect(dd(tree,"Responsável")).toBe(label);if(secret)expect(renderToStaticMarkup(tree)).not.toContain(secret);
    }
  });
  it("prazo civil e classificação reutilizam o dia autorizado, nunca alertam histórico",async()=>{
    for(const[due,state,label]of[["2026-11-19","todo","Atrasada"],["2026-11-20","in_progress","Hoje"],["2026-11-21","todo","Prazo futuro"],[null,"todo","Sem prazo"]]as const){
      readTask(task({dueDate:due,status:state}));expect(dd(await taskDetail(),"Prazo")).toContain(label);
    }
    for(const state of["done","cancelled"]){readTask(task({status:state}));expect(dd(await taskDetail(),"Prazo")).not.toContain("Atrasada");}
  });
  it("dados de calendário/registro inválidos não geram time falso e clock ausente não inventa atraso",async()=>{
    readTask(task({dueDate:"2026-02-30",createdAt:new Date(NaN)}));const invalid=await taskDetail();expect(dd(invalid,"Prazo")).toBe("Prazo indisponível");expect(dd(invalid,"Registro")).toBe("Data de registro indisponível.");expect(nodes(invalid).filter(n=>n.type==="time")).toHaveLength(0);
    readTask();hojeDaOperacao.mockResolvedValue(null);const tree=await taskDetail();expect(dd(tree,"Prazo")).toBe("19/11/2026");expect(renderToStaticMarkup(tree)).toContain("Classificação de prazos indisponível.");
  });
  it("dependências são só texto próprio/estado, desconhecida somente contagem sem ID",async()=>{
    const missing="77777777-7777-4777-8777-777777777777";readTask(task({dependsOn:[OTHER,E,missing]}),{dependencies:[task({id:OTHER,title:"Briefing",status:"done"}),task({id:E,title:"Oferta",status:"in_progress"})],unavailableDependencyCount:1});
    const tree=await taskDetail();const section=nodes(tree).find(n=>n.props?.["aria-labelledby"]==="dependencias-tarefa");const html=renderToStaticMarkup(section);
    expect(html).toContain("Briefing");expect(html).toContain("Concluída");expect(html).toContain("Oferta");expect(html).toContain("Em andamento");expect(html).toContain("1 dependência indisponível.");
    expect(html).toContain("Dependências sem conclusão");expect(html).not.toContain(missing);expect(html).not.toContain(OTHER);expect(html).not.toContain(E);expect(nodes(section).some(n=>n.type==="a")).toBe(false);
  });
  it("sem descrição/dependências/campanha exibe vazios honestos; campanha indisponível não cria link",async()=>{
    readTask(task({description:"",campaignId:null}),{campaign:null});const plain=await taskDetail();expect(dd(plain,"Descrição")).toBe("Nenhuma descrição informada.");expect(dd(plain,"Campanha")).toBe("Tarefa avulsa");expect(renderToStaticMarkup(plain)).toContain("Nenhuma dependência registrada.");
    readTask(task(),{campaign:null});const absent=await taskDetail();expect(dd(absent,"Campanha")).toBe("Campanha indisponível");expect(links(absent,"Ver campanha")).toHaveLength(0);
  });
  it("avulsa retorna seu próprio alvo no recorte avulsas sem limpar prazo",async()=>{
    readTask(task({campaignId:null}),{campaign:null});const tree=await taskDetail(query({op_campanha:"avulsas"}));expect(links(tree,"Voltar à Operação")[0].props.href).toBe(`${rootPath}?campanha=avulsas&prazo=atrasadas#tarefa-${TASK}`);
  });
  it("Leitor vê detalhe, falta de read e erros inesperados não viram dados ou falso inexistente",async()=>{
    contextoDaEmpresa.mockResolvedValue({...owner,permissions:new Set(["strategy.read"])});expect(renderToStaticMarkup(await taskDetail())).toContain("Tarefa oficial");
    getTaskDetails.mockClear();hojeDaOperacao.mockClear();contextoDaEmpresa.mockResolvedValue({...owner,permissions:new Set()});expect(renderToStaticMarkup(await taskDetail())).toContain("Sem permissão");expect(getTaskDetails).not.toHaveBeenCalled();expect(hojeDaOperacao).not.toHaveBeenCalled();
    contextoDaEmpresa.mockResolvedValue(owner);getTaskDetails.mockRejectedValue(new Error("banco indisponível"));await expect(taskDetail()).rejects.toThrow("banco indisponível");
  });
  it("Operação e campanha usam builder real com alvo e filtros; avulsas contextual não cria peritem",async()=>{
    const op=await operation({campanha:C,prazo:"atrasadas"});expect(links(op,"Ver detalhes")[0].props.href).toBe(`${taskPath}?origem=operacao&op_campanha=${C}&op_prazo=atrasadas&op_tarefa=${TASK}`);
    const campaignScoped=await detail(query());expect(links(campaignScoped,"Ver detalhes")[0].props.href).toBe(`${taskPath}?origem=operacao&op_campanha=${C}&op_prazo=atrasadas&op_tarefa=${TASK}`);
    const legacy=await detail();expect(links(legacy,"Ver detalhes")[0].props.href).toBe(`${taskPath}?origem=operacao&op_campanha=${C}&op_prazo=todas&op_tarefa=${TASK}`);
    expect(links(await detail(query({op_campanha:"avulsas",op_tarefa:undefined})),"Ver detalhes")).toHaveLength(0);
  });
  it("conteúdo e responsável não escapam via HTML ou metadados de contexto",async()=>{
    readTask(task({title:"<script>Nome</script>",description:"<img onerror=segredo>"}));const html=renderToStaticMarkup(await taskDetail());expect(html).toContain("&lt;script&gt;Nome&lt;/script&gt;");expect(html).toContain("&lt;img onerror=segredo&gt;");expect(html).not.toContain("<script>");expect(html).not.toContain("<img onerror");
  });
});
