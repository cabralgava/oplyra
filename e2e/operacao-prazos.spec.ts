// Somente CI: calendário independente no PostgreSQL descartável; sem browser/UTC como fuso da empresa.
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { criarUnitOfWork } from "../packages/infra/src/db.ts";
import { entrar, TENANT_A, TENANT_B } from "./ajuda";

const suffix = randomUUID().slice(0,8);
const names = { future: `Prazo futuro ${suffix}`, past: `Prazo anterior ${suffix}`, today: `Prazo hoje ${suffix}`, tie: `Prazo empate ${suffix}`, undated: `Prazo ausente ${suffix}` };
const operation = `/e/${TENANT_A}/operacao`;
let campaignId = "", today = "", yesterday = "", tomorrow = "", earlier = "";
const card = (page: Page, name: string) => page.locator("li").filter({ has: page.getByRole("heading", { level: 3, name, exact: true }) });
const deadline = (page: Page, name: string) => card(page,name).getByTestId("prazo-tarefa");
async function civilToday(tenant: string) {
  const db = criarUnitOfWork({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54422/postgres", max: 1 });
  try {
    const result = await db.pool.query("select (current_timestamp at time zone timezone)::date::text as day from core.tenants where id=$1", [tenant]);
    const day = result.rows[0]?.day;
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Dia civil da empresa CI indisponível");
    return day;
  } finally { await db.encerrar(); }
}
// Aritmética de fixtures civis, partindo da data fornecida pelo banco; não determina o fuso.
function shift(day: string, days: number) { const [y,m,d] = day.split("-").map(Number); return new Date(Date.UTC(y!,m!-1,d!+days)).toISOString().slice(0,10); }
async function assertSameDay() { expect(await civilToday(TENANT_A), "Dia civil mudou durante a suíte; reexecute as fixtures na nova data antes de atribuir falha ao produto").toBe(today); }
async function createTask(page: Page, tenant: string, title: string, campaign: string | null, due: string | null) {
  await page.goto(`/e/${tenant}/operacao`); await page.locator('input[name="title"]').fill(title);
  await page.locator('select[name="campaignId"]').selectOption(campaign ?? "");
  if (due) await page.locator('input[name="dueDate"]').fill(due);
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await expect(card(page,title)).toBeVisible();
}
async function editDue(page: Page, title: string, due: string | null) {
  const details = card(page,title).locator("details");
  if (!await details.evaluate(el=>(el as HTMLDetailsElement).open)) await details.locator("summary").click();
  const form = details.getByRole("form", { name: `Editar tarefa: ${title}`, exact: true });
  const revision = Number(await form.locator('input[name="editar_revisao"]').inputValue());
  await form.getByLabel("Prazo da tarefa", { exact: true }).fill(due ?? "");
  await form.getByRole("button", { name: "Salvar tarefa", exact: true }).click();
  await expect(page.locator('.sucesso[role="status"]')).toHaveText("Tarefa atualizada.");
  await expect(details).toHaveJSProperty("open",false);
  await expect(card(page,title).locator('input[name="editar_revisao"]')).toHaveValue(String(revision+1));
  if (due) await expect(card(page,title).locator("time")).toHaveAttribute("datetime",due);
  else await expect(card(page,title).locator("time")).toHaveCount(0);
}
async function order(page: Page, state: string) {
  return (await page.locator(`[aria-labelledby="coluna-${state}"] h3`).allTextContents()).filter(title=>Object.values(names).includes(title));
}
async function transition(page: Page,title: string,button: string,status: string) {
  await card(page,title).getByRole("button", { name:button,exact:true }).click();
  await expect(card(page,title).locator(".selo")).toHaveText(status);
}
async function logout(page: Page) { await page.goto("/empresas"); await page.getByRole("button", {name:"Sair",exact:true}).click(); await page.waitForURL(/\/entrar/); }

test.describe.configure({ mode:"serial" });
test.describe("Operação oficial — prazos civis e prioridade visual",()=>{
  test("datas próximas primeiro, empate estável, sem prazo ao final e Hoje pelo fuso real",async({page})=>{
    test.setTimeout(90_000); today=await civilToday(TENANT_A); yesterday=shift(today,-1); tomorrow=shift(today,1); earlier=shift(today,-2);
    await entrar(page,"a-owner@local.test"); await page.goto(`/e/${TENANT_A}/estrategia`);
    await page.locator("#c_name").fill(`Prazos ${suffix}`); await page.locator("#c_key").fill(`prazos-${suffix}`);
    await page.getByRole("button",{name:"Criar campanha",exact:true}).click(); await page.waitForURL(/\/campanhas\//); campaignId=new URL(page.url()).pathname.split("/").at(-1)!;
    for(const [title,due] of [[names.future,tomorrow],[names.undated,null],[names.past,yesterday],[names.today,today],[names.tie,today]] as const) await createTask(page,TENANT_A,title,campaignId,due);
    await page.goto(`${operation}?campanha=${campaignId}`); await assertSameDay();
    await expect.poll(()=>order(page,"todo")).toEqual([names.past,names.today,names.tie,names.future,names.undated]);
    await expect(deadline(page,names.past)).toContainText("Atrasada"); await expect(deadline(page,names.today)).toContainText("Hoje");
    await expect(deadline(page,names.future)).toContainText("Prazo futuro"); await expect(deadline(page,names.undated)).toContainText("Sem prazo");
    await expect(card(page,names.today).locator(".selo")).toHaveText("A fazer"); await expect(card(page,names.today).locator("time")).toHaveAttribute("datetime",today);
  });

  test("editar prazo reordena após persistência e preserva filtro/revisão/estado",async({page})=>{
    await assertSameDay(); await entrar(page,"a-owner@local.test"); await page.goto(`${operation}?campanha=${campaignId}`);
    await editDue(page,names.future,earlier);
    await expect(page).toHaveURL(new RegExp(`campanha=${campaignId}&ok=salva#tarefa-`));
    await expect.poll(()=>order(page,"todo")).toEqual([names.future,names.past,names.today,names.tie,names.undated]);
    await expect(card(page,names.future).locator(".selo")).toHaveText("A fazer"); await expect(deadline(page,names.future)).toContainText("Atrasada");
  });

  test("Em andamento recebe a mesma ordenação sem alterar referências ou ações",async({page})=>{
    await assertSameDay(); await entrar(page,"a-owner@local.test"); await page.goto(`${operation}?campanha=${campaignId}`);
    for(const title of [names.undated,names.today,names.future]) await transition(page,title,"Iniciar","Em andamento");
    await expect.poll(()=>order(page,"in_progress")).toEqual([names.future,names.today,names.undated]);
    await expect(card(page,names.future).getByRole("button",{name:"Concluir",exact:true})).toBeEnabled();
    await expect(card(page,names.future).locator(".selo")).toHaveCount(1);
  });

  test("concluir ou cancelar preserva data histórica sem alerta de atraso ativo",async({page})=>{
    await assertSameDay(); await entrar(page,"a-owner@local.test"); await page.goto(`${operation}?campanha=${campaignId}`);
    await transition(page,names.future,"Concluir","Concluída");
    await expect(card(page,names.future).locator("time")).toHaveAttribute("datetime",earlier);
    await expect(deadline(page,names.future)).not.toContainText("Atrasada");
    await transition(page,names.past,"Cancelar","Cancelada");
    await expect(card(page,names.past).locator("time")).toHaveAttribute("datetime",yesterday); await expect(deadline(page,names.past)).not.toContainText("Atrasada");
  });

  test("remover e restaurar prazo mantém campo civil e desloca só a ordem visual",async({page})=>{
    await assertSameDay(); await entrar(page,"a-owner@local.test"); await page.goto(`${operation}?campanha=${campaignId}`);
    await editDue(page,names.tie,null); await expect(deadline(page,names.tie)).toContainText("Sem prazo");
    await expect(deadline(page,names.tie)).not.toContainText("Hoje");
    await editDue(page,names.tie,today); await expect(deadline(page,names.tie)).toContainText("Hoje");
    await expect(card(page,names.tie).locator(".selo")).toHaveText("A fazer");
  });

  test("Leitor vê prazos próprios de B sem controles e campanha alheia é recusada",async({page})=>{
    test.setTimeout(60_000); const betaName=`Prazo Beta ${suffix}`,betaDay=await civilToday(TENANT_B),betaPast=shift(betaDay,-1);
    await entrar(page,"b-owner@local.test"); await createTask(page,TENANT_B,betaName,null,betaPast);
    await logout(page); await entrar(page,"ab-duas-empresas@local.test"); await page.goto(`/e/${TENANT_B}/operacao?campanha=avulsas`);
    await expect(deadline(page,betaName)).toContainText("Atrasada"); await expect(card(page,betaName).getByRole("button")).toHaveCount(0); await expect(card(page,betaName).locator("details")).toHaveCount(0);
    await expect(card(page,names.today)).toHaveCount(0);
    await page.goto(`/e/${TENANT_B}/operacao?campanha=${campaignId}`);
    await expect(page.locator('.erro[role="alert"]')).toContainText("Filtro de campanha inválido ou indisponível"); await expect(card(page,names.today)).toHaveCount(0);
  });
});
