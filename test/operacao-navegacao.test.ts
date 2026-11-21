import { describe, expect, it } from "vitest";
import type { TaskId, CampaignId } from "../packages/core/src/domain/ids.ts";
import type { Task } from "../apps/web/src/lib/estrategia";
import { lerRetornoOperacao, manterRetornoOperacao, destinoRetornoOperacao, linkCampanhaDaOperacao, validarRetornoDaCampanha, type RetornoOperacao } from "../apps/web/src/lib/operacao-navegacao";
const A="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", C="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", T="cccccccc-cccc-4ccc-8ccc-cccccccccccc", OTHER="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const query={origem:"operacao",op_campanha:C,op_prazo:"atrasadas",op_tarefa:T};
const retorno:RetornoOperacao={campanha:{kind:"campaign",campaignId:C as CampaignId},prazo:"overdue",tarefaId:T as TaskId};
const path=`/e/${A}/estrategia/campanhas/${C}`;
const task={id:T,campaignId:C} as Task;
const bad=(fn:()=>unknown)=>expect(fn).toThrow(expect.objectContaining({message:"retorno"}));

describe("Navegação tipada entre Operação e campanha",()=>{
  it("sem contexto conserva navegação normal, incluindo propriedades undefined",()=>{
    expect(lerRetornoOperacao({})).toBeNull();expect(lerRetornoOperacao({origem:undefined,op_campanha:undefined,op_prazo:undefined,op_tarefa:undefined})).toBeNull();
    expect(manterRetornoOperacao(`${path}?ok=salva#metodo`,null)).toBe(`${path}?ok=salva#metodo`);
    expect(manterRetornoOperacao(`/e/empresa-a/estrategia/campanhas/${C}?ok=salva`,null)).toContain("/e/empresa-a/");
    expect(()=>validarRetornoDaCampanha(null,"id-legado",[])).not.toThrow();
  });
  it("parseia campos canônicos e normaliza UUIDs, tarefa é opcional sem campo vazio",()=>{
    expect(lerRetornoOperacao({...query,op_campanha:C.toUpperCase(),op_tarefa:T.toUpperCase()})).toEqual(retorno);
    expect(lerRetornoOperacao({origem:"operacao",op_campanha:"todas",op_prazo:"todas"})).toEqual({campanha:{kind:"all"},prazo:"all",tarefaId:null});
    expect(lerRetornoOperacao({origem:"operacao",op_campanha:"avulsas",op_prazo:"sem-prazo"})).toEqual({campanha:{kind:"unlinked"},prazo:"undated",tarefaId:null});
  });
  it("recusa origem/campos parciais, URL arbitrária, vazios e tipos/arrays",()=>{
    for(const value of [{origem:"operacao"},{op_prazo:"hoje"},{...query,origem:"https://externo.test"},{...query,op_campanha:""},{...query,op_prazo:""},{...query,op_tarefa:""},{...query,op_tarefa:null},{...query,op_tarefa:"https://externo.test"},{...query,op_campanha:[C]},{...query,op_prazo:["hoje"]},{...query,origem:["operacao"]},{...query,op_tarefa:[T]},{...query,op_prazo:"constructor"},{...query,op_prazo:"__proto__"},{...query,op_campanha:0}])bad(()=>lerRetornoOperacao(value));
    bad(()=>lerRetornoOperacao(Object.create(query)));bad(()=>lerRetornoOperacao(null as any));
  });
  it("constrói apenas rota local e retorno preserva filtro/hash UUID sem URL livre",()=>{
    expect(linkCampanhaDaOperacao(A,C,retorno)).toBe(`${path}?origem=operacao&op_campanha=${C}&op_prazo=atrasadas&op_tarefa=${T}`);
    expect(destinoRetornoOperacao(A,retorno)).toBe(`/e/${A}/operacao?campanha=${C}&prazo=atrasadas#tarefa-${T}`);
    expect(destinoRetornoOperacao(A,{campanha:{kind:"all"},prazo:"all",tarefaId:null})).toBe(`/e/${A}/operacao`);
    expect(destinoRetornoOperacao(A,{campanha:{kind:"unlinked"},prazo:"undated",tarefaId:null})).toBe(`/e/${A}/operacao?campanha=avulsas&prazo=sem-prazo`);
  });
  it("preserva outros parâmetros e fragmentos, substituindo opquery sem duplicação",()=>{
    const value=manterRetornoOperacao(`${path}?erro=CONFLICT_VERSION&origem=errada&op_campanha=ruim&op_prazo=ruim&op_tarefa=ruim&op_tarefa=duplicada#metodo`,retorno);
    const url=new URL(value,"https://oplyra.invalid");expect(url.searchParams.get("erro")).toBe("CONFLICT_VERSION");expect(url.hash).toBe("#metodo");
    for(const key of ["origem","op_campanha","op_prazo","op_tarefa"])expect(url.searchParams.getAll(key)).toHaveLength(1);
    expect(manterRetornoOperacao(path,{...retorno,tarefaId:null})).not.toContain("op_tarefa");
  });
  it("destino externo/protocolrelative/controles/traversal/barras é recusado com e sem contexto",()=>{
    for(const destination of [`https://externo.test${path}`,`//externo.test${path}`,`\\externo.test${path}`,`${path}\n`,`/e/${A}/../estrategia/campanhas/${C}`,`/e/${A}/estrategia/campanhas/%2e%2e`,`/e/${A}/estrategia/campanhas/${C}/extra`,`/e/${A}/operacao`,`/e/empresa.a/estrategia/campanhas/${C}`])for(const context of [retorno,null])bad(()=>manterRetornoOperacao(destination,context));
    bad(()=>manterRetornoOperacao(`/e/empresa-a/estrategia/campanhas/${C}`,retorno));
  });
  it("builders e shape adulterado recusam IDs ou tipos não autorizados sem fallback",()=>{
    bad(()=>linkCampanhaDaOperacao("empresa-a",C,retorno));bad(()=>linkCampanhaDaOperacao(A,"../../",retorno));bad(()=>destinoRetornoOperacao("https://externo.test",retorno));
    for(const context of [null,{}, {...retorno,prazo:"constructor"},{...retorno,campanha:{kind:"unknown"}},{...retorno,tarefaId:"bad"},{...retorno,campanha:{kind:"campaign",campaignId:"bad"}},Object.create(retorno)])bad(()=>destinoRetornoOperacao(A,context as any));
  });
  it("guard é neutro sem tarefa e exige mesma campanha e tarefa vinculada na lista atual",()=>{
    expect(()=>validarRetornoDaCampanha(retorno,C,[task])).not.toThrow();
    expect(()=>validarRetornoDaCampanha({...retorno,tarefaId:null,campanha:{kind:"all"}},C,[])).not.toThrow();
    bad(()=>validarRetornoDaCampanha(retorno,OTHER,[task]));bad(()=>validarRetornoDaCampanha({...retorno,tarefaId:null},OTHER,[]));bad(()=>validarRetornoDaCampanha(retorno,C,[]));
    bad(()=>validarRetornoDaCampanha(retorno,C,[{...task,campaignId:OTHER} as Task]));
    bad(()=>validarRetornoDaCampanha({...retorno,campanha:{kind:"unlinked"}},C,[task]));
  });
  it("não modifica contexto nem lista e nunca promove retorno a autorização",()=>{
    const context=Object.freeze({...retorno,campanha:Object.freeze(retorno.campanha)});const tasks=Object.freeze([Object.freeze(task)]);const before=structuredClone(context);
    validarRetornoDaCampanha(context,C,tasks);manterRetornoOperacao(path,context);destinoRetornoOperacao(A,context);
    expect(context).toEqual(before);expect(tasks).toEqual([task]);
  });
});
