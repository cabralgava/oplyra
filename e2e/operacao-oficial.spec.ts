// Percurso oficial com Auth, casos de uso e persistência reais no banco descartável da CI.
// Sem dados/credenciais hospedados. As provas hospedadas continuam uma etapa separada.
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { entrar, sair, TENANT_A, TENANT_B } from "./ajuda";

const suffix = randomUUID().slice(0, 8);
const title = `Revisar oferta ${suffix}`;
const dependent = `Preparar entrega ${suffix}`;
const betaTitle = `Tarefa Beta ${suffix}`;
const campaignTitle = `Campanha de operação ${suffix}`;
const routeA = `/e/${TENANT_A}/operacao`;
const routeB = `/e/${TENANT_B}/operacao`;
const card = (page: Page, name: string) => page.locator("li").filter({ has: page.getByRole("heading", { name, exact: true }) });
async function create(page: Page, name: string) {
  await page.locator("input[name=title]").fill(name);
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await page.waitForURL(/ok=criada/);
  await expect(card(page, name)).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.describe("Operação oficial — tarefas persistidas", () => {
  test("título com espaços é recusado pelo servidor sem sucesso aparente", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(routeA);
    await page.locator("input[name=title]").fill("   ");
    await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
    await page.waitForURL(/erro=TASK_INVALID/);
    await expect(page.getByRole("alert")).toContainText("informe o título da tarefa");
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("cria campanha vinculada, prazo e descrição; recarregar mantém os dados", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(`/e/${TENANT_A}/estrategia`);
    await page.locator("#c_name").fill(campaignTitle);
    await page.locator("#c_key").fill(`operacao-${suffix}`);
    await page.getByRole("button", { name: "Criar campanha", exact: true }).click();
    await page.waitForURL(/\/campanhas\//);
    await page.goto(routeA);
    await expect(page.getByRole("heading", { name: "Operação", exact: true })).toBeVisible();
    await page.locator("[name=campaignId]").selectOption({ label: campaignTitle });
    await page.locator("[name=description]").fill("Conferir a proposta com a campanha");
    await page.locator("[name=dueDate]").fill("2028-02-29");
    await create(page, title);
    await page.reload();
    await expect(card(page, title)).toContainText("A fazer");
    await expect(card(page, title)).toContainText("Conferir a proposta com a campanha");
    await expect(card(page, title)).toContainText("29/02/2028");
    await expect(card(page, title)).toContainText(campaignTitle);
  });

  test("dependência permanece visível; iniciar não depende de concluir a anterior", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(routeA);
    await page.getByRole("checkbox", { name: title, exact: true }).check();
    await create(page, dependent);
    await page.reload();
    await expect(card(page, dependent)).toContainText(title);
    await card(page, dependent).getByRole("button", { name: "Iniciar", exact: true }).click();
    await page.waitForURL(/ok=estado/);
    await expect(card(page, dependent)).toContainText("Em andamento");
    await expect(card(page, title)).toContainText("A fazer");
  });

  test("revisão obsoleta é recusada e a mudança anterior permanece", async ({ page, context }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(routeA);
    // Duas telas reais, sem interceptar requisições ou fabricar resposta de sucesso.
    const stale = await context.newPage();
    try {
      await stale.goto(routeA);
      await expect(card(stale, title)).toContainText("A fazer");
      await card(page, title).getByRole("button", { name: "Iniciar", exact: true }).click();
      await page.waitForURL(/ok=estado/);
      await card(stale, title).getByRole("button", { name: "Cancelar", exact: true }).click();
      await stale.waitForURL(/erro=CONFLICT_VERSION/);
      await expect(stale.getByRole("alert")).toContainText("Outra pessoa alterou");
      await stale.reload();
      await expect(card(stale, title)).toContainText("Em andamento");
    } finally { await stale.close(); }
  });

  test("conclui, reabre e cancela com releitura e estado terminal", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(routeA);
    await card(page, dependent).getByRole("button", { name: "Concluir", exact: true }).click();
    await page.waitForURL(/ok=estado/);
    await page.reload();
    await expect(card(page, dependent)).toContainText("Concluída");
    await card(page, dependent).getByRole("button", { name: "Reabrir", exact: true }).click();
    await page.waitForURL(/ok=estado/);
    await expect(card(page, dependent)).toContainText("Em andamento");
    await card(page, dependent).getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.waitForURL(/ok=estado/);
    await expect(card(page, dependent)).toContainText("Cancelada");
    await page.reload();
    await expect(card(page, dependent)).toContainText("Cancelada");
    await expect(card(page, dependent).getByRole("button")).toHaveCount(0);
  });

  test("empresa B tem sua própria tarefa e não recebe títulos ou dependências de A", async ({ page }) => {
    await entrar(page, "b-owner@local.test");
    await page.goto(routeB);
    await expect(page.getByRole("heading", { name: "Operação", exact: true })).toBeVisible();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    await expect(page.getByText(dependent, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("option", { name: campaignTitle, exact: true })).toHaveCount(0);
    await create(page, betaTitle);
    await page.goto(routeA);
    await expect(page.getByRole("heading", { name: "Operação", exact: true })).toHaveCount(0);
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  });

  test("leitor vê tarefa autorizada e não recebe escrita", async ({ page }) => {
    await entrar(page, "ab-duas-empresas@local.test");
    await page.goto(routeB);
    await expect(page.getByRole("heading", { name: "Operação", exact: true })).toBeVisible();
    await expect(card(page, betaTitle)).toContainText("A fazer");
    await expect(page.getByRole("button", { name: "Criar tarefa", exact: true })).toHaveCount(0);
    await expect(page.locator("input[name=title]")).toHaveCount(0);
    await expect(card(page, betaTitle).getByRole("button")).toHaveCount(0);
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    await sair(page);
  });
});
