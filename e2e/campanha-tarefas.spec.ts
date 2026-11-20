// Auth e persistência reais no banco descartável da CI; sem chamadas ao develop hospedado.
// Dados exclusivos por execução. Esta fatia lê vínculos; criação/edição usam telas já existentes.
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { entrar, TENANT_A, TENANT_B } from "./ajuda";

const suffix = randomUUID().slice(0, 8);
const firstCampaign = `Campanha tarefas ${suffix}`, otherCampaign = `Outra campanha tarefas ${suffix}`;
const linked = `Tarefa vinculada ${suffix}`, cancelled = `Tarefa cancelada ${suffix}`;
const outsider = `Tarefa de outra campanha ${suffix}`, loose = `Tarefa avulsa ${suffix}`;
const betaTask = `Tarefa Beta vinculada ${suffix}`;
let firstPath = "", otherPath = "", firstId = "", otherId = "", linkedId = "";
const operation = `/e/${TENANT_A}/operacao`;
const section = (page: Page) => page.getByRole("region", { name: "Tarefas vinculadas", exact: true });
const taskCard = (page: Page, title: string) => page.locator("li").filter({ has: page.getByRole("heading", { level: 3, name: title, exact: true }) });
const campaignTask = (page: Page, title: string) => section(page).locator("li").filter({ has: page.getByRole("heading", { level: 3, name: title, exact: true }) });
async function createCampaign(page: Page, tenant: string, name: string, key: string) {
  await page.goto(`/e/${tenant}/estrategia`);
  await page.locator("#c_name").fill(name);
  await page.locator("#c_key").fill(key);
  await page.getByRole("button", { name: "Criar campanha", exact: true }).click();
  await page.waitForURL(/\/campanhas\//);
  return new URL(page.url()).pathname;
}
async function createTask(page: Page, tenant: string, title: string, campaignId: string | null, dueDate?: string) {
  await page.goto(`/e/${tenant}/operacao`);
  await page.locator("input[name=title]").fill(title);
  await page.locator("select[name=campaignId]").selectOption(campaignId ?? "");
  if (dueDate) await page.locator("input[name=dueDate]").fill(dueDate);
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await expect(taskCard(page, title)).toBeVisible();
  return await taskCard(page, title).locator("input[name=tarefa]").first().inputValue();
}
async function editCampaignLink(page: Page, title: string, campaignId: string | null) {
  const details = taskCard(page, title).locator("details");
  if (!(await details.evaluate(el => (el as HTMLDetailsElement).open))) await details.locator("summary").click();
  const form = details.getByRole("form", { name: `Editar tarefa: ${title}`, exact: true });
  await form.getByLabel("Campanha da tarefa", { exact: true }).selectOption(campaignId ?? "");
  await form.getByRole("button", { name: "Salvar tarefa", exact: true }).click();
  await expect(details).toHaveJSProperty("open", false);
  await expect(page.locator('.sucesso[role="status"]')).toHaveText("Tarefa atualizada.");
}

test.describe.configure({ mode: "serial" });

test.describe("Campanha oficial — tarefas vinculadas", () => {
  test("campanha sem vínculo mostra vazio honesto e navegação à Operação", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    firstPath = await createCampaign(page, TENANT_A, firstCampaign, `vinculo-a-${suffix}`);
    firstId = firstPath.split("/").at(-1)!;
    otherPath = await createCampaign(page, TENANT_A, otherCampaign, `vinculo-outra-${suffix}`);
    otherId = otherPath.split("/").at(-1)!;
    await page.goto(firstPath);
    await expect(section(page)).toContainText("Nenhuma tarefa vinculada a esta campanha.");
    await expect(section(page).getByRole("list")).toHaveCount(0);
    await expect(section(page).getByRole("link", { name: "Abrir Operação", exact: true })).toHaveAttribute("href", `${operation}?campanha=${firstId}`);
    await expect(page.getByRole("navigation", { name: "Seções da campanha" }).getByRole("link", { name: "Tarefas", exact: true })).toHaveAttribute("href", "#tarefas-vinculadas");
  });

  test("lista somente vínculos da campanha com estado/prazo e abre o cartão correto", async ({ page }) => {
    // Quatro cadastros e duas transições reais; prazo explícito para este cenário de preparação.
    test.setTimeout(60_000);
    await entrar(page, "a-owner@local.test");
    linkedId = await createTask(page, TENANT_A, linked, firstId, "2028-02-29");
    await taskCard(page, linked).getByRole("button", { name: "Iniciar", exact: true }).click();
    await expect(taskCard(page, linked).locator(".selo")).toHaveText("Em andamento");
    await createTask(page, TENANT_A, cancelled, firstId);
    await taskCard(page, cancelled).getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(taskCard(page, cancelled).locator(".selo")).toHaveText("Cancelada");
    await createTask(page, TENANT_A, outsider, otherId);
    await createTask(page, TENANT_A, loose, null);
    await page.goto(firstPath);
    await expect(section(page).getByRole("listitem")).toHaveCount(2);
    await expect(campaignTask(page, linked)).toContainText("Em andamento");
    await expect(campaignTask(page, linked).locator("time")).toHaveAttribute("datetime", "2028-02-29");
    await expect(campaignTask(page, linked)).toContainText("29/02/2028");
    await expect(campaignTask(page, cancelled)).toContainText("Cancelada");
    await expect(campaignTask(page, cancelled)).toContainText("Sem prazo definido");
    for (const title of [outsider, loose]) await expect(section(page).getByRole("heading", { name: title, exact: true })).toHaveCount(0);
    await Promise.all([
      page.waitForEvent("domcontentloaded"),
      campaignTask(page, linked).getByRole("link", { name: "Ver na Operação", exact: true }).click(),
    ]);
    await expect(page).toHaveURL(new RegExp(`/operacao\\?campanha=${firstId}#tarefa-${linkedId}$`));
    await expect(page.locator(`#tarefa-${linkedId}`)).toBeInViewport();
    await expect(taskCard(page, linked)).toContainText("Em andamento");
  });

  test("reler reflete mudança e remoção de vínculo feitas pela edição oficial", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(operation);
    await editCampaignLink(page, outsider, firstId);
    await page.goto(firstPath);
    await expect(campaignTask(page, outsider)).toBeVisible();
    await expect(section(page).getByRole("listitem")).toHaveCount(3);
    await page.goto(otherPath);
    await expect(section(page)).toContainText("Nenhuma tarefa vinculada a esta campanha.");
    await page.goto(operation);
    await editCampaignLink(page, outsider, null);
    await page.goto(firstPath);
    await expect(campaignTask(page, outsider)).toHaveCount(0);
    await expect(section(page).getByRole("listitem")).toHaveCount(2);
  });

  test("B não lê campanha alheia e Leitor consulta vínculos de B sem edição", async ({ page }) => {
    test.setTimeout(60_000);
    await entrar(page, "b-owner@local.test");
    const betaPath = await createCampaign(page, TENANT_B, `Campanha Beta ${suffix}`, `vinculo-b-${suffix}`);
    const betaId = betaPath.split("/").at(-1)!;
    const betaTaskId = await createTask(page, TENANT_B, betaTask, betaId);
    await page.goto(betaPath);
    await expect(campaignTask(page, betaTask)).toBeVisible();
    await expect(section(page).getByRole("heading", { name: linked, exact: true })).toHaveCount(0);
    await page.goto(`/e/${TENANT_B}/estrategia/campanhas/${firstId}`);
    await expect(page).toHaveURL(/\/estrategia\?erro=CAMPAIGN_NOT_FOUND/);
    await expect(page.locator('.erro[role="alert"]')).toContainText("Campanha não encontrada.");
    await expect(page.getByRole("heading", { name: firstCampaign, exact: true })).toHaveCount(0);
    await page.goto("/empresas");
    await expect(page.getByRole("heading", { name: "Suas empresas", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await page.waitForURL(/\/entrar/);
    await entrar(page, "ab-duas-empresas@local.test");
    await page.goto(betaPath);
    await expect(campaignTask(page, betaTask)).toBeVisible();
    await expect(section(page).getByRole("button")).toHaveCount(0);
    await expect(section(page).getByRole("textbox")).toHaveCount(0);
    await Promise.all([
      page.waitForEvent("domcontentloaded"),
      campaignTask(page, betaTask).getByRole("link", { name: "Ver na Operação", exact: true }).click(),
    ]);
    await expect(page).toHaveURL(new RegExp(`/operacao\\?campanha=${betaPath.split("/").at(-1)!}#tarefa-${betaTaskId}$`));
    await expect(taskCard(page, betaTask).locator("details")).toHaveCount(0);
    await expect(taskCard(page, betaTask).getByRole("button")).toHaveCount(0);
  });
});
