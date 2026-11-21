// Ambas as páginas reais + adapter real com UUIDs válidos. Portas controladas, sem Auth/SQL hospedados.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
const requireWeb=createRequire(new URL("../apps/web/package.json",import.meta.url));
const React=requireWeb("react"),{renderToStaticMarkup}=requireWeb("react-dom/server"),{transform,loadBindings}=requireWeb("next/dist/build/swc");
await loadBindings();
const strategy=await import("../apps/web/src/lib/estrategia"),form=await import("../apps/web/src/lib/estrategia-form"),navigation=await import("../apps/web/src/lib/operacao-navegacao");
const T="11111111-1111-4111-8111-111111111111",C="22222222-2222-4222-8222-222222222222",TASK="33333333-3333-4333-8333-333333333333",OTHER="44444444-4444-4444-8444-444444444444",E="55555555-5555-4555-8555-555555555555";
const owner={tenantId:T,userId:"pessoa",permissions:new Set(["strategy.read","strategy.write"])};
const contextoDaEmpresa=vi.fn(),getOperationTasks=vi.fn(),getCampaign=vi.fn(),listCampaignTasks=vi.fn(),listExperiments=vi.fn(),listObjectives=vi.fn(),getBrandOverview=vi.fn(),revalidatePath=vi.fn();
const redirect=vi.fn((url:string):never=>{throw new Error(`redirect:${url}`);});
const saveCampaignDraft=vi.fn(),activateCampaign=vi.fn(),pauseCampaign=vi.fn(),resumeCampaign=vi.fn(),completeCampaign=vi.fn(),cancelCampaign=vi.fn(),planExperiment=vi.fn(),startExperiment=vi.fn(),concludeExperiment=vi.fn(),cancelExperiment=vi.fn();
const methods=Object.fromEntries(strategy.ELEMENTOS_DO_METODO.map(k=>[k,"Método existente"]));
const campaign=(extra={})=>({id:C,tenantId:T,name:"Campanha oficial",status:"active",revision:4,trackingKey:"campanha-oficial",objectiveId:null,productKey:null,method:methods,createdAt:new Date("2026-11-20T12:00:00Z"),activatedAt:null,...extra});
const task=(extra={})=>({id:TASK,tenantId:T,campaignId:C,title:"Tarefa oficial",description:"Descrição salva",status:"todo",dueDate:"2026-11-19",dependsOn:[],revision:2,assignee:null,...extra});
const domain={...strategy,getOperationTasks,getCampaign,listCampaignTasks,listExperiments,listObjectives,saveCampaignDraft,activateCampaign,pauseCampaign,resumeCampaign,completeCampaign,cancelCampaign,planExperiment,startExperiment,concludeExperiment,cancelExperiment};
async function compile(path:string,depth:string){
  const source=readFileSync(new URL(`../apps/web/src/app/e/[tenantId]/${path}`,import.meta.url),"utf8");
  const compiled=await transform(source,{filename:path,jsc:{parser:{syntax:"typescript",tsx:true},transform:{react:{runtime:"classic"}}},module:{type:"commonjs"}});
  const modules:Record<string,unknown>={"next/link":({href,children,...props}:any)=>React.createElement("a",{href,...props},children),"next/navigation":{redirect},"next/cache":{revalidatePath},"@oplyra/core/brand":{getBrandOverview}};
  for(const[name,value]of Object.entries({"lib/session":{contextoDaEmpresa},"lib/deps-estrategia":{strategyDeps:{}},"lib/deps-marca":{brandDeps:{}},"lib/estrategia":domain,"lib/estrategia-form":form,"lib/operacao-filtro":await import("../apps/web/src/lib/operacao-filtro"),"lib/operacao-navegacao":navigation,"lib/operacao-prazos":{hojeDaOperacao:async()=>"2026-11-20"},"components/tarefa-destino":{TarefaDestino:()=>null},"components/botao-enviar":{BotaoEnviar:({children}:any)=>React.createElement("button",{type:"submit"},children)},"components/aviso-estrategia":{AvisoDeErro:()=>null,AvisoSemPermissao:()=>React.createElement("p",null,"Sem permissão")}}))modules[`${depth}${name}`]=value;
  modules[path.startsWith("operacao")?"./operacao.module.css":"./campanha-detalhe.module.css"]={__esModule:true,default:{}};
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
beforeEach(()=>{vi.clearAllMocks();contextoDaEmpresa.mockResolvedValue(owner);getOperationTasks.mockResolvedValue({tasks:[task()],references:[task()],campaigns:[campaign()]});getCampaign.mockResolvedValue(campaign());listCampaignTasks.mockResolvedValue([task()]);listExperiments.mockResolvedValue([]);listObjectives.mockResolvedValue([]);getBrandOverview.mockResolvedValue({current:null});});

describe("Operação ↔ campanha oficial — contexto de retorno tipado",()=>{
  it("cartão conserva origem all e tarefa; header de campanha conserva filtros sem inventar âncora",async()=>{
    const all=await operation();const allLink=links(all,"Ver campanha")[0];
    expect(allLink.props.href).toBe(`${campaignPath}?origem=operacao&op_campanha=todas&op_prazo=todas&op_tarefa=${TASK}`);
    const filtered=await operation({campanha:C,prazo:"atrasadas"});
    expect(links(filtered,"Ver campanha selecionada")[0].props.href).toBe(`${campaignPath}?origem=operacao&op_campanha=${C}&op_prazo=atrasadas`);
    expect(links(filtered,"Ver campanha")[0].props.href).toBe(`${campaignPath}?origem=operacao&op_campanha=${C}&op_prazo=atrasadas&op_tarefa=${TASK}`);
  });
  it("campanha devolve os filtros e âncora originais, inclusive all canônico",async()=>{
    const selected=await detail(query());
    expect(links(selected,"Voltar à Operação")[0].props.href).toBe(`${rootPath}?campanha=${C}&prazo=atrasadas#tarefa-${TASK}`);
    expect(links(selected,"Abrir Operação")[0].props.href).toBe(links(selected,"Voltar à Operação")[0].props.href);
    const all=await detail(query({op_campanha:"todas",op_prazo:"todas"}));
    expect(links(all,"Voltar à Operação")[0].props.href).toBe(`${rootPath}#tarefa-${TASK}`);
  });
  it("sem origem preserva URLs antigas e não oferece retorno novo",async()=>{
    const tree=await detail();expect(links(tree,"Voltar à Operação")).toHaveLength(0);
    expect(links(tree,"Abrir Operação")[0].props.href).toBe(`${rootPath}?campanha=${C}`);
    expect(links(tree,"Ver na Operação")[0].props.href).toBe(`${rootPath}?campanha=${C}#tarefa-${TASK}`);
  });
  it("retorno parcial/malformado/duplicado recusa antes de qualquer leitura de negócio",async()=>{
    for(const invalid of[{op_prazo:"hoje"},query({origem:["operacao"]}),query({op_prazo:["hoje","futuros"]}),query({op_tarefa:""}),query({op_campanha:"https://evil.invalid"})]){
      const html=renderToStaticMarkup(await detail(invalid));expect(html).toContain("Contexto de retorno à Operação inválido ou indisponível.");expect(html).not.toContain("Campanha oficial");
    }
    expect(getCampaign).not.toHaveBeenCalled();expect(listCampaignTasks).not.toHaveBeenCalled();expect(listExperiments).not.toHaveBeenCalled();expect(listObjectives).not.toHaveBeenCalled();
  });
  it("retorno de outra campanha ou tarefa indisponível/foreign não oferece links nem leituras auxiliares",async()=>{
    for(const invalid of[query({op_campanha:OTHER}),query({op_tarefa:OTHER}),query({op_campanha:"avulsas"})]){
      const html=renderToStaticMarkup(await detail(invalid));expect(html).toContain("Contexto de retorno à Operação inválido ou indisponível.");expect(html).not.toContain("Voltar à Operação");expect(html).not.toContain("Tarefa oficial");
    }
    expect(listExperiments).not.toHaveBeenCalled();expect(listObjectives).not.toHaveBeenCalled();expect(getBrandOverview).not.toHaveBeenCalled();
  });
  it("header sem tarefa permite campanha vazia e retorna filtros sem hash falso",async()=>{
    listCampaignTasks.mockResolvedValue([]);const tree=await detail(query({op_tarefa:undefined}));
    expect(links(tree,"Voltar à Operação")[0].props.href).toBe(`${rootPath}?campanha=${C}&prazo=atrasadas`);
  });
  it("peritem muda só a âncora, sem apagar prazo que exclua a tarefa, e avisa o recorte",async()=>{
    listCampaignTasks.mockResolvedValue([task(),task({id:OTHER,title:"Tarefa futura",dueDate:"2026-11-21"})]);const tree=await detail(query());
    expect(links(tree,"Ver na Operação").map(n=>n.props.href)).toEqual([`${rootPath}?campanha=${C}&prazo=atrasadas#tarefa-${TASK}`,`${rootPath}?campanha=${C}&prazo=atrasadas#tarefa-${OTHER}`]);
    expect(renderToStaticMarkup(tree)).toContain("Tarefas fora desse recorte não aparecerão ao voltar.");
  });
  it("avulsas sem âncora mantém retorno e suprime links peritem impossíveis",async()=>{
    const tree=await detail(query({op_campanha:"avulsas",op_tarefa:undefined}));
    expect(renderToStaticMarkup(tree)).toContain("Tarefa oficial");expect(links(tree,"Ver na Operação")).toHaveLength(0);
    expect(links(tree,"Voltar à Operação")[0].props.href).toBe(`${rootPath}?campanha=avulsas&prazo=atrasadas`);
    expect(links(tree,"Abrir Operação")[0].props.href).toBe(`${rootPath}?campanha=avulsas&prazo=atrasadas`);
  });
  it("GET de UTM conserva as quatro chaves de retorno e omite tarefa quando ausente",async()=>{
    const tree=await detail(query());const utmForm=nodes(tree).find(n=>n.type==="form"&&n.props.method==="get");
    const fields=Object.fromEntries(nodes(utmForm).filter(n=>n.type==="input"&&n.props.type==="hidden").map(n=>[n.props.name,n.props.value]));expect(fields).toEqual(query());
    const noAnchor=await detail(query({op_tarefa:undefined}));const formNoAnchor=nodes(noAnchor).find(n=>n.type==="form"&&n.props.method==="get");expect(nodes(formNoAnchor).some(n=>n.props?.name==="op_tarefa")).toBe(false);
  });
  it("salvar/erros preservam retorno bound e revalidam só pathname",async()=>{
    getCampaign.mockResolvedValue(campaign({status:"draft"}));const tree=await detail(query());const save=nodes(tree).find(n=>n.type==="form"&&nodes(n).some(f=>f.props?.name==="trackingKey"));
    const data=input();data.set("name","Campanha salva");data.set("trackingKey","campanha-oficial");data.set("op_prazo","hoje");
    assertContext(await action(save.props.action,data),{ok:"salvo"});expect(revalidatePath).toHaveBeenCalledWith(campaignPath);
    saveCampaignDraft.mockRejectedValueOnce({code:"CONFLICT_VERSION"});assertContext(await action(save.props.action,data),{erro:"CONFLICT_VERSION"});
  });
  it("todas as transições de campanha refazem identidade e mantêm retorno",async()=>{
    for(const[state,label,mock]of[["draft","Ativar",activateCampaign],["active","Pausar",pauseCampaign],["paused","Retomar",resumeCampaign],["active","Concluir",completeCampaign],["active","Cancelar campanha",cancelCampaign]]as const){
      getCampaign.mockResolvedValue(campaign({status:state}));const tree=await detail(query());const button=nodes(tree).find(n=>n.type==="button"&&text(n)===label);const fresh={...owner,userId:`fresh-${state}`};contextoDaEmpresa.mockResolvedValueOnce(fresh);
      assertContext(await action(button.props.formAction,input()),{ok:"estado"});expect(mock).toHaveBeenLastCalledWith(expect.anything(),expect.objectContaining({ctx:fresh,campaignId:C,expectedRevision:4}));
    }
    expect(revalidatePath.mock.calls.every(([path])=>path===campaignPath)).toBe(true);
  });
  it("planejar/iniciar/concluir/cancelar testes e suas recusas conservam retorno",async()=>{
    const planned={id:E,status:"planned",revision:2,plan:{hypothesis:"Hipótese",dimension:"hook",dimensionNote:"",variants:["A","B"],decisionMetric:"Reuniões",minimumSample:10},result:null,learning:null};
    for(const[state,label,mock]of[["planned","Iniciar",startExperiment],["running","Concluir",concludeExperiment],["planned","Cancelar teste",cancelExperiment]]as const){
      listExperiments.mockResolvedValue([{...planned,status:state}]);const tree=await detail(query());const region=nodes(tree).find(n=>n.props?.["aria-labelledby"]==="testes");const button=nodes(region).find(n=>n.type==="button"&&text(n)===label);const d=input();d.set("teste",E);d.set("revisao","2");d.set("outcome","inconclusive");d.set("observedSample","5");
      assertContext(await action(button.props.formAction,d),{ok:"teste"});expect(mock).toHaveBeenCalled();
      mock.mockRejectedValueOnce({code:"CONFLICT_VERSION"});assertContext(await action(button.props.formAction,d),{erro:"CONFLICT_VERSION"});
    }
    listExperiments.mockResolvedValue([]);const tree=await detail(query());const plan=nodes(tree).find(n=>n.type==="form"&&nodes(n).some(f=>f.props?.name==="hypothesis"));const d=input();d.set("hypothesis","Hipótese");d.set("dimension","hook");d.set("variants","A\nB");d.set("decisionMetric","Reuniões");d.set("minimumSample","10");
    assertContext(await action(plan.props.action,d),{ok:"teste"});expect(planExperiment).toHaveBeenCalled();
    planExperiment.mockRejectedValueOnce({code:"CONFLICT_VERSION"});assertContext(await action(plan.props.action,d),{erro:"CONFLICT_VERSION"});
  });
  it("Viewer recebe retorno sem transições e permissão ausente recusa antes da leitura",async()=>{
    contextoDaEmpresa.mockResolvedValue({...owner,permissions:new Set(["strategy.read"])});const tree=await detail(query());expect(links(tree,"Voltar à Operação")).toHaveLength(1);expect(nodes(tree).some(n=>n.props?.formAction)).toBe(false);
    getCampaign.mockClear();listCampaignTasks.mockClear();contextoDaEmpresa.mockResolvedValue({...owner,permissions:new Set()});expect(renderToStaticMarkup(await detail(query()))).toContain("Sem permissão");expect(getCampaign).not.toHaveBeenCalled();expect(listCampaignTasks).not.toHaveBeenCalled();
  });
});
