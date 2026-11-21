// CI descartável: fixtures próprias e calendário independente no fuso SQL da empresa.
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { criarUnitOfWork } from "../packages/infra/src/db.ts";
import { entrar, TENANT_A, TENANT_B } from "./ajuda";

const suffix=randomUUID().slice(0,8), operation=`/e/${TENANT_A}/operacao`;
const names={past:`Resumo anterior ${suffix}`,today:`Resumo hoje ${suffix}`,future:`Resumo futuro ${suffix}`,undated:`Resumo sem prazo ${suffix}`,done:`Resumo concluída ${suffix}`,cancelled:`Resumo cancelada ${suffix}`,outside:`Resumo outra campanha ${suffix}`};
let first="",other="",today="",yesterday="",tomorrow="";
const summary=(page:Page)=>page.getByRole("region",{name:"Resumo dos prazos das tarefas abertas",exact:true});
const card=(page:Page,name:string)=>page.locator("li").filter({has:page.getByRole("heading",{level:3,name,exact:true})});
const value=(page:Page,label:string)=>summary(page).locator("dt").filter({hasText:new RegExp(`^${label}$`)}).locator("..").locator("dd");
const expected=(over:Record<string,string>={})=>({"Tarefas abertas":"0","Atrasadas":"0","Hoje":"0","Prazos futuros":"0","Sem prazo":"0","Prazos indisponíveis":"0",...over});
async function assertCounts(page:Page,counts:Record<string,string>){for(const[label,count]of Object.entries(counts))await expect(value(page,label)).toHaveText(count);}
async function database(tenant:string,unlinked=false){
  const db=criarUnitOfWork({connectionString:"postgresql://postgres:postgres@127.0.0.1:54422/postgres",max:1});
  try{
    const date=await db.pool.query("select (current_timestamp at time zone timezone)::date::text as day from core.tenants where id=$1",[tenant]);
    const counts=await db.pool.query(`with active as (select due_date from strategy.tasks where tenant_id=$1 and status in ('todo','in_progress') and ($2::boolean=false or campaign_id is null)),
      day as (select (current_timestamp at time zone timezone)::date as today from core.tenants where id=$1)
      select count(*)::text as total, count(*) filter(where due_date < day.today)::text as overdue,
      count(*) filter(where due_date = day.today)::text as due_today, count(*) filter(where due_date > day.today)::text as upcoming,
      count(*) filter(where due_date is null)::text as undated from active cross join day`,[tenant,unlinked]);
    const day=date.rows[0]?.day;
    if(typeof day!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new Error("Dia civil da empresa CI indisponível");
    const row=counts.rows[0];
    return{day,counts:expected({"Tarefas abertas":row.total,"Atrasadas":row.overdue,"Hoje":row.due_today,"Prazos futuros":row.upcoming,"Sem prazo":row.undated})};
  }finally{await db.encerrar();}
}
// Aritmética civil de fixtures, não fonte de timezone ou do relógio da aplicação.
function shift(day:string,days:number){const[y,m,d]=day.split("-").map(Number);return new Date(Date.UTC(y!,m!-1,d!+days)).toISOString().slice(0,10);}
async function sameDay(){expect((await database(TENANT_A)).day,"Dia civil mudou durante a suíte; reexecute as fixtures na nova data antes de atribuir falha ao produto").toBe(today);}
async function campaign(page:Page,name:string,key:string){await page.goto(`/e/${TENANT_A}/estrategia`);await page.locator("#c_name").fill(name);await page.locator("#c_key").fill(key);await page.getByRole("button",{name:"Criar campanha",exact:true}).click();await page.waitForURL(/\/campanhas\//);return new URL(page.url()).pathname.split("/").at(-1)!;}
async function create(page:Page,title:string,campaignId:string|null,due:string|null){await page.goto(operation);await page.locator('input[name="title"]').fill(title);await page.locator('select[name="campaignId"]').selectOption(campaignId??"");if(due)await page.locator('input[name="dueDate"]').fill(due);await page.getByRole("button",{name:"Criar tarefa",exact:true}).click();await expect(card(page,title)).toBeVisible();}
async function transition(page:Page,title:string,button:string,status:string){await card(page,title).getByRole("button",{name:button,exact:true}).click();await expect(card(page,title).locator(".selo")).toHaveText(status);}
async function edit(page:Page,title:string,change:(form:ReturnType<Page["getByRole"]>)=>Promise<void>,removed=false){const details=card(page,title).locator("details");if(!await details.evaluate(el=>(el as HTMLDetailsElement).open))await details.locator("summary").click();const form=details.getByRole("form",{name:`Editar tarefa: ${title}`,exact:true});await change(form);await form.getByRole("button",{name:"Salvar tarefa",exact:true}).click();await expect(page.locator('.sucesso[role="status"]')).toHaveText("Tarefa atualizada.");if(removed)await expect(card(page,title)).toHaveCount(0);else await expect(details).toHaveJSProperty("open",false);}
async function logout(page:Page){await page.goto("/empresas");await page.getByRole("button",{name:"Sair",exact:true}).click();await page.waitForURL(/\/entrar/);}

test.describe.configure({mode:"serial"});
test.describe("Operação oficial — resumo dos prazos das abertas",()=>{
  test("partição da campanha considera só abertas e o resumo geral coincide com SQL independente",async({page})=>{
    test.setTimeout(120_000);today=(await database(TENANT_A)).day;yesterday=shift(today,-1);tomorrow=shift(today,1);
    await entrar(page,"a-owner@local.test");first=await campaign(page,`Resumo campanha ${suffix}`,`resumo-a-${suffix}`);other=await campaign(page,`Resumo outra ${suffix}`,`resumo-b-${suffix}`);
    for(const[title,due]of[[names.past,yesterday],[names.today,today],[names.future,tomorrow],[names.undated,null],[names.done,yesterday],[names.cancelled,yesterday]]as const)await create(page,title,first,due);
    await transition(page,names.done,"Iniciar","Em andamento");await transition(page,names.done,"Concluir","Concluída");await transition(page,names.cancelled,"Cancelar","Cancelada");await create(page,names.outside,other,yesterday);
    await page.goto(`${operation}?campanha=${first}`);await sameDay();
    await assertCounts(page,expected({"Tarefas abertas":"4","Atrasadas":"1","Hoje":"1","Prazos futuros":"1","Sem prazo":"1"}));
    await expect(summary(page)).toContainText(`Referência: ${today.split("-").reverse().join("/")}.`);await expect(summary(page)).toContainText(`tarefas abertas da campanha Resumo campanha ${suffix}`);
    await expect(summary(page).locator("li,.selo")).toHaveCount(0);
    await page.goto(operation);await assertCounts(page,(await database(TENANT_A)).counts);await expect(summary(page)).toContainText("todas as tarefas abertas desta empresa");
  });

  test("editar prazo atualiza contagens preservando filtro e estado real",async({page})=>{
    await sameDay();await entrar(page,"a-owner@local.test");await page.goto(`${operation}?campanha=${first}`);
    await edit(page,names.today,async form=>{await form.getByLabel("Prazo da tarefa",{exact:true}).fill(tomorrow);});
    await expect(card(page,names.today).getByTestId("prazo-tarefa").locator("time")).toHaveAttribute("datetime",tomorrow);
    await assertCounts(page,expected({"Tarefas abertas":"4","Atrasadas":"1","Prazos futuros":"2","Sem prazo":"1"}));
    await expect(page).toHaveURL(new RegExp(`campanha=${first}&ok=salva#tarefa-`));await expect(card(page,names.today).locator(".selo")).toHaveText("A fazer");
  });

  test("concluir retira da contagem e reabrir inclui de novo sem novo estado",async({page})=>{
    await sameDay();await entrar(page,"a-owner@local.test");await page.goto(`${operation}?campanha=${first}`);
    await transition(page,names.past,"Iniciar","Em andamento");await assertCounts(page,expected({"Tarefas abertas":"4","Atrasadas":"1","Prazos futuros":"2","Sem prazo":"1"}));
    await transition(page,names.past,"Concluir","Concluída");await assertCounts(page,expected({"Tarefas abertas":"3","Prazos futuros":"2","Sem prazo":"1"}));
    await transition(page,names.past,"Reabrir","Em andamento");await assertCounts(page,expected({"Tarefas abertas":"4","Atrasadas":"1","Prazos futuros":"2","Sem prazo":"1"}));
  });

  test("vínculo/avulsas acompanham filtro e campanha só terminal tem zero aberto real",async({page})=>{
    test.setTimeout(90_000);await sameDay();await entrar(page,"a-owner@local.test");await page.goto(`${operation}?campanha=${first}`);
    await edit(page,names.undated,async form=>{await form.getByLabel("Campanha da tarefa",{exact:true}).selectOption("");},true);
    await assertCounts(page,expected({"Tarefas abertas":"3","Atrasadas":"1","Prazos futuros":"2"}));
    await page.goto(`${operation}?campanha=avulsas`);await expect(summary(page)).toContainText("tarefas abertas avulsas desta empresa");await expect(card(page,names.undated)).toBeVisible();
    // A seleção avulsa pode conter fixtures anteriores; não presumimos um banco vazio.
    await assertCounts(page,(await database(TENANT_A,true)).counts);
    await page.goto(`${operation}?campanha=${first}`);
    await transition(page,names.past,"Cancelar","Cancelada");
    for(const title of[names.today,names.future]){await transition(page,title,"Iniciar","Em andamento");await transition(page,title,"Concluir","Concluída");}
    await assertCounts(page,expected());await expect(card(page,names.done)).toBeVisible();await expect(card(page,names.cancelled)).toBeVisible();
  });

  test("Leitor recebe agregado próprio e filtro inválido/alheio não mostra resumo",async({page})=>{
    await entrar(page,"b-owner@local.test");await logout(page);await entrar(page,"ab-duas-empresas@local.test");
    await page.goto(`/e/${TENANT_B}/operacao`);await assertCounts(page,(await database(TENANT_B)).counts);
    await expect(summary(page).getByRole("button")).toHaveCount(0);await expect(page.getByRole("button",{name:"Criar tarefa",exact:true})).toHaveCount(0);
    for(const query of[`campanha=${first}`,"campanha=inválida"]){await page.goto(`/e/${TENANT_B}/operacao?${query}`);await expect(page.locator('.erro[role="alert"]')).toContainText("Filtro de campanha inválido ou indisponível");await expect(summary(page)).toHaveCount(0);await expect(card(page,names.today)).toHaveCount(0);}
  });
});
