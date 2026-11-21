// Somente dados/Auth da CI descartável. Nenhum cadastro ou escrita no develop hospedado.
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { entrar, TENANT_A, TENANT_B } from "./ajuda";
const suffix=randomUUID().slice(0,8);
const name=`Retorno campanha ${suffix}`,main=`Retorno sem prazo ${suffix}`,outside=`Retorno futura ${suffix}`,betaName=`Retorno Beta ${suffix}`,betaTask=`Retorno tarefa Beta ${suffix}`;
let campaignPath="",campaignId="",mainId="",outsideId="",betaPath="",betaId="",betaTaskId="";
const operation=`/e/${TENANT_A}/operacao`;
const card=(page:Page,title:string)=>page.locator("li").filter({has:page.getByRole("heading",{level:3,name:title,exact:true})});
const tasks=(page:Page)=>page.getByRole("region",{name:"Tarefas vinculadas",exact:true});
const originQuery=(campaign:string,taskId:string|null=mainId)=>`origem=operacao&op_campanha=${campaign}&op_prazo=sem-prazo${taskId?`&op_tarefa=${taskId}`:""}`;
async function campaign(page:Page,tenant:string,title:string,key:string){await page.goto(`/e/${tenant}/estrategia`);await page.locator("#c_name").fill(title);await page.locator("#c_key").fill(key);await page.getByRole("button",{name:"Criar campanha",exact:true}).click();await page.waitForURL(/\/campanhas\//);return new URL(page.url()).pathname;}
async function create(page:Page,tenant:string,title:string,campaignId:string,due:string|null){await page.goto(`/e/${tenant}/operacao`);await page.locator('input[name="title"]').fill(title);await page.locator('select[name="campaignId"]').selectOption(campaignId);if(due)await page.locator('input[name="dueDate"]').fill(due);await page.getByRole("button",{name:"Criar tarefa",exact:true}).click();await expect(card(page,title)).toBeVisible();return card(page,title).locator('input[name="tarefa"]').first().inputValue();}
async function documentLink(page:Page,link:ReturnType<Page["getByRole"]>){await Promise.all([page.waitForEvent("domcontentloaded"),link.click()]);}
function assertOrigin(page:Page,campaign:string=campaignId,taskId:string|null=mainId){const url=new URL(page.url());expect(url.searchParams.get("origem")).toBe("operacao");expect(url.searchParams.get("op_campanha")).toBe(campaign);expect(url.searchParams.get("op_prazo")).toBe("sem-prazo");expect(url.searchParams.get("op_tarefa")).toBe(taskId);}
async function logout(page:Page){await page.goto("/empresas");await page.getByRole("button",{name:"Sair",exact:true}).click();await page.waitForURL(/\/entrar/);}

test.describe.configure({mode:"serial"});
test.describe("Operação ↔ campanha — retorno com filtros",()=>{
  test("cartão retorna para all ou campanha+prazo com sua âncora original",async({page})=>{
    test.setTimeout(90_000);await entrar(page,"a-owner@local.test");campaignPath=await campaign(page,TENANT_A,name,`retorno-a-${suffix}`);campaignId=campaignPath.split("/").at(-1)!;
    mainId=await create(page,TENANT_A,main,campaignId,null);outsideId=await create(page,TENANT_A,outside,campaignId,"2099-12-31");
    await page.goto(operation);await documentLink(page,card(page,main).getByRole("link",{name:"Ver campanha",exact:true}));
    const all=new URL(page.url());expect(all.pathname).toBe(campaignPath);expect(all.searchParams.get("op_campanha")).toBe("todas");expect(all.searchParams.get("op_prazo")).toBe("todas");expect(all.searchParams.get("op_tarefa")).toBe(mainId);
    await documentLink(page,page.getByRole("link",{name:"Voltar à Operação",exact:true}));await expect(page).toHaveURL(`${operation}#tarefa-${mainId}`);await expect(card(page,main)).toBeInViewport();
    await page.goto(`${operation}?campanha=${campaignId}&prazo=sem-prazo`);
    await documentLink(page,card(page,main).getByRole("link",{name:"Ver campanha",exact:true}));assertOrigin(page);
    await documentLink(page,page.getByRole("link",{name:"Voltar à Operação",exact:true}));await expect(page).toHaveURL(`${operation}?campanha=${campaignId}&prazo=sem-prazo#tarefa-${mainId}`);await expect(card(page,main)).toBeInViewport();
  });

  test("salvar/recusa de ativação e GET de UTM mantêm o contexto de retorno",async({page})=>{
    await entrar(page,"a-owner@local.test");await page.goto(`${campaignPath}?${originQuery(campaignId)}`);
    await page.getByLabel("URL de destino",{exact:true}).fill("https://example.test/demo");await page.getByLabel("Conteúdo (versão da entrega)",{exact:true}).fill("retorno-v1");
    await page.getByRole("button",{name:"Gerar UTMs",exact:true}).click();await page.waitForURL(url=>url.searchParams.get("conteudo")==="retorno-v1");assertOrigin(page);
    await expect(page.getByRole("link",{name:"Voltar à Operação",exact:true})).toHaveAttribute("href",`${operation}?campanha=${campaignId}&prazo=sem-prazo#tarefa-${mainId}`);
    await page.getByRole("button",{name:"Salvar rascunho",exact:true}).click();await page.waitForURL(url=>url.searchParams.get("ok")==="salvo");assertOrigin(page);
    await page.getByRole("button",{name:"Ativar",exact:true}).click();await page.waitForURL(url=>url.searchParams.has("erro"));assertOrigin(page);await expect(page.locator('.erro[role="alert"]')).toBeVisible();
  });

  test("peritem fora do recorte mantém prazo e hash sem prometer exibir cartão",async({page})=>{
    await entrar(page,"a-owner@local.test");await page.goto(`${campaignPath}?${originQuery(campaignId)}`);
    await expect(tasks(page)).toContainText("Tarefas fora desse recorte não aparecerão ao voltar.");
    const item=tasks(page).locator("li").filter({has:page.getByRole("heading",{level:3,name:outside,exact:true})});
    await expect(item.getByRole("link",{name:"Ver na Operação",exact:true})).toHaveAttribute("href",`${operation}?campanha=${campaignId}&prazo=sem-prazo#tarefa-${outsideId}`);
    await documentLink(page,item.getByRole("link",{name:"Ver na Operação",exact:true}));
    await expect(page).toHaveURL(`${operation}?campanha=${campaignId}&prazo=sem-prazo#tarefa-${outsideId}`);await expect(card(page,outside)).toHaveCount(0);await expect(card(page,main)).toBeVisible();
  });

  test("avulsas sem âncora não cria links peritem incompatíveis nem limpa os filtros",async({page})=>{
    await entrar(page,"a-owner@local.test");await page.goto(`${campaignPath}?${originQuery("avulsas",null)}`);
    await expect(page.getByRole("heading",{level:1,name,exact:true})).toBeVisible();await expect(tasks(page).getByRole("link",{name:"Ver na Operação",exact:true})).toHaveCount(0);
    const destination=`${operation}?campanha=avulsas&prazo=sem-prazo`;
    await expect(page.getByRole("link",{name:"Voltar à Operação",exact:true})).toHaveAttribute("href",destination);await expect(tasks(page).getByRole("link",{name:"Abrir Operação",exact:true})).toHaveAttribute("href",destination);
    await documentLink(page,page.getByRole("link",{name:"Voltar à Operação",exact:true}));await expect(page).toHaveURL(destination);await expect(card(page,main)).toHaveCount(0);
    await page.goto(`${campaignPath}?${originQuery(campaignId,null)}`);await expect(page.getByRole("link",{name:"Voltar à Operação",exact:true})).toHaveAttribute("href",`${operation}?campanha=${campaignId}&prazo=sem-prazo`);
  });

  test("contexto duplicado/inválido e tarefa de outra empresa não expõem retorno",async({page})=>{
    test.setTimeout(90_000);await entrar(page,"b-owner@local.test");betaPath=await campaign(page,TENANT_B,betaName,`retorno-b-${suffix}`);betaId=betaPath.split("/").at(-1)!;betaTaskId=await create(page,TENANT_B,betaTask,betaId,null);
    await logout(page);await entrar(page,"a-owner@local.test");
    for(const query of[`${originQuery(campaignId)}&origem=operacao`,`${originQuery(campaignId)}&op_prazo=hoje`,`origem=operacao&op_campanha=${campaignId}&op_prazo=sem-prazo&op_tarefa=`,originQuery(betaId),originQuery(campaignId,betaTaskId)]){
      await page.goto(`${campaignPath}?${query}`);await expect(page.locator('.erro[role="alert"]')).toHaveText("Contexto de retorno à Operação inválido ou indisponível.");await expect(page.getByRole("link",{name:"Voltar à Operação",exact:true})).toHaveCount(0);await expect(page.getByRole("heading",{name:betaTask,exact:true})).toHaveCount(0);
    }
    await page.goto(`/e/${TENANT_A}/estrategia/campanhas/${betaId}?${originQuery(betaId,betaTaskId)}`);await expect(page).toHaveURL(new RegExp(`/e/${TENANT_A}/estrategia\\?erro=CAMPAIGN_NOT_FOUND$`));await expect(page.getByRole("heading",{level:1,name:betaName,exact:true})).toHaveCount(0);
  });

  test("Leitor usa ida/volta sem controles e referência alheia ao tenant continua recusada",async({page})=>{
    await entrar(page,"ab-duas-empresas@local.test");await page.goto(`/e/${TENANT_B}/operacao?campanha=${betaId}&prazo=sem-prazo`);
    await expect(card(page,betaTask).getByRole("button")).toHaveCount(0);await documentLink(page,card(page,betaTask).getByRole("link",{name:"Ver campanha",exact:true}));assertOrigin(page,betaId,betaTaskId);
    await expect(page.getByRole("button",{name:"Ativar",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"Salvar rascunho",exact:true})).toHaveCount(0);
    await documentLink(page,page.getByRole("link",{name:"Voltar à Operação",exact:true}));await expect(page).toHaveURL(`/e/${TENANT_B}/operacao?campanha=${betaId}&prazo=sem-prazo#tarefa-${betaTaskId}`);
    await expect(card(page,betaTask)).toBeInViewport();await page.goto(`${betaPath}?${originQuery(betaId,mainId)}`);await expect(page.locator('.erro[role="alert"]')).toHaveText("Contexto de retorno à Operação inválido ou indisponível.");
  });
});
