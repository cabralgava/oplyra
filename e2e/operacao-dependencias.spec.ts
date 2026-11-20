// Cenários CI com Auth/banco descartáveis; nenhum acesso a develop ou provedores externos.
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { entrar, TENANT_A, TENANT_B } from "./ajuda";

const suffix = randomUUID().slice(0, 8);
const ownTitle = `Sinal dependente ${suffix}`, depTitle = `Sinal preparação ${suffix}`;
const betaTitle = `Sinal Beta dependente ${suffix}`, betaDep = `Sinal Beta preparação ${suffix}`;
const operation = `/e/${TENANT_A}/operacao`;
let campaignId = "", otherCampaignId = "", dependencyId = "";
const card = (page: Page, name: string) => page.locator("li").filter({ has: page.getByRole("heading", { level: 3, name, exact: true }) });
const signal = (page: Page, name = ownTitle) => card(page, name).getByRole("note", { name: "Situação das dependências", exact: true });
async function campaign(page: Page, name: string, key: string) {
  await page.goto(`/e/${TENANT_A}/estrategia`);
  await page.locator("#c_name").fill(name); await page.locator("#c_key").fill(key);
  await page.getByRole("button", { name: "Criar campanha", exact: true }).click();
  await page.waitForURL(/\/campanhas\//); return new URL(page.url()).pathname.split("/").at(-1)!;
}
async function task(page: Page, tenant: string, name: string, campaign: string | null, dependency?: string) {
  await page.goto(`/e/${tenant}/operacao`); await page.locator('input[name="title"]').fill(name);
  await page.locator('select[name="campaignId"]').selectOption(campaign ?? "");
  if (dependency) await page.locator(`input[name="dep"][value="${dependency}"]`).check();
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await expect(card(page, name)).toBeVisible();
  return card(page, name).locator('input[name="tarefa"]').first().inputValue();
}
async function transition(page: Page, name: string, button: string, status: string) {
  await card(page, name).getByRole("button", { name: button, exact: true }).click();
  await expect(card(page, name).locator(".selo")).toHaveText(status);
}
async function logout(page: Page) {
  await page.goto("/empresas"); await page.getByRole("button", { name: "Sair", exact: true }).click(); await page.waitForURL(/\/entrar/);
}
test.describe.configure({ mode: "serial" });
test.describe("Operação oficial — dependências informativas", () => {
  test("dependência fora do filtro é sinalizada sem criar novo estado nem impedir iniciar", async ({ page }) => {
    test.setTimeout(90_000); await entrar(page, "a-owner@local.test");
    campaignId = await campaign(page, `Sinal campanha ${suffix}`, `sinal-a-${suffix}`);
    otherCampaignId = await campaign(page, `Sinal outra campanha ${suffix}`, `sinal-b-${suffix}`);
    dependencyId = await task(page, TENANT_A, depTitle, otherCampaignId);
    await task(page, TENANT_A, ownTitle, campaignId, dependencyId);
    await page.goto(`${operation}?campanha=${campaignId}`);
    await expect(card(page, depTitle)).toHaveCount(0);
    await expect(signal(page)).toContainText("Dependências sem conclusão");
    await expect(signal(page)).toContainText("Pendentes: 1");
    await expect(signal(page)).toContainText("Esta indicação não impede alterar o estado da tarefa.");
    await expect(card(page, ownTitle)).toContainText(`${depTitle} — A fazer`);
    await expect(card(page, ownTitle).getByRole("button", { name: "Iniciar", exact: true })).toBeEnabled();
    await transition(page, ownTitle, "Iniciar", "Em andamento");
    await expect(signal(page)).toContainText("Dependências sem conclusão");
    await expect(page).toHaveURL(new RegExp(`campanha=${campaignId}&ok=estado$`));
  });

  test("releitura reflete concluir e reabrir a dependência", async ({ page }) => {
    await entrar(page, "a-owner@local.test"); await page.goto(`${operation}?campanha=${otherCampaignId}`);
    await transition(page, depTitle, "Iniciar", "Em andamento");
    await transition(page, depTitle, "Concluir", "Concluída");
    await page.goto(`${operation}?campanha=${campaignId}`);
    await expect(signal(page)).toContainText("Dependências concluídas"); await expect(signal(page)).toContainText("Concluídas: 1");
    await expect(signal(page)).not.toContainText("Dependências sem conclusão");
    await page.goto(`${operation}?campanha=${otherCampaignId}`);
    await transition(page, depTitle, "Reabrir", "Em andamento");
    await page.goto(`${operation}?campanha=${campaignId}`);
    await expect(signal(page)).toContainText("Dependências sem conclusão");
    await expect(card(page, ownTitle)).toContainText(`${depTitle} — Em andamento`);
  });

  test("cancelar dependência não a converte em concluída", async ({ page }) => {
    await entrar(page, "a-owner@local.test"); await page.goto(`${operation}?campanha=${otherCampaignId}`);
    await transition(page, depTitle, "Cancelar", "Cancelada");
    await page.goto(`${operation}?campanha=${campaignId}`);
    await expect(signal(page)).toContainText("Dependências sem conclusão");
    await expect(signal(page)).toContainText("Canceladas: 1"); await expect(signal(page)).toContainText("Concluídas: 0");
    await expect(card(page, ownTitle)).toContainText(`${depTitle} — Cancelada`);
  });

  test("tarefa concluída ou cancelada mantém histórico sem atenção ativa", async ({ page }) => {
    await entrar(page, "a-owner@local.test"); await page.goto(`${operation}?campanha=${campaignId}`);
    await transition(page, ownTitle, "Concluir", "Concluída");
    await expect(signal(page)).toContainText("Dependências registradas");
    await expect(signal(page)).not.toContainText("Dependências sem conclusão");
    await expect(signal(page)).toContainText("Canceladas: 1");
    await transition(page, ownTitle, "Reabrir", "Em andamento");
    await expect(signal(page)).toContainText("Dependências sem conclusão");
    await transition(page, ownTitle, "Cancelar", "Cancelada");
    await expect(signal(page)).toContainText("Dependências registradas");
    await expect(signal(page)).not.toContainText("Dependências sem conclusão");
  });

  test("Leitor vê sinal de B sem mutações e filtro alheio continua negado", async ({ page }) => {
    test.setTimeout(60_000); await entrar(page, "b-owner@local.test");
    const betaId = await task(page, TENANT_B, betaDep, null);
    await task(page, TENANT_B, betaTitle, null, betaId);
    await logout(page); await entrar(page, "ab-duas-empresas@local.test");
    await page.goto(`/e/${TENANT_B}/operacao?campanha=avulsas`);
    await expect(signal(page, betaTitle)).toContainText("Dependências sem conclusão");
    await expect(card(page, betaTitle)).toContainText(`${betaDep} — A fazer`);
    await expect(card(page, betaTitle).getByRole("button")).toHaveCount(0);
    await expect(card(page, betaTitle).locator("details")).toHaveCount(0);
    await expect(card(page, ownTitle)).toHaveCount(0);
    await page.goto(`/e/${TENANT_B}/operacao?campanha=${campaignId}`);
    await expect(page.locator('.erro[role="alert"]')).toContainText("Filtro de campanha inválido ou indisponível");
    await expect(card(page, ownTitle)).toHaveCount(0); await expect(card(page, betaTitle)).toHaveCount(0);
  });
});
