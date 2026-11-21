// Relações reais de tarefas em tenants sintéticos, somente na CI descartável.
import { test, expect, type Page, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { entrar, TENANT_A, TENANT_B } from "./ajuda";
const suffix=randomUUID().slice(0,8),operation=`/e/${TENANT_A}/operacao`;
const names={root:`Navegar origem ${suffix}`,middle:`Navegar outra campanha ${suffix}`,leaf:`Navegar folha avulsa ${suffix}`,loose:`Navegar origem avulsa ${suffix}`,unrelated:`Navegar desconexa ${suffix}`,foreign:`Navegar Beta ${suffix}`};
let campaignA="",campaignB="",rootId="",middleId="",leafId="",looseId="",unrelatedId="",foreignId="";
const path=(tenant:string,id:string)=>`/e/${tenant}/operacao/tarefas/${id}`;
const card=(page:Page,title:string)=>page.locator("li").filter({has:page.getByRole("heading",{level:3,name:title,exact:true})});
const dependencies=(page:Page)=>page.getByRole("region",{name:"Dependências da tarefa",exact:true});
const data=(page:Page)=>page.getByRole("region",{name:"Dados da tarefa",exact:true});
const field=(page:Page,label:string)=>data(page).locator("dt").filter({hasText:new RegExp(`^${label}$`)}).locator("..").locator("dd");
const context=(root=rootId,campaign=campaignA)=>new URLSearchParams({origem:"operacao",op_campanha:campaign,op_prazo:"sem-prazo",op_tarefa:root}).toString();
const dependencyURL=(target:string,root=rootId,campaign=campaignA)=>`${path(TENANT_A,target)}?${context(root,campaign)}&tarefa_origem=${root}`;
async function documentLink(page:Page,link:Locator){await Promise.all([page.waitForEvent("domcontentloaded"),link.click()]);}
async function campaign(page:Page,label:string,key:string){await page.goto(`/e/${TENANT_A}/estrategia`);await page.locator("#c_name").fill(label);await page.locator("#c_key").fill(key);await page.getByRole("button",{name:"Criar campanha",exact:true}).click();await page.waitForURL(/\/campanhas\//);return new URL(page.url()).pathname.split("/").at(-1)!;}
async function create(page:Page,tenant:string,title:string,campaignId:string|null,due:string|null,deps:string[]=[]){
  await page.goto(`/e/${tenant}/operacao`);await page.locator('input[name="title"]').fill(title);await page.locator('textarea[name="description"]').fill(`Descrição ${title}`);await page.locator('select[name="campaignId"]').selectOption(campaignId??"");if(due)await page.locator('input[name="dueDate"]').fill(due);for(const id of deps)await page.locator(`input[name="dep"][value="${id}"]`).check();await page.getByRole("button",{name:"Criar tarefa",exact:true}).click();await expect(card(page,title)).toBeVisible();return card(page,title).locator('input[name="tarefa"]').first().inputValue();
}
test.describe.configure({mode:"serial"});
test.describe("Dependências no detalhe oficial preservam a origem",()=>{
  test("abre outra campanha e segunda dependência avulsa mantendo filtros e cartão raiz",async({page})=>{
    test.setTimeout(120_000);await entrar(page,"a-owner@local.test");campaignA=await campaign(page,`Origem navegação ${suffix}`,`dn-a-${suffix}`);campaignB=await campaign(page,`Outra navegação ${suffix}`,`dn-b-${suffix}`);
    leafId=await create(page,TENANT_A,names.leaf,null,"2099-12-31");middleId=await create(page,TENANT_A,names.middle,campaignB,"2099-12-31",[leafId]);rootId=await create(page,TENANT_A,names.root,campaignA,null,[middleId]);looseId=await create(page,TENANT_A,names.loose,null,null,[middleId]);unrelatedId=await create(page,TENANT_A,names.unrelated,null,null);
    await page.goto(`${operation}?campanha=${campaignA}&prazo=sem-prazo`);await documentLink(page,card(page,names.root).getByRole("link",{name:"Ver detalhes",exact:true}));await expect(dependencies(page).getByRole("link",{name:names.middle,exact:true})).toHaveAttribute("href",dependencyURL(middleId));
    await documentLink(page,dependencies(page).getByRole("link",{name:names.middle,exact:true}));await expect(page.getByRole("heading",{name:names.middle,level:1,exact:true})).toBeVisible();await expect(field(page,"Prazo")).toContainText("Prazo futuro");await expect(field(page,"Campanha")).toContainText(`Outra navegação ${suffix}`);await expect(page.getByRole("link",{name:"Ver campanha",exact:true})).toHaveCount(0);await expect(field(page,"Campanha")).toContainText("Campanha diferente da origem");
    await expect(page.getByRole("link",{name:"Voltar à Operação",exact:true})).toHaveAttribute("href",`${operation}?campanha=${campaignA}&prazo=sem-prazo#tarefa-${rootId}`);await expect(dependencies(page).getByRole("link",{name:names.leaf,exact:true})).toHaveAttribute("href",dependencyURL(leafId));
    await documentLink(page,dependencies(page).getByRole("link",{name:names.leaf,exact:true}));await expect(field(page,"Campanha")).toHaveText("Tarefa avulsa");await expect(page.getByRole("link",{name:"Voltar à tarefa de origem",exact:true})).toHaveAttribute("href",`${path(TENANT_A,rootId)}?${context()}`);await expect(data(page).locator("form,button")).toHaveCount(0);
    await documentLink(page,page.getByRole("link",{name:"Voltar à Operação",exact:true}));await expect(page).toHaveURL(`${operation}?campanha=${campaignA}&prazo=sem-prazo#tarefa-${rootId}`);await expect(card(page,names.root)).toBeInViewport();await expect(card(page,names.middle)).toHaveCount(0);await expect(card(page,names.leaf)).toHaveCount(0);
  });
  test("origem sem filtro e origem avulsa conservam o percurso, com teclado e celular",async({page})=>{
    await entrar(page,"a-owner@local.test");await page.goto(path(TENANT_A,rootId));await documentLink(page,dependencies(page).getByRole("link",{name:names.middle,exact:true}));await expect(page).toHaveURL(`${path(TENANT_A,middleId)}?tarefa_origem=${rootId}`);await expect(page.getByRole("link",{name:"Abrir na Operação",exact:true})).toHaveAttribute("href",`${operation}#tarefa-${rootId}`);await documentLink(page,page.getByRole("link",{name:"Voltar à tarefa de origem",exact:true}));await expect(page).toHaveURL(path(TENANT_A,rootId));
    await page.goto(`${operation}?campanha=avulsas&prazo=sem-prazo`);await documentLink(page,card(page,names.loose).getByRole("link",{name:"Ver detalhes",exact:true}));await documentLink(page,dependencies(page).getByRole("link",{name:names.middle,exact:true}));await expect(page).toHaveURL(dependencyURL(middleId,looseId,"avulsas"));await expect(page.getByRole("link",{name:"Ver campanha",exact:true})).toHaveCount(0);
    await page.setViewportSize({width:360,height:780});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);const back=page.getByRole("link",{name:"Voltar à tarefa de origem",exact:true});await back.focus();await expect(back).toBeFocused();await Promise.all([page.waitForEvent("domcontentloaded"),page.keyboard.press("Enter")]);await expect(page.getByRole("heading",{level:1,name:names.loose,exact:true})).toBeVisible();await expect(page.getByRole("link",{name:"Voltar à Operação",exact:true})).toHaveAttribute("href",`${operation}?campanha=avulsas&prazo=sem-prazo#tarefa-${looseId}`);
  });
  test("origem repetida, vazia ou filtro do alvo não substituem o contexto da raiz",async({page})=>{
    await entrar(page,"a-owner@local.test");for(const query of[`tarefa_origem=`,`tarefa_origem=${rootId}&tarefa_origem=${rootId}`,`tarefa_origem=https://externo.test`,`${context(rootId,campaignB)}&tarefa_origem=${rootId}`,`${context(middleId,campaignB)}&tarefa_origem=${rootId}`]){await page.goto(`${path(TENANT_A,middleId)}?${query}`);await expect(page.locator('.erro[role="alert"]')).toHaveText("Contexto de retorno à Operação inválido ou indisponível.");await expect(data(page)).toHaveCount(0);}
    for(const target of[rootId,unrelatedId,randomUUID()]){await page.goto(dependencyURL(target));await expect(page.locator('.erro[role="alert"]')).toHaveText("Tarefa não encontrada ou indisponível nesta empresa.");await expect(data(page)).toHaveCount(0);}
  });
  test("origem ou alvo de outra empresa recebem a mesma recusa, sem dados",async({page})=>{
    await entrar(page,"b-owner@local.test");foreignId=await create(page,TENANT_B,names.foreign,null,null);await page.goto("/empresas");await page.getByRole("button",{name:"Sair",exact:true}).click();await page.waitForURL(/\/entrar/);await entrar(page,"a-owner@local.test");
    for(const [origin,target]of([[rootId,foreignId],[foreignId,middleId],[foreignId,foreignId]] as const)){await page.goto(`${path(TENANT_A,target)}?tarefa_origem=${origin}`);await expect(page.locator('.erro[role="alert"]')).toHaveText("Tarefa não encontrada ou indisponível nesta empresa.");await expect(data(page)).toHaveCount(0);await expect(page.getByRole("heading",{name:names.foreign,level:1,exact:true})).toHaveCount(0);}
  });
});
