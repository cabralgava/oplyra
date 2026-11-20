// Edição oficial sobre Auth/UC/PostgreSQL reais no banco descartável da CI.
// Dados únicos por arquivo; não chama Supabase hospedado nem cria permissões de produto.
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { entrar, TENANT_A, TENANT_B } from "./ajuda";

const suffix = randomUUID().slice(0, 8);
const predecessor = `Briefing edição ${suffix}`;
const initial = `Oferta edição ${suffix}`;
const edited = `Oferta revisada ${suffix}`;
const campaign = `Campanha edição ${suffix}`;
const beta = `Tarefa Beta edição ${suffix}`;
const routeA = `/e/${TENANT_A}/operacao`, routeB = `/e/${TENANT_B}/operacao`;
const card = (page: Page, name: string) => page.locator("li").filter({ has: page.getByRole("heading", { name, exact: true, level: 3 }) });
const editor = (page: Page, name: string) => card(page, name).locator("details");
async function open(page: Page, name: string) {
  const details = editor(page, name);
  if (!(await details.evaluate((el) => (el as HTMLDetailsElement).open))) await details.locator("summary").click();
  await expect(details).toHaveJSProperty("open", true);
  return details.getByRole("form", { name: `Editar tarefa: ${name}`, exact: true });
}
async function create(page: Page, title: string) {
  await page.locator("input[name=title]").fill(title);
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await page.waitForURL(/ok=criada/);
  await expect(card(page, title)).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.describe("Operação oficial — edição de conteúdo", () => {
  test("edita detalhes persistidos sem mudar estado; revisão avança e editor fecha", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(`/e/${TENANT_A}/estrategia`);
    await page.locator("#c_name").fill(campaign);
    await page.locator("#c_key").fill(`edicao-${suffix}`);
    await page.getByRole("button", { name: "Criar campanha", exact: true }).click();
    await page.waitForURL(/\/campanhas\//);
    await page.goto(routeA);
    await create(page, predecessor);
    await create(page, initial);
    await card(page, initial).getByRole("button", { name: "Iniciar", exact: true }).click();
    await expect(card(page, initial).locator(".selo")).toHaveText("Em andamento");
    const form = await open(page, initial);
    const before = Number(await form.locator("[name=editar_revisao]").inputValue());
    await expect(form.locator("[name=assignee],[name=editar_assignee],[name=status],[name=editar_status]")).toHaveCount(0);
    await form.getByLabel("Título da tarefa", { exact: true }).fill(edited);
    await form.getByLabel("Descrição da tarefa", { exact: true }).fill("Detalhes mantidos na edição oficial");
    await form.getByLabel("Campanha da tarefa", { exact: true }).selectOption({ label: campaign });
    await form.getByLabel("Prazo da tarefa", { exact: true }).fill("2028-02-29");
    await form.getByRole("checkbox", { name: `Depende de ${predecessor}`, exact: true }).check();
    await form.getByRole("button", { name: "Salvar tarefa", exact: true }).click();
    await expect(card(page, edited)).toBeVisible();
    await expect(page.locator('.sucesso[role="status"]')).toHaveText("Tarefa atualizada.");
    await expect(editor(page, edited)).toHaveJSProperty("open", false);
    await page.reload();
    await expect(card(page, edited).locator(".selo")).toHaveText("Em andamento");
    await expect(card(page, edited)).toContainText("Detalhes mantidos na edição oficial");
    await expect(card(page, edited)).toContainText("29/02/2028");
    await expect(card(page, edited)).toContainText(campaign);
    await expect(card(page, edited)).toContainText(predecessor);
    const current = await open(page, edited);
    await expect(current.locator("[name=editar_revisao]")).toHaveValue(String(before + 1));
    await expect(current.getByRole("checkbox", { name: `Depende de ${predecessor}`, exact: true })).toBeChecked();
  });

  test("ciclo e título vazio são recusados sem avançar revisão e reabrem editor próprio", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(routeA);
    const prior = await open(page, predecessor);
    const revision = await prior.locator("[name=editar_revisao]").inputValue();
    await prior.getByRole("checkbox", { name: `Depende de ${edited}`, exact: true }).check();
    await prior.getByRole("button", { name: "Salvar tarefa", exact: true }).click();
    await page.waitForURL(/erro=TASK_DEPENDENCY_CYCLE/);
    await expect(page.locator('.erro[role="alert"]')).toContainText("ciclo");
    await expect(editor(page, predecessor)).toHaveJSProperty("open", true);
    await expect(editor(page, predecessor).locator("[name=editar_revisao]")).toHaveValue(revision);
    await expect(editor(page, predecessor).getByRole("checkbox", { name: `Depende de ${edited}`, exact: true })).not.toBeChecked();
    await page.goto(routeA);
    const form = await open(page, edited);
    const currentRevision = await form.locator("[name=editar_revisao]").inputValue();
    await form.getByLabel("Título da tarefa", { exact: true }).fill("   ");
    await form.getByRole("button", { name: "Salvar tarefa", exact: true }).click();
    await page.waitForURL(/erro=TASK_INVALID/);
    await expect(page.locator('.erro[role="alert"]')).toContainText("informe o título da tarefa");
    await expect(editor(page, edited)).toHaveJSProperty("open", true);
    await expect(editor(page, edited).locator("[name=editar_revisao]")).toHaveValue(currentRevision);
    await expect(editor(page, edited).getByLabel("Título da tarefa", { exact: true })).toHaveValue(edited);
    await expect(page.locator('.sucesso[role="status"]')).toHaveCount(0);
  });

  test("duas abas não sobrescrevem revisão nova e mostram dados atuais após conflito", async ({ page, context }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(routeA);
    const stale = await context.newPage();
    try {
      await stale.goto(routeA);
      const staleForm = await open(stale, edited);
      const first = await open(page, edited);
      await first.getByLabel("Descrição da tarefa", { exact: true }).fill("Salvo pela primeira aba");
      await first.getByRole("button", { name: "Salvar tarefa", exact: true }).click();
      await expect(card(page, edited)).toContainText("Salvo pela primeira aba");
      await expect(editor(page, edited)).toHaveJSProperty("open", false);
      await staleForm.getByLabel("Descrição da tarefa", { exact: true }).fill("Não deve sobrescrever");
      await staleForm.getByRole("button", { name: "Salvar tarefa", exact: true }).click();
      await stale.waitForURL(/erro=CONFLICT_VERSION/);
      await expect(stale.locator('.erro[role="alert"]')).toContainText("Outra pessoa alterou");
      await expect(editor(stale, edited)).toHaveJSProperty("open", true);
      await expect(editor(stale, edited).getByLabel("Descrição da tarefa", { exact: true })).toHaveValue("Salvo pela primeira aba");
      await stale.reload();
      await expect(card(stale, edited)).toContainText("Salvo pela primeira aba");
      await expect(card(stale, edited).locator(".selo")).toHaveText("Em andamento");
    } finally { await stale.close(); }
  });

  test("cancelamento concorrente recusa formulário anterior e remove edição", async ({ page, context }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(routeA);
    const stale = await context.newPage();
    try {
      await stale.goto(routeA);
      const form = await open(stale, edited);
      await card(page, edited).getByRole("button", { name: "Cancelar", exact: true }).click();
      await expect(card(page, edited).locator(".selo")).toHaveText("Cancelada");
      await expect(editor(page, edited)).toHaveCount(0);
      await form.getByLabel("Descrição da tarefa", { exact: true }).fill("Não salvar depois do cancelamento");
      await form.getByRole("button", { name: "Salvar tarefa", exact: true }).click();
      await stale.waitForURL(/erro=INVALID_STATE_TRANSITION/);
      await expect(stale.locator('.erro[role="alert"]')).toBeVisible();
      await expect(card(stale, edited).locator(".selo")).toHaveText("Cancelada");
      await expect(editor(stale, edited)).toHaveCount(0);
      await expect(card(stale, edited)).toContainText("Salvo pela primeira aba");
    } finally { await stale.close(); }
  });

  test("B não vê A; leitor vê somente dados de B sem editor ou escrita", async ({ page }) => {
    await entrar(page, "b-owner@local.test");
    await page.goto(routeB);
    await expect(page.getByText(edited, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("option", { name: campaign, exact: true })).toHaveCount(0);
    await create(page, beta);
    await page.goto(routeA);
    await expect(page).toHaveURL(/\/empresas\?erro=sem-acesso/);
    await expect(page.getByText(edited, { exact: true })).toHaveCount(0);
    await page.goto("/empresas");
    await expect(page.getByRole("heading", { name: "Suas empresas", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await page.waitForURL(/\/entrar/);
    await entrar(page, "ab-duas-empresas@local.test");
    await page.goto(routeB);
    await expect(card(page, beta)).toBeVisible();
    await expect(editor(page, beta)).toHaveCount(0);
    await expect(page.locator("input[name=editar_title]")).toHaveCount(0);
    await expect(card(page, beta).getByRole("button")).toHaveCount(0);
    await expect(page.locator("input[name=title]")).toHaveCount(0);
  });
});
