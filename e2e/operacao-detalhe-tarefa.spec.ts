// Detalhe real com fixtures/Auth exclusivamente no banco descartável da CI.
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { entrar, TENANT_A, TENANT_B } from "./ajuda";
const suffix=randomUUID().slice(0,8),operation=`/e/${TENANT_A}/operacao`;
const names={main:`Detalhe tarefa ${suffix}`,done:`Detalhe briefing ${suffix}`,pending:`Detalhe oferta ${suffix}`,loose:`Detalhe avulsa ${suffix}`,beta:`Detalhe Beta ${suffix}`};
let campaignPath="",campaignId="",mainId="",doneId="",pendingId="",looseId="",betaId="";
const card=(page:Page,title:string)=>page.locator("li").filter({has:page.getByRole("heading",{level:3,name:title,exact:true})});
const data=(page:Page)=>page.getByRole("region",{name:"Dados da tarefa",exact:true});
const dependencies=(page:Page)=>page.getByRole("region",{name:"Dependências da tarefa",exact:true});
const field=(page:Page,label:string)=>data(page).locator("dt").filter({hasText:new RegExp(`^${label}$`)}).locator("..").locator("dd");
const path=(tenant:string,id:string)=>`/e/${tenant}/operacao/tarefas/${id}`;
const context=(id:string=mainId,campaign:string=campaignId)=>`origem=operacao&op_campanha=${campaign}&op_prazo=sem-prazo&op_tarefa=${id}`;
async function documentLink(page:Page,link:ReturnType<Page["getByRole"]>){await Promise.all([page.waitForEvent("domcontentloaded"),link.click()]);}
async function create(page:Page,tenant:string,title:string,campaign:string|null,due:string|null,deps:string[]=[]){
  await page.goto(`/e/${tenant}/operacao`);await page.locator('input[name="title"]').fill(title);await page.locator('textarea[name="description"]').fill(`Descrição persistida ${title}`);await page.locator('select[name="campaignId"]').selectOption(campaign??"");if(due)await page.locator('input[name="dueDate"]').fill(due);for(const id of deps)await page.locator(`input[name="dep"][value="${id}"]`).check();
  await page.getByRole("button",{name:"Criar tarefa",exact:true}).click();await expect(card(page,title)).toBeVisible();return card(page,title).locator('input[name="tarefa"]').first().inputValue();
}
async function transition(page:Page,title:string,button:string,status:string){await card(page,title).getByRole("button",{name:button,exact:true}).click();await expect(card(page,title).locator(".selo")).toHaveText(status);}
async function logout(page:Page){await page.goto("/empresas");await page.getByRole("button",{name:"Sair",exact:true}).click();await page.waitForURL(/\/entrar/);}

test.describe.configure({mode:"serial"});
test.describe("Detalhe oficial somente de leitura da tarefa",()=>{
  test("abre tarefa filtrada com dados/dependências reais e volta ao cartão",async({page})=>{
    test.setTimeout(120_000);await entrar(page,"a-owner@local.test");await page.goto(`/e/${TENANT_A}/estrategia`);await page.locator("#c_name").fill(`Detalhe campanha ${suffix}`);await page.locator("#c_key").fill(`dt-a-${suffix}`);await page.getByRole("button",{name:"Criar campanha",exact:true}).click();await page.waitForURL(/\/campanhas\//);campaignPath=new URL(page.url()).pathname;campaignId=campaignPath.split("/").at(-1)!;
    doneId=await create(page,TENANT_A,names.done,campaignId,"2099-12-31");await transition(page,names.done,"Iniciar","Em andamento");await transition(page,names.done,"Concluir","Concluída");
    pendingId=await create(page,TENANT_A,names.pending,campaignId,"2099-12-31");await transition(page,names.pending,"Iniciar","Em andamento");mainId=await create(page,TENANT_A,names.main,campaignId,null,[doneId,pendingId]);looseId=await create(page,TENANT_A,names.loose,null,"2099-12-31");
    await page.goto(`${operation}?campanha=${campaignId}&prazo=sem-prazo`);await documentLink(page,card(page,names.main).getByRole("link",{name:"Ver detalhes",exact:true}));await expect(page.getByRole("heading",{level:1,name:names.main,exact:true})).toBeVisible();
    await expect(field(page,"Descrição")).toHaveText(`Descrição persistida ${names.main}`);await expect(field(page,"Estado")).toHaveText("A fazer");await expect(field(page,"Prazo")).toHaveText("Sem prazo");await expect(field(page,"Responsável")).toHaveText("Sem responsável");await expect(field(page,"Revisão")).toHaveText("1");await expect(field(page,"Registro")).toContainText("UTC");
    await expect(dependencies(page)).toContainText(names.done);await expect(dependencies(page)).toContainText("Concluída");await expect(dependencies(page)).toContainText(names.pending);await expect(dependencies(page)).toContainText("Em andamento");await expect(dependencies(page)).toContainText("Dependências sem conclusão");await expect(dependencies(page).getByRole("link")).toHaveCount(0);await expect(data(page).locator("form")).toHaveCount(0);
    await page.setViewportSize({width:360,height:780});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await expect(page.getByRole("link",{name:"Voltar à Operação",exact:true})).toHaveAttribute("href",`${operation}?campanha=${campaignId}&prazo=sem-prazo#tarefa-${mainId}`);
    await documentLink(page,page.getByRole("link",{name:"Voltar à Operação",exact:true}));await expect(card(page,names.main)).toBeInViewport();
  });

  test("sem origem abre all e navega à campanha mantendo o alvo",async({page})=>{
    await entrar(page,"a-owner@local.test");await page.goto(path(TENANT_A,mainId));await expect(page.getByRole("link",{name:"Abrir na Operação",exact:true})).toHaveAttribute("href",`${operation}#tarefa-${mainId}`);
    await documentLink(page,page.getByRole("link",{name:"Ver campanha",exact:true}));await expect(page).toHaveURL(`${campaignPath}?origem=operacao&op_campanha=todas&op_prazo=todas&op_tarefa=${mainId}`);
    const item=page.getByRole("region",{name:"Tarefas vinculadas",exact:true}).locator("li").filter({has:page.getByRole("heading",{level:3,name:names.main,exact:true})});await documentLink(page,item.getByRole("link",{name:"Ver detalhes",exact:true}));
    await expect(page.getByRole("heading",{level:1,name:names.main,exact:true})).toBeVisible();await expect(page.getByRole("link",{name:"Voltar à Operação",exact:true})).toHaveAttribute("href",`${operation}#tarefa-${mainId}`);
  });

  test("campanha pode abrir detalhe fora do prazo sem limpar o recorte no retorno",async({page})=>{
    await entrar(page,"a-owner@local.test");await page.goto(`${campaignPath}?${context()}`);const item=page.getByRole("region",{name:"Tarefas vinculadas",exact:true}).locator("li").filter({has:page.getByRole("heading",{level:3,name:names.pending,exact:true})});await documentLink(page,item.getByRole("link",{name:"Ver detalhes",exact:true}));
    await expect(field(page,"Prazo").locator("time")).toHaveAttribute("datetime","2099-12-31");await expect(field(page,"Prazo")).toContainText("Prazo futuro");await expect(field(page,"Estado")).toHaveText("Em andamento");
    await expect(page.getByText("Os filtros de origem são mantidos. A tarefa pode ficar fora desse recorte ao voltar.",{exact:true})).toBeVisible();
    await documentLink(page,page.getByRole("link",{name:"Voltar à Operação",exact:true}));await expect(page).toHaveURL(`${operation}?campanha=${campaignId}&prazo=sem-prazo#tarefa-${pendingId}`);await expect(card(page,names.pending)).toHaveCount(0);await expect(card(page,names.main)).toBeVisible();
  });

  test("avulsa conserva avulsas/futuros e não inventa campanha",async({page})=>{
    await entrar(page,"a-owner@local.test");await page.goto(`${operation}?campanha=avulsas&prazo=futuros`);await documentLink(page,card(page,names.loose).getByRole("link",{name:"Ver detalhes",exact:true}));await expect(field(page,"Campanha")).toHaveText("Tarefa avulsa");await expect(page.getByRole("link",{name:"Ver campanha",exact:true})).toHaveCount(0);await expect(dependencies(page)).toHaveText(/Nenhuma dependência registrada\./);
    await documentLink(page,page.getByRole("link",{name:"Voltar à Operação",exact:true}));await expect(page).toHaveURL(`${operation}?campanha=avulsas&prazo=futuros#tarefa-${looseId}`);await expect(card(page,names.loose)).toBeInViewport();
    await page.goto(`${path(TENANT_A,mainId)}?${context(looseId)}`);await expect(page.locator('.erro[role="alert"]')).toHaveText("Contexto de retorno à Operação inválido ou indisponível.");
  });

  test("retornos malformados e tarefas alheias/inexistentes recebem recusas sem dados",async({page})=>{
    test.setTimeout(60_000);await entrar(page,"b-owner@local.test");betaId=await create(page,TENANT_B,names.beta,null,null);await logout(page);await entrar(page,"a-owner@local.test");
    for(const query of[`${context()}&op_prazo=todas`,`origem=operacao&op_campanha=${campaignId}`,context(mainId,randomUUID()),`${context()}&origem=operacao`]){await page.goto(`${path(TENANT_A,mainId)}?${query}`);await expect(page.locator('.erro[role="alert"]')).toHaveText("Contexto de retorno à Operação inválido ou indisponível.");await expect(page.getByRole("heading",{level:1,name:names.main,exact:true})).toHaveCount(0);}
    for(const id of[betaId,randomUUID(),"invalid"]){await page.goto(path(TENANT_A,id));await expect(page.locator('.erro[role="alert"]')).toHaveText("Tarefa não encontrada ou indisponível nesta empresa.");await expect(page.getByRole("heading",{level:1,name:names.beta,exact:true})).toHaveCount(0);await expect(page.getByRole("link",{name:"Abrir Operação",exact:true})).toHaveAttribute("href",operation);}
  });

  test("Leitor de B vê somente seu detalhe e não recebe ações de escrita",async({page})=>{
    await entrar(page,"ab-duas-empresas@local.test");await page.goto(`/e/${TENANT_B}/operacao?campanha=avulsas&prazo=sem-prazo`);await documentLink(page,card(page,names.beta).getByRole("link",{name:"Ver detalhes",exact:true}));await expect(page.getByRole("heading",{level:1,name:names.beta,exact:true})).toBeVisible();await expect(data(page).getByRole("button")).toHaveCount(0);await expect(data(page).locator("form")).toHaveCount(0);await expect(page.getByRole("button",{name:"Salvar tarefa",exact:true})).toHaveCount(0);
    await expect(page.getByRole("link",{name:"Voltar à Operação",exact:true})).toHaveAttribute("href",`/e/${TENANT_B}/operacao?campanha=avulsas&prazo=sem-prazo#tarefa-${betaId}`);
    await page.goto(path(TENANT_B,mainId));await expect(page.locator('.erro[role="alert"]')).toHaveText("Tarefa não encontrada ou indisponível nesta empresa.");await expect(page.getByRole("heading",{level:1,name:names.main,exact:true})).toHaveCount(0);
  });
});
