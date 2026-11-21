// Dados e contas exclusivas da CI; nenhuma chamada ao Supabase hospedado.
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { entrar, TENANT_A, TENANT_B } from "./ajuda";

const suffix = randomUUID().slice(0, 8);
const operation = `/e/${TENANT_A}/operacao`;
const campaignA = `Filtro campanha A ${suffix}`, campaignB = `Filtro campanha B ${suffix}`;
const linked = `Filtro vinculada ${suffix}`, outside = `Filtro dependência ${suffix}`, loose = `Filtro avulsa ${suffix}`;
let a = "", b = "", linkedId = "", outsideId = "", foreign = "";
const card = (page: Page, title: string) => page.locator("li").filter({ has: page.getByRole("heading", { level: 3, name: title, exact: true }) });
const filter = (page: Page) => page.getByRole("form", { name: "Filtrar tarefas por campanha", exact: true });
async function select(page: Page, value: string) {
  await filter(page).getByLabel("Filtrar tarefas por campanha", { exact: true }).selectOption(value);
  await filter(page).getByRole("button", { name: "Aplicar filtro", exact: true }).click();
  await page.waitForURL(url => url.pathname === operation && url.searchParams.get("campanha") === value);
  await expect(filter(page).getByLabel("Filtrar tarefas por campanha", { exact: true })).toHaveValue(value);
}
async function campaign(page: Page, tenant: string, name: string, key: string) {
  await page.goto(`/e/${tenant}/estrategia`);
  await page.locator("#c_name").fill(name); await page.locator("#c_key").fill(key);
  await page.getByRole("button", { name: "Criar campanha", exact: true }).click();
  await page.waitForURL(/\/campanhas\//); return new URL(page.url()).pathname.split("/").at(-1)!;
}
async function task(page: Page, title: string, campaignId: string | null, dependency?: string) {
  await page.goto(operation); await page.locator("input[name=title]").fill(title);
  await page.locator("select[name=campaignId]").selectOption(campaignId ?? "");
  if (dependency) await page.locator(`input[name=dep][value="${dependency}"]`).check();
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await expect(card(page, title)).toBeVisible();
  return card(page, title).locator("input[name=tarefa]").first().inputValue();
}
async function logout(page: Page) {
  await page.goto("/empresas"); await page.getByRole("button", { name: "Sair", exact: true }).click(); await page.waitForURL(/\/entrar/);
}
async function editor(page: Page, title: string) {
  const d = card(page, title).locator("details");
  if (!await d.evaluate(el => (el as HTMLDetailsElement).open)) await d.locator("summary").click();
  return d.getByRole("form", { name: `Editar tarefa: ${title}`, exact: true });
}

test.describe.configure({ mode: "serial" });
test.describe("Operação oficial — filtro por campanha", () => {
  test("troca campanha/avulsas e limpa filtro sem confundir opções com cartões", async ({ page }) => {
    test.setTimeout(90_000); await entrar(page, "a-owner@local.test");
    a = await campaign(page, TENANT_A, campaignA, `filtro-a-${suffix}`);
    b = await campaign(page, TENANT_A, campaignB, `filtro-b-${suffix}`);
    outsideId = await task(page, outside, b);
    linkedId = await task(page, linked, a, outsideId);
    await task(page, loose, null);
    await select(page, a); await expect(card(page, linked)).toBeVisible();
    await expect(card(page, outside)).toHaveCount(0); await expect(card(page, loose)).toHaveCount(0);
    await expect(page.locator("select[name=campaignId]")).toHaveValue(a);
    await select(page, b); await expect(card(page, outside)).toBeVisible(); await expect(card(page, linked)).toHaveCount(0);
    await select(page, "avulsas"); await expect(card(page, loose)).toBeVisible(); await expect(card(page, linked)).toHaveCount(0);
    await expect(page.locator("select[name=campaignId]")).toHaveValue("");
    await filter(page).getByRole("link", { name: "Limpar filtro", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/e/${TENANT_A}/operacao$`));
    await expect(card(page, linked)).toBeVisible(); await expect(card(page, outside)).toBeVisible(); await expect(card(page, loose)).toBeVisible();
  });

  test("editor mantém dependência de outra campanha e revisão durante save filtrado", async ({ page }) => {
    await entrar(page, "a-owner@local.test"); await page.goto(`${operation}?campanha=${a}`);
    const form = await editor(page, linked);
    const revision = Number(await form.locator('input[name=editar_revisao]').inputValue());
    const dependency = form.locator(`input[name=editar_dep][value="${outsideId}"]`);
    await expect(dependency).toBeChecked();
    await form.getByLabel("Descrição da tarefa", { exact: true }).fill("Descrição atualizada sem perder referência");
    await form.getByRole("button", { name: "Salvar tarefa", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`campanha=${a}&ok=salva#tarefa-${linkedId}$`));
    await expect(card(page, linked).locator("p.texto")).toHaveText("Descrição atualizada sem perder referência");
    await expect(card(page, linked)).toContainText(`Depende de: ${outside}`);
    const reloaded = await editor(page, linked);
    await expect(reloaded.locator('input[name=editar_revisao]')).toHaveValue(String(revision + 1));
    await expect(reloaded.locator(`input[name=editar_dep][value="${outsideId}"]`)).toBeChecked();
    await expect(card(page, linked).locator(".selo")).toHaveText("A fazer");
  });

  test("transições preservam filtro inclusive cancelamento", async ({ page }) => {
    await entrar(page, "a-owner@local.test"); await page.goto(`${operation}?campanha=${b}`);
    await card(page, outside).getByRole("button", { name: "Iniciar", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`campanha=${b}&ok=estado$`));
    await expect(card(page, outside).locator(".selo")).toHaveText("Em andamento");
    await card(page, outside).getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`campanha=${b}&ok=estado$`));
    await expect(card(page, outside).locator(".selo")).toHaveText("Cancelada");
    await expect(card(page, linked)).toHaveCount(0);
  });

  test("mover vínculo para fora do filtro remove cartão sem esconder sucesso", async ({ page }) => {
    await entrar(page, "a-owner@local.test"); await page.goto(`${operation}?campanha=${a}`);
    const form = await editor(page, linked);
    await form.getByLabel("Campanha da tarefa", { exact: true }).selectOption("");
    await form.getByRole("button", { name: "Salvar tarefa", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`campanha=${a}&ok=salva#tarefa-${linkedId}$`));
    await expect(page.locator('.sucesso[role="status"]')).toHaveText("Tarefa atualizada.");
    await expect(card(page, linked)).toHaveCount(0); await expect(page.getByText("Nenhuma tarefa vinculada a esta campanha.", { exact: true })).toBeVisible();
    await select(page, "avulsas"); await expect(card(page, linked)).toBeVisible();
    await expect(card(page, linked)).toContainText(`Depende de: ${outside}`);
  });

  test("filtro inválido ou campanha alheia recusa sem cair na lista geral", async ({ page }) => {
    await entrar(page, "b-owner@local.test");
    foreign = await campaign(page, TENANT_B, `Filtro privada ${suffix}`, `filtro-privada-${suffix}`);
    await logout(page); await entrar(page, "a-owner@local.test");
    for (const query of ["campanha=", "campanha=ruim", `campanha=${a}&campanha=${b}`, `campanha=${foreign}`, `campanha=${randomUUID()}`]) {
      await page.goto(`${operation}?${query}`);
      await expect(page.locator('.erro[role="alert"]')).toContainText("Filtro de campanha inválido ou indisponível");
      await expect(page.getByRole("link", { name: "Limpar filtro", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "A fazer", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Criar tarefa", exact: true })).toHaveCount(0);
      await expect(card(page, loose)).toHaveCount(0);
    }
  });

  test("Viewer filtra sem receber controles de mutação nem ampliar acesso", async ({ page }) => {
    await entrar(page, "ab-duas-empresas@local.test");
    await page.goto(`/e/${TENANT_B}/operacao?campanha=${foreign}`);
    await expect(filter(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar tarefa", exact: true })).toHaveCount(0);
    await expect(page.locator("details.seletor-menu")).toHaveCount(1);
    await expect(page.locator('li[id^="tarefa-"] details')).toHaveCount(0);
    await expect(page.locator("form").filter({ hasNot: page.locator('select[name=campanha]') })).toHaveCount(0);
    await page.goto(`/e/${TENANT_B}/operacao?campanha=${a}`);
    await expect(page.locator('.erro[role="alert"]')).toContainText("Filtro de campanha inválido ou indisponível");
  });
});
