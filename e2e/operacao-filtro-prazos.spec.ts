// Auth/SQL/fixtures exclusivos da CI descartável; nenhum acesso ao develop hospedado.
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { criarUnitOfWork } from "../packages/infra/src/db.ts";
import { entrar, TENANT_A, TENANT_B } from "./ajuda";

const suffix = randomUUID().slice(0, 8);
const operation = `/e/${TENANT_A}/operacao`;
const names = { past: `Filtro prazo atrasado ${suffix}`, today: `Filtro prazo hoje ${suffix}`, future: `Filtro prazo futuro ${suffix}`, undated: `Filtro prazo ausente ${suffix}`, done: `Filtro prazo concluída ${suffix}`, cancelled: `Filtro prazo cancelada ${suffix}`, outside: `Filtro prazo outra ${suffix}` };
let first = "", other = "", today = "", yesterday = "", tomorrow = "", futureId = "";
const card = (page: Page, title: string) => page.locator("li").filter({ has: page.getByRole("heading", { level: 3, name: title, exact: true }) });
const form = (page: Page) => page.getByRole("form", { name: "Filtrar tarefas por campanha", exact: true });
const summary = (page: Page) => page.getByRole("region", { name: "Resumo dos prazos das tarefas abertas", exact: true });
const total = (page: Page) => summary(page).locator("dt").filter({ hasText: /^Tarefas abertas$/ }).locator("..").locator("dd");
async function civilToday(tenant: string) {
  const db = criarUnitOfWork({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54422/postgres", max: 1 });
  try {
    const result = await db.pool.query("select (current_timestamp at time zone timezone)::date::text as day from core.tenants where id=$1", [tenant]);
    const day = result.rows[0]?.day;
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Dia civil da empresa CI indisponível");
    return day;
  } finally { await db.encerrar(); }
}
// Aritmética de fixtures civis a partir do calendário SQL, sem inferir fuso do navegador.
function shift(day: string, days: number) { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10); }
async function sameDay() { expect(await civilToday(TENANT_A), "Dia civil mudou durante a suíte; reexecute as fixtures na nova data antes de atribuir falha ao produto").toBe(today); }
async function campaign(page: Page, name: string, key: string) {
  await page.goto(`/e/${TENANT_A}/estrategia`);
  await page.locator("#c_name").fill(name); await page.locator("#c_key").fill(key);
  await page.getByRole("button", { name: "Criar campanha", exact: true }).click();
  await page.waitForURL(/\/campanhas\//); return new URL(page.url()).pathname.split("/").at(-1)!;
}
async function create(page: Page, tenant: string, title: string, campaignId: string | null, due: string | null, dependency?: string) {
  await page.goto(`/e/${tenant}/operacao`);
  await page.locator('input[name="title"]').fill(title);
  await page.locator('select[name="campaignId"]').selectOption(campaignId ?? "");
  if (due) await page.locator('input[name="dueDate"]').fill(due);
  if (dependency) await page.locator(`input[name="dep"][value="${dependency}"]`).check();
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await expect(card(page, title)).toBeVisible();
  return card(page, title).locator('input[name="tarefa"]').first().inputValue();
}
async function apply(page: Page, campaignId: string, due: string) {
  await form(page).getByLabel("Filtrar tarefas por prazo", { exact: true }).selectOption(due);
  await form(page).getByLabel("Filtrar tarefas por campanha", { exact: true }).selectOption(campaignId);
  await form(page).getByRole("button", { name: "Aplicar filtro", exact: true }).click();
  await page.waitForURL(url => url.pathname === operation && url.searchParams.get("campanha") === campaignId && url.searchParams.get("prazo") === due);
  await expect(form(page).getByLabel("Filtrar tarefas por prazo", { exact: true })).toHaveValue(due);
}
async function transition(page: Page, title: string, button: string, state: string, remains = true) {
  await card(page, title).getByRole("button", { name: button, exact: true }).click();
  await expect(page.locator('.sucesso[role="status"]')).toHaveText("Estado da tarefa atualizado.");
  if (remains) await expect(card(page, title).locator(".selo")).toHaveText(state);
  else await expect(card(page, title)).toHaveCount(0);
}
async function logout(page: Page) { await page.goto("/empresas"); await page.getByRole("button", { name: "Sair", exact: true }).click(); await page.waitForURL(/\/entrar/); }

test.describe.configure({ mode: "serial" });
test.describe("Operação oficial — filtro de prazo e campanha", () => {
  test("padrão mantém terminais e teclado prazo→campanha→Aplicar", async ({ page }) => {
    test.setTimeout(120_000); today = await civilToday(TENANT_A); yesterday = shift(today, -1); tomorrow = shift(today, 1);
    await entrar(page, "a-owner@local.test");
    first = await campaign(page, `Filtro prazo campanha ${suffix}`, `fp-a-${suffix}`);
    other = await campaign(page, `Filtro prazo outra ${suffix}`, `fp-b-${suffix}`);
    futureId = await create(page, TENANT_A, names.future, first, tomorrow);
    await create(page, TENANT_A, names.past, first, yesterday, futureId);
    for (const [title, due] of [[names.today, today], [names.undated, null], [names.done, yesterday], [names.cancelled, null]] as const) await create(page, TENANT_A, title, first, due);
    await transition(page, names.done, "Iniciar", "Em andamento"); await transition(page, names.done, "Concluir", "Concluída");
    await transition(page, names.cancelled, "Cancelar", "Cancelada");
    await create(page, TENANT_A, names.outside, other, yesterday);
    await page.goto(`${operation}?campanha=${first}`); await sameDay();
    await expect(total(page)).toHaveText("4");
    await expect(page.getByText("Tarefas exibidas: 6.", { exact: true })).toBeVisible();
    await expect(card(page, names.done)).toBeVisible(); await expect(card(page, names.cancelled)).toBeVisible();
    await form(page).getByLabel("Filtrar tarefas por prazo", { exact: true }).focus();
    await page.keyboard.press("Tab"); await expect(form(page).getByLabel("Filtrar tarefas por campanha", { exact: true })).toBeFocused();
    await page.keyboard.press("Tab"); await expect(form(page).getByRole("button", { name: "Aplicar filtro", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await page.waitForURL(url => url.searchParams.get("prazo") === "todas" && url.searchParams.get("campanha") === first);
  });

  test("categorias combinam com campanha sem alterar o resumo das abertas", async ({ page }) => {
    await sameDay(); await entrar(page, "a-owner@local.test"); await page.goto(`${operation}?campanha=${first}`);
    for (const [token, title] of [["atrasadas", names.past], ["hoje", names.today], ["futuros", names.future], ["sem-prazo", names.undated]] as const) {
      await apply(page, first, token); await expect(card(page, title)).toBeVisible();
      await expect(page.getByText("Tarefas exibidas: 1.", { exact: true })).toBeVisible();
      await expect(total(page)).toHaveText("4"); await expect(summary(page)).toContainText("O filtro de prazo não altera este resumo.");
      await expect(card(page, names.done)).toHaveCount(0); await expect(card(page, names.cancelled)).toHaveCount(0);
    }
    await apply(page, first, "indisponiveis");
    await expect(page.getByText("Nenhuma tarefa aberta corresponde a este filtro de prazo.", { exact: true })).toBeVisible();
    await expect(total(page)).toHaveText("4");
    await apply(page, other, "atrasadas"); await expect(card(page, names.outside)).toBeVisible(); await expect(card(page, names.past)).toHaveCount(0);
    await form(page).getByRole("link", { name: "Limpar filtro", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/e/${TENANT_A}/operacao$`));
  });

  test("editar prazo sai do filtro, preserva dependência fora dele e revisão", async ({ page }) => {
    await sameDay(); await entrar(page, "a-owner@local.test"); await page.goto(`${operation}?campanha=${first}&prazo=atrasadas`);
    const details = card(page, names.past).locator("details"); await details.locator("summary").click();
    const editor = details.getByRole("form", { name: `Editar tarefa: ${names.past}`, exact: true });
    const revision = Number(await editor.locator('input[name="editar_revisao"]').inputValue());
    await expect(editor.locator(`input[name="editar_dep"][value="${futureId}"]`)).toBeChecked();
    await editor.getByLabel("Prazo da tarefa", { exact: true }).fill(tomorrow);
    await editor.getByRole("button", { name: "Salvar tarefa", exact: true }).click();
    await expect(page.locator('.sucesso[role="status"]')).toHaveText("Tarefa atualizada.");
    await expect(page).toHaveURL(new RegExp(`campanha=${first}&prazo=atrasadas&ok=salva#tarefa-`));
    await expect(card(page, names.past)).toHaveCount(0);
    await expect(page.getByText("Tarefas exibidas: 0.", { exact: true })).toBeVisible();
    await apply(page, first, "futuros"); await expect(card(page, names.past)).toBeVisible();
    const fresh = card(page, names.past).locator("details"); await fresh.locator("summary").click();
    await expect(fresh.locator('input[name="editar_revisao"]')).toHaveValue(String(revision + 1));
    await expect(fresh.locator(`input[name="editar_dep"][value="${futureId}"]`)).toBeChecked();
    await expect(card(page, names.past).locator(".selo")).toHaveText("A fazer");
  });

  test("concluir remove do bucket aberto e preserva prazo/campanha no retorno", async ({ page }) => {
    await sameDay(); await entrar(page, "a-owner@local.test"); await page.goto(`${operation}?campanha=${first}&prazo=hoje`);
    await transition(page, names.today, "Iniciar", "Em andamento");
    await expect(page).toHaveURL(new RegExp(`campanha=${first}&prazo=hoje&ok=estado$`));
    await transition(page, names.today, "Concluir", "Concluída", false);
    await expect(page).toHaveURL(new RegExp(`campanha=${first}&prazo=hoje&ok=estado$`));
    await expect(total(page)).toHaveText("3");
    await expect(page.getByText("Nenhuma tarefa aberta corresponde a este filtro de prazo.", { exact: true })).toBeVisible();
    await apply(page, first, "todas"); await expect(card(page, names.today).locator(".selo")).toHaveText("Concluída");
  });

  test("prazo inválido/repetido e campanha ausente recusam sem resumo ou fallback", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    for (const query of [`campanha=${first}&prazo=`, `campanha=${first}&prazo=overdue`, `campanha=${first}&prazo=hoje&prazo=futuros`]) {
      await page.goto(`${operation}?${query}`);
      await expect(page.locator('.erro[role="alert"]')).toHaveText("Filtro de prazo inválido.");
      await expect(summary(page)).toHaveCount(0); await expect(card(page, names.future)).toHaveCount(0);
      await expect(form(page)).toHaveCount(0);
    }
    await page.goto(`${operation}?campanha=${randomUUID()}&prazo=hoje`);
    await expect(page.locator('.erro[role="alert"]')).toContainText("Filtro de campanha inválido ou indisponível"); await expect(summary(page)).toHaveCount(0);
  });

  test("Viewer filtra tarefas de B sem mutação e campanha alheia continua negada", async ({ page }) => {
    test.setTimeout(60_000); const betaName = `Filtro prazo Beta ${suffix}`, betaDay = await civilToday(TENANT_B);
    await entrar(page, "b-owner@local.test"); await create(page, TENANT_B, betaName, null, shift(betaDay, -1));
    await logout(page); await entrar(page, "ab-duas-empresas@local.test");
    await page.goto(`/e/${TENANT_B}/operacao?campanha=avulsas&prazo=atrasadas`);
    await expect(card(page, betaName)).toBeVisible(); await expect(card(page, betaName).getByRole("button")).toHaveCount(0); await expect(card(page, betaName).locator("details")).toHaveCount(0);
    await expect(card(page, names.future)).toHaveCount(0);
    await page.goto(`/e/${TENANT_B}/operacao?campanha=${first}&prazo=atrasadas`);
    await expect(page.locator('.erro[role="alert"]')).toContainText("Filtro de campanha inválido ou indisponível"); await expect(summary(page)).toHaveCount(0);
  });
});
