import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as taskNavigation from "../apps/web/src/lib/operacao-tarefa-navegacao";
import * as operationNavigation from "../apps/web/src/lib/operacao-navegacao";
import * as strategy from "../apps/web/src/lib/estrategia";
import * as form from "../apps/web/src/lib/estrategia-form";
const requireWeb=createRequire(new URL("../apps/web/package.json",import.meta.url));
const React=requireWeb("react"),{renderToStaticMarkup}=requireWeb("react-dom/server"),{transform,loadBindings}=requireWeb("next/dist/build/swc");
await loadBindings();
const TENANT="11111111-1111-4111-8111-111111111111",ROOT="22222222-2222-4222-8222-222222222222",DEP="33333333-3333-4333-8333-333333333333",LEAF="44444444-4444-4444-8444-444444444444",CAMP="55555555-5555-4555-8555-555555555555",OTHER_CAMP="66666666-6666-4666-8666-666666666666";
const ctx={tenantId:TENANT,userId:"77777777-7777-4777-8777-777777777777",permissions:new Set(["strategy.read"])};
const task=(extra={})=>({id:ROOT,tenantId:TENANT,campaignId:CAMP,title:"Tarefa raiz",description:"Descrição autorizada",status:"todo",dueDate:null,dependsOn:[],revision:3,assignee:null,createdAt:new Date("2026-11-21T00:00:00Z"),...extra});
const root=()=>task({dependsOn:[DEP]});
const dep=()=>task({id:DEP,campaignId:OTHER_CAMP,title:"Dependência outra campanha",dependsOn:[LEAF]});
const leaf=()=>task({id:LEAF,campaignId:null,title:"Dependência avulsa"});
const query=(extra={})=>({origem:"operacao",op_campanha:CAMP,op_prazo:"sem-prazo",op_tarefa:ROOT,...extra});
const retorno=()=>operationNavigation.lerRetornoOperacao(query())!;
const path=(id:string)=>`/e/${TENANT}/operacao/tarefas/${id}`;
const getTaskDetails=vi.fn(),getTaskDependencyDetails=vi.fn(),contextoDaEmpresa=vi.fn(),hojeDaOperacao=vi.fn();
const source=readFileSync(new URL("../apps/web/src/app/e/[tenantId]/operacao/tarefas/[taskId]/page.tsx",import.meta.url),"utf8");
const compiled=await transform(source,{filename:"page.tsx",jsc:{parser:{syntax:"typescript",tsx:true},transform:{react:{runtime:"classic"}}},module:{type:"commonjs"}});
const prefix="../../../../../../",modules:Record<string,unknown>={"./tarefa-detalhe.module.css":{__esModule:true,default:{}}};
for(const[name,value]of Object.entries({"lib/session":{contextoDaEmpresa},"lib/deps-estrategia":{strategyDeps:{}},"lib/estrategia":{...strategy,getTaskDetails,getTaskDependencyDetails},"lib/estrategia-form":form,"lib/operacao-prazos":{hojeDaOperacao},"lib/operacao-navegacao":operationNavigation,"lib/operacao-tarefa-navegacao":taskNavigation,"components/aviso-estrategia":{AvisoSemPermissao:()=>React.createElement("p",null,"Sem permissão")}}))modules[prefix+name]=value;
const exported:{default?:(props:unknown)=>Promise<unknown>}={};
new Function("require","exports","React",compiled.code)((name:string)=>{if(!(name in modules))throw new Error(`Import inesperado: ${name}`);return modules[name];},exported,React);
const page=(q:unknown={},id=ROOT)=>exported.default!({params:Promise.resolve({tenantId:TENANT,taskId:id}),searchParams:Promise.resolve(q)});
function nodes(el:any):any[]{if(!el||typeof el!=="object")return[];if(Array.isArray(el))return el.flatMap(nodes);return[el,...nodes(el.props?.children)];}
function text(el:any):string{if(Array.isArray(el))return el.map(text).join("");if(typeof el==="string"||typeof el==="number")return String(el);return el?.props?text(el.props.children):"";}
const link=(tree:unknown,label:string)=>nodes(tree).filter(n=>n.type==="a"&&text(n)===label);
function read(origin=root(),target=dep(),dependencies=[leaf()],campaign:unknown={id:OTHER_CAMP,name:"Outra campanha"}){getTaskDependencyDetails.mockResolvedValue({originTask:origin,task:target,campaign,dependencies,unavailableDependencyCount:0});}
beforeEach(()=>{vi.clearAllMocks();contextoDaEmpresa.mockResolvedValue(ctx);hojeDaOperacao.mockResolvedValue("2026-11-21");getTaskDetails.mockResolvedValue({task:root(),campaign:{id:CAMP,name:"Campanha origem"},dependencies:[dep()],unavailableDependencyCount:0});read();});

describe("Navegação entre dependências preserva a origem",()=>{
  it("lê só uma origem UUID própria, normaliza e recusa duplicação/vazio/URL",()=>{
    expect(taskNavigation.lerTarefaOrigem({})).toBeNull();expect(taskNavigation.lerTarefaOrigem({tarefa_origem:ROOT.toUpperCase()})).toBe(ROOT);
    for(const value of["",null,[ROOT],{},"https://externo.test",ROOT+"\n","../",42])expect(()=>taskNavigation.lerTarefaOrigem({tarefa_origem:value})).toThrow(form.FormularioInvalido);
    expect(()=>taskNavigation.lerTarefaOrigem(Object.create({tarefa_origem:ROOT}))).toThrow();
  });
  it("constrói rota fechada da dependência mantendo os quatro campos da origem",()=>{
    const url=new URL(taskNavigation.linkDetalheDaDependencia(TENANT,DEP,ROOT,retorno()),"https://oplyra.invalid");
    expect(url.pathname).toBe(path(DEP));expect(Object.fromEntries(url.searchParams)).toEqual({...query(),tarefa_origem:ROOT});expect(url.hash).toBe("");
    expect(taskNavigation.linkTarefaDeOrigem(TENANT,ROOT,retorno())).toBe(`${path(ROOT)}?${new URLSearchParams(query())}`);
  });
  it("origem sem recorte continua sem recorte e não inventa query de Operação",()=>{
    expect(taskNavigation.linkDetalheDaDependencia(TENANT,DEP,ROOT,null)).toBe(`${path(DEP)}?tarefa_origem=${ROOT}`);
    expect(taskNavigation.linkTarefaDeOrigem(TENANT,ROOT,null)).toBe(path(ROOT));
  });
  it("construtor recusa segmentos/IDs/contextos malformados sem aceitar destino livre",()=>{
    for(const bad of["",ROOT+"/extra","//host.test","../",ROOT+"\n"]){expect(()=>taskNavigation.linkDetalheDaDependencia(bad,DEP,ROOT,null)).toThrow();expect(()=>taskNavigation.linkDetalheDaDependencia(TENANT,bad,ROOT,null)).toThrow();expect(()=>taskNavigation.linkDetalheDaDependencia(TENANT,DEP,bad,null)).toThrow();}
    expect(()=>taskNavigation.linkDetalheDaDependencia(TENANT,DEP,ROOT,{...retorno(),prazo:"invalid"}as any)).toThrow();
  });
  it("tarefa raiz mantém leitura existente e links próprios com a origem exata",async()=>{
    const tree=await page(query());expect(getTaskDetails).toHaveBeenCalledWith(expect.anything(),ctx,ROOT);expect(getTaskDependencyDetails).not.toHaveBeenCalled();
    expect(link(tree,"Dependência outra campanha")[0].props.href).toBe(`${path(DEP)}?${new URLSearchParams(query())}&tarefa_origem=${ROOT}`);
    expect(link(tree,"Voltar à tarefa de origem")).toHaveLength(0);
  });
  it("dependência de outra campanha usa UC específico e valida filtro contra raiz",async()=>{
    const tree=await page({...query(),tarefa_origem:ROOT},DEP);expect(getTaskDetails).not.toHaveBeenCalled();expect(getTaskDependencyDetails).toHaveBeenCalledWith(expect.anything(),ctx,ROOT,DEP);
    expect(link(tree,"Voltar à Operação")[0].props.href).toBe(`/e/${TENANT}/operacao?campanha=${CAMP}&prazo=sem-prazo#tarefa-${ROOT}`);
    expect(link(tree,"Voltar à tarefa de origem")[0].props.href).toBe(`${path(ROOT)}?${new URLSearchParams(query())}`);
    expect(link(tree,"Dependência avulsa")[0].props.href).toBe(`${path(LEAF)}?${new URLSearchParams(query())}&tarefa_origem=${ROOT}`);
    expect(renderToStaticMarkup(tree)).toContain("Origem: Tarefa raiz");expect(link(tree,"Ver campanha")).toHaveLength(0);expect(renderToStaticMarkup(tree)).toContain("Campanha diferente da origem");
  });
  it("filtro all também não cria link de campanha incompatível com âncora da raiz",async()=>{
    const tree=await page({...query({op_campanha:"todas"}),tarefa_origem:ROOT},DEP);expect(link(tree,"Ver campanha")).toHaveLength(0);expect(link(tree,"Voltar à Operação")[0].props.href).toBe(`/e/${TENANT}/operacao?prazo=sem-prazo#tarefa-${ROOT}`);
  });
  it("campanha compartilhada permite link com contexto original",async()=>{
    read(root(),task({id:DEP,dependsOn:[],title:"Mesma campanha"}),[],{id:CAMP,name:"Campanha origem"});const tree=await page({...query(),tarefa_origem:ROOT},DEP);
    expect(link(tree,"Ver campanha")[0].props.href).toBe(`/e/${TENANT}/estrategia/campanhas/${CAMP}?${new URLSearchParams(query())}`);
  });
  it("segunda dependência avulsa conserva raiz e filtros sem exigir campanha do alvo",async()=>{
    read(root(),leaf(),[],null);const tree=await page({...query(),tarefa_origem:ROOT},LEAF);expect(renderToStaticMarkup(tree)).toContain("Tarefa avulsa");expect(link(tree,"Voltar à Operação")[0].props.href).toContain(`#tarefa-${ROOT}`);expect(getTaskDependencyDetails).toHaveBeenCalledWith(expect.anything(),ctx,ROOT,LEAF);
  });
  it("sem filtro, dependência ainda retorna à raiz e ao cartão original all",async()=>{
    const tree=await page({tarefa_origem:ROOT},DEP);expect(link(tree,"Voltar à tarefa de origem")[0].props.href).toBe(path(ROOT));expect(link(tree,"Abrir na Operação")[0].props.href).toBe(`/e/${TENANT}/operacao#tarefa-${ROOT}`);
  });
  it("origem avulsa pode abrir dependência de campanha preservando avulsas",async()=>{
    read(task({campaignId:null}),dep());const tree=await page({...query({op_campanha:"avulsas"}),tarefa_origem:ROOT},DEP);expect(link(tree,"Voltar à Operação")[0].props.href).toBe(`/e/${TENANT}/operacao?campanha=avulsas&prazo=sem-prazo#tarefa-${ROOT}`);expect(link(tree,"Ver campanha")).toHaveLength(0);
  });
  it("origem malformada ou repetida recusa antes das consultas e da data",async()=>{
    for(const value of["",[ROOT],"https://evil.test",null]){const tree=await page({...query(),tarefa_origem:value},DEP);expect(renderToStaticMarkup(tree)).toContain("Contexto de retorno à Operação inválido ou indisponível.");}
    expect(getTaskDetails).not.toHaveBeenCalled();expect(getTaskDependencyDetails).not.toHaveBeenCalled();expect(hojeDaOperacao).not.toHaveBeenCalled();
  });
  it("filtro incompatível com raiz é recusado mesmo se compatível com dependência",async()=>{
    const tree=await page({...query({op_campanha:OTHER_CAMP,op_tarefa:DEP}),tarefa_origem:ROOT},DEP);const html=renderToStaticMarkup(tree);expect(html).toContain("Contexto de retorno à Operação inválido ou indisponível.");expect(html).not.toContain("Descrição autorizada");expect(hojeDaOperacao).not.toHaveBeenCalled();
  });
  it("origem/alvo desconexo, inexistente ou alheio tem mesma recusa sem metadados",async()=>{
    getTaskDependencyDetails.mockRejectedValue(new strategy.TaskNotFound());const tree=await page({...query(),tarefa_origem:ROOT},DEP);const html=renderToStaticMarkup(tree);expect(html).toContain("Tarefa não encontrada ou indisponível nesta empresa.");expect(html).not.toContain("Tarefa raiz");expect(html).not.toContain("Descrição autorizada");expect(hojeDaOperacao).not.toHaveBeenCalled();
  });
  it("sem permissão não consulta origem nem tarefa nem relógio",async()=>{
    contextoDaEmpresa.mockResolvedValue({...ctx,permissions:new Set()});await page({...query(),tarefa_origem:ROOT},DEP);expect(getTaskDetails).not.toHaveBeenCalled();expect(getTaskDependencyDetails).not.toHaveBeenCalled();expect(hojeDaOperacao).not.toHaveBeenCalled();
  });
  it("falhas inesperadas propagam ao error boundary em vez de fabricar vazio",async()=>{
    getTaskDependencyDetails.mockRejectedValue(new Error("indisponibilidade"));await expect(page({...query(),tarefa_origem:ROOT},DEP)).rejects.toThrow("indisponibilidade");
  });
  it("referência indisponível só informa contagem, sem criar link ou vazar ID",async()=>{
    read(root(),dep(),[],null);getTaskDependencyDetails.mockResolvedValueOnce({originTask:root(),task:dep(),campaign:null,dependencies:[],unavailableDependencyCount:1});const tree=await page({...query(),tarefa_origem:ROOT},DEP);const section=nodes(tree).find(n=>n.props?.["aria-labelledby"]==="dependencias-tarefa");expect(text(section)).toContain("1 dependência indisponível.");expect(nodes(section).filter(n=>n.type==="a")).toHaveLength(0);expect(renderToStaticMarkup(section)).not.toContain(LEAF);
  });
});
