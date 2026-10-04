// I-03 — Brand OS e onboarding, pela interface, com sessões reais no Supabase local.
// Pressupõe o banco recém-recriado (db:reset → db:roles → verificar), como todo o gate: o estado
// vazio da marca é uma das coisas verificadas. A empresa Beta (b-owner dono, ab-duas-empresas
// leitor) concentra o fluxo; a Alfa (a-manager) cobre o papel que edita mas não publica.
import { test, expect } from "@playwright/test";
import { entrar, TENANT_A, TENANT_B } from "./ajuda";

const MARCA_B = `/e/${TENANT_B}/marca`;
const RASCUNHO_B = `${MARCA_B}/rascunho`;

test.describe.configure({ mode: "serial" });

test.describe("estados vazios e permissões", () => {
  test("marca ainda não publicada: estado vazio explica o próximo passo; início mostra o checklist real", async ({ page }) => {
    await entrar(page, "b-owner@local.test");
    await page.goto(MARCA_B);
    await expect(
      page.getByRole("heading", { name: "Sua marca ainda não foi publicada" }),
      "banco não está limpo: rode pnpm db:reset e pnpm db:roles antes do gate",
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar rascunho" })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0); // sem histórico ainda

    await page.goto(`/e/${TENANT_B}`);
    await expect(page.getByRole("heading", { name: "Próximo passo" })).toBeVisible();
    // A Beta já tem duas pessoas ativas (fato real); a marca ainda não foi publicada.
    await expect(page.getByText("1 de 2 passos concluídos")).toBeVisible();
    const itens = page.locator(".passo");
    await expect(itens.filter({ hasText: "Convidar a equipe" })).toContainText("Concluído");
    await expect(itens.filter({ hasText: "Cadastrar a marca mínima" })).toContainText("Pendente");
    await expect(itens.filter({ hasText: "Definir o objetivo" })).toContainText("Em breve");
    await expect(itens.filter({ hasText: "Conectar mídia" })).toContainText("opcional");
    await expect(page.getByRole("link", { name: "Ir para a marca" })).toBeVisible();
  });

  test("leitor consulta, mas não cria rascunho nem abre o editor", async ({ page }) => {
    await entrar(page, "ab-duas-empresas@local.test"); // leitor na Beta
    await page.goto(MARCA_B);
    await expect(page.getByRole("heading", { name: "Sua marca ainda não foi publicada" })).toBeVisible();
    await expect(page.getByText("Seu papel permite apenas consultar a marca.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar rascunho" })).toHaveCount(0);

    await page.goto(RASCUNHO_B);
    await expect(page.getByText("Seu papel não permite editar a marca.")).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
  });

  test("Gestor edita o rascunho, mas não vê a ação de publicar", async ({ page }) => {
    await entrar(page, "a-manager@local.test");
    await page.goto(`/e/${TENANT_A}/marca`);
    await page.getByRole("button", { name: "Criar rascunho" }).click();
    await expect(page.getByRole("heading", { name: "Rascunho da marca" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar rascunho" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar e publicar" })).toHaveCount(0);
    await expect(page.getByText("só Owner e Administrador publicam")).toBeVisible();
  });

  test("empresa de terceiro na URL é recusada, sem vazar a marca", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(MARCA_B);
    await expect(page).toHaveURL(/\/empresas/);
    await expect(page.getByText("Você não tem mais acesso a essa empresa.")).toBeVisible();
  });
});

test.describe("fluxo do Owner: rascunho, regras e publicação", () => {
  test("cria o rascunho e a publicação incompleta lista o que falta, preservando o que foi salvo", async ({ page }) => {
    await entrar(page, "b-owner@local.test");
    await page.goto(MARCA_B);
    await page.getByRole("button", { name: "Criar rascunho" }).click();
    await expect(page.getByRole("heading", { name: "Rascunho da marca" })).toBeVisible();

    await page.locator("#positioning").fill("Operações de marketing para SaaS B2B.");
    await page.getByRole("button", { name: "Salvar e publicar" }).click();
    await page.waitForURL(/erro=BRAND_NOT_PUBLISHABLE/);

    const erro = page.locator(".erro");
    await expect(erro).toContainText("A versão ainda não pode ser publicada");
    await expect(erro).toContainText("Tom de voz: informe o tom de voz");
    await expect(erro).toContainText("Produtos: cadastre ao menos um produto");
    // O salvamento antes da tentativa não se perdeu.
    await expect(page.locator("#positioning")).toHaveValue("Operações de marketing para SaaS B2B.");
  });

  test("afirmação permitida sem evidência não publica; com evidência publica e vira a vigente", async ({ page }) => {
    await entrar(page, "b-owner@local.test");
    await page.goto(RASCUNHO_B);
    await page.locator("#tone").fill("Direto e técnico.");
    await page.locator("#p_name_0").fill("Plataforma Oplyra");
    await page.locator("#p_desc_0").fill("Mídia, conteúdo e relatórios.");
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await page.waitForURL(/ok=salvo/);
    await expect(page.locator(".sucesso")).toContainText("Rascunho salvo.");

    // O produto salvo passa a ser opção nas afirmações.
    await page.locator("#c_product_0").selectOption({ label: "Plataforma Oplyra" });
    await page.locator("#c_text_0").fill("Reduz o tempo gasto em relatórios.");
    await page.locator("#c_rule_0").fill("Citar só com o estudo de caso vigente.");
    await page.getByRole("button", { name: "Salvar e publicar" }).click();
    await page.waitForURL(/erro=BRAND_NOT_PUBLISHABLE/);
    await expect(page.locator(".erro")).toContainText("Afirmação 1 · evidência: afirmação permitida exige evidência");

    await page.locator("#c_evid_0").fill("https://exemplo.test/estudo-de-caso");
    await page.getByRole("button", { name: "Salvar e publicar" }).click();
    await page.waitForURL(/\/marca\?ok=publicado/);

    await expect(page.locator(".sucesso")).toContainText("Versão publicada.");
    await expect(page.getByRole("heading", { name: "Versão 1 · vigente" })).toBeVisible();
    await expect(page.getByText("Operações de marketing para SaaS B2B.")).toBeVisible();
    await expect(page.getByText("Reduz o tempo gasto em relatórios.")).toBeVisible();
    const link = page.getByRole("link", { name: "https://exemplo.test/estudo-de-caso" });
    await expect(link).toHaveAttribute("href", "https://exemplo.test/estudo-de-caso");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(page.getByRole("table")).toBeVisible(); // histórico
  });

  test("o checklist de ativação reflete a marca publicada", async ({ page }) => {
    await entrar(page, "b-owner@local.test");
    await page.goto(`/e/${TENANT_B}`);
    await expect(page.getByText("2 de 2 passos concluídos")).toBeVisible();
    await expect(page.locator(".passo").filter({ hasText: "Cadastrar a marca mínima" })).toContainText("Concluído");
    await expect(page.getByText("A ativação disponível está concluída.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ir para a marca" })).toHaveCount(0);
  });

  test("a versão publicada não muda: alterações vão num novo rascunho, e produto futuro bloqueia disponibilidade", async ({ page }) => {
    await entrar(page, "b-owner@local.test");
    await page.goto(MARCA_B);
    await page.getByRole("button", { name: "Abrir novo rascunho" }).click();
    await expect(page.getByText("Versão 2 · cópia da versão vigente")).toBeVisible();
    // A cópia traz o conteúdo da vigente.
    await expect(page.locator("#positioning")).toHaveValue("Operações de marketing para SaaS B2B.");
    await expect(page.locator("#p_name_0")).toHaveValue("Plataforma Oplyra");

    await page.locator("#p_name_1").fill("Módulo X");
    await page.locator("#p_avail_1").selectOption("future");
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await page.waitForURL(/ok=salvo/);

    // Afirmação de disponibilidade PERMITIDA sobre o produto futuro: recusada.
    await page.locator("#c_kind_1").selectOption("availability");
    await page.locator("#c_product_1").selectOption({ label: "Módulo X" });
    await page.locator("#c_text_1").fill("Já está disponível.");
    await page.locator("#c_rule_1").fill("Citar na página de preços.");
    await page.locator("#c_evid_1").fill("Página de preços");
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await page.waitForURL(/erro=BRAND_CONTENT_INVALID/);
    await expect(page.locator(".erro")).toContainText("produto futuro não pode ter afirmação de disponibilidade permitida");

    // A vigente segue sendo a versão 1.
    await page.goto(MARCA_B);
    await expect(page.getByRole("heading", { name: "Versão 1 · vigente" })).toBeVisible();
    await expect(page.getByText("Há um rascunho aberto (versão 2)")).toBeVisible();
    await expect(page.getByText("Módulo X")).toHaveCount(0); // o produto novo não vazou para a publicada
  });
});

test.describe("acessibilidade e adaptação", () => {
  test("navegação marca a seção atual e o editor é operável por rótulos", async ({ page }) => {
    await entrar(page, "b-owner@local.test");
    await page.goto(RASCUNHO_B);
    await expect(page.getByRole("link", { name: "Marca", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByLabel("Posicionamento")).toBeVisible();
    await expect(page.getByLabel("Tom de voz")).toBeVisible();
    await page.getByLabel("Posicionamento").focus();
    const contorno = await page.getByLabel("Posicionamento").evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(contorno).not.toBe("none");
  });

  test("em 768 px as telas da marca não geram rolagem horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await entrar(page, "b-owner@local.test");
    for (const rota of [`/e/${TENANT_B}`, MARCA_B, RASCUNHO_B]) {
      await page.goto(rota);
      const estouro = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(estouro, rota).toBe(false);
    }
  });

  test("em 360 px o editor continua utilizável, em uma coluna", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await entrar(page, "b-owner@local.test");
    await page.goto(RASCUNHO_B);
    const estouro = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(estouro).toBe(false);
    await expect(page.getByRole("button", { name: "Salvar rascunho" })).toBeVisible();
  });
});
