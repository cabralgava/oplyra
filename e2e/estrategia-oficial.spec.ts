// I-04 — telas oficiais já publicadas: objetivo, campanha, hipótese e isolamento.
// Banco descartável da CI/local; sem contas, chamadas ou dados do Supabase hospedado.
// /operacao não entra: a rota ainda não está publicada na base auditada.
// Os dados são únicos por execução (sufixo), então este arquivo não depende do banco recém-recriado nem
// interfere no estado que o i03 verifica. Alfa (a-owner) concentra o fluxo; Beta (b-owner, leitor
// ab-duas-empresas) cobre isolamento e o papel somente leitura.
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { entrar, TENANT_A, TENANT_B } from "./ajuda";

const ESTRATEGIA_A = `/e/${TENANT_A}/estrategia`;
const SUF = "oficial-" + randomUUID().slice(0, 8);
const NOME = `Lançamento ${SUF}`;
const CHAVE = `lanc-${SUF}`;
let urlCampanha = "";

test.describe.configure({ mode: "serial" });

test.describe("Estratégia oficial — fluxo do Owner", () => {
  test("cria objetivo com indicador e o torna principal", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(ESTRATEGIA_A);
    await expect(page.getByRole("heading", { name: "Central Estratégica", exact: true })).toBeVisible();

    // Sem indicador o domínio recusa e lista o ponto, sem perder a tela.
    await page.locator("#o_name").fill(`Objetivo ${SUF}`);
    await page.locator("#o_ini").fill("2026-10-01");
    await page.locator("#o_fim").fill("2026-12-31");
    await page.getByRole("button", { name: "Criar objetivo" }).click();
    await page.waitForURL(/erro=OBJECTIVE_INVALID/);
    await expect(page.locator(".erro")).toContainText("defina ao menos um indicador");

    await page.locator("#o_name").fill(`Objetivo ${SUF}`);
    await page.locator("#o_ini").fill("2026-10-01");
    await page.locator("#o_fim").fill("2026-12-31");
    await page.locator("#k_key_0").fill("reunioes");
    await page.locator("#k_name_0").fill("Reuniões");
    await page.locator("#k_metric_0").fill("reuniões marcadas");
    await page.locator("#k_unit_0").fill("reuniões");
    await page.locator("#k_target_0").fill("20,5");
    await page.getByRole("button", { name: "Criar objetivo" }).click();
    await page.waitForURL(/ok=objetivo/);
    const item = page.locator("li", { hasText: `Objetivo ${SUF}` });
    await expect(item).toContainText("alvo 20.5 reuniões");

    await item.getByRole("button", { name: "Tornar principal" }).click();
    await page.waitForURL(/ok=principal/);
    await expect(page.locator("li", { hasText: `Objetivo ${SUF}` }).locator(".selo.ok")).toContainText("Principal");
    await expect(page.getByRole("heading", { name: `Objetivo ${SUF}`, exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Alvos dos indicadores do objetivo principal" })).toContainText("Alvo: 20.5 reuniões");
  });

  test("campanha: ativar sem método lista o que falta; chave duplicada é recusada", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(ESTRATEGIA_A);
    await page.locator("#c_name").fill(NOME);
    await page.locator("#c_key").fill(CHAVE);
    await page.getByRole("button", { name: "Criar campanha" }).click();
    await page.waitForURL(/\/campanhas\//);
    urlCampanha = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { name: NOME })).toBeVisible();
    await expect(page.locator(".selo").first()).toContainText("Planejada");

    await page.getByRole("button", { name: "Ativar", exact: true }).click();
    await page.waitForURL(/erro=CAMPAIGN_NOT_ACTIVATABLE/);
    await expect(page.locator(".erro")).toContainText("A campanha ainda não pode ser ativada");
    await expect(page.locator(".erro")).toContainText("method.pain");

    // Mesma chave em outra campanha da empresa.
    await page.goto(ESTRATEGIA_A);
    await page.locator("#c_name").fill(`Outra ${SUF}`);
    await page.locator("#c_key").fill(CHAVE);
    await page.getByRole("button", { name: "Criar campanha" }).click();
    await page.waitForURL(/erro=CAMPAIGN_TRACKING_KEY_TAKEN/);
    await expect(page.locator(".erro")).toContainText("já é usada por outra campanha");
  });

  test("completa o método, ativa e a chave fica fixa; UTMs usam a chave", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(urlCampanha);
    for (const el of ["situation", "pain", "consequence", "desire", "mechanism", "proof", "offer"]) {
      await page.locator(`#m_${el}`).fill(`Texto de ${el}`);
    }
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await page.waitForURL(/ok=salvo/);
    await page.getByRole("button", { name: "Ativar", exact: true }).click();
    await page.waitForURL(/ok=estado/);
    await expect(page.locator(".selo").first()).toContainText("Ativa");
    await expect(page.locator("#trackingKey")).toBeDisabled();
    await expect(page.locator("#m_pain")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Salvar rascunho" })).toHaveCount(0);

    await page.locator("#destino").fill("https://exemplo.test/demo");
    await page.locator("#canal").selectOption("google_ads");
    await page.locator("#conteudo").fill("hook-a-v1");
    await page.getByRole("button", { name: "Gerar UTMs" }).click();
    const codigo = page.locator("section", { hasText: "UTMs recomendados" }).locator("code").first();
    await expect(codigo).toContainText(`utm_campaign=${CHAVE}`);
    await expect(codigo).toContainText("utm_source=google");
    await expect(page.getByText("proposta local, ainda não aprovada")).toBeVisible();
  });

  test("teste por hipótese: uma variante não é teste; amostra insuficiente não vira sucesso", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(urlCampanha);
    await page.locator("#hypothesis").fill(`Abrir pela dor aumenta reuniões ${SUF}`);
    await page.locator("#variants").fill("Só uma variante");
    await page.locator("#decisionMetric").fill("reuniões marcadas");
    await page.locator("#minimumSample").fill("30");
    await page.getByRole("button", { name: "Registrar hipótese" }).click();
    await page.waitForURL(/erro=EXPERIMENT_HYPOTHESIS_INVALID/);
    await expect(page.locator(".erro")).toContainText("ao menos duas variantes");

    await page.locator("#hypothesis").fill(`Abrir pela dor aumenta reuniões ${SUF}`);
    await page.locator("#variants").fill("Gancho pela dor\nGancho pelo ganho");
    await page.locator("#decisionMetric").fill("reuniões marcadas");
    await page.locator("#minimumSample").fill("30");
    await page.getByRole("button", { name: "Registrar hipótese" }).click();
    await page.waitForURL(/ok=teste/);

    const teste = page.locator("li", { hasText: `Abrir pela dor aumenta reuniões ${SUF}` });
    await expect(teste).toContainText("Planejado");
    await teste.getByRole("button", { name: "Iniciar" }).click();
    await page.waitForURL(/ok=teste/);
    await expect(teste).toContainText("Em execução");

    await teste.locator("select[name=outcome]").selectOption("supported");
    await teste.locator("input[name=observedSample]").fill("5");
    await teste.getByRole("button", { name: "Concluir", exact: true }).click();
    await page.waitForURL(/erro=EXPERIMENT_RESULT_INVALID/);
    await expect(page.locator(".erro")).toContainText("registre como inconclusivo");
    await expect(teste).toContainText("Em execução");

    await teste.locator("select[name=outcome]").selectOption("inconclusive");
    await teste.locator("input[name=observedSample]").fill("5");
    await teste.locator("input[name=limitations]").fill("Janela de três dias.");
    await teste.getByRole("button", { name: "Concluir", exact: true }).click();
    await page.waitForURL(/ok=teste/);
    await expect(teste).toContainText("Concluído");
    await expect(teste).toContainText("Inconclusivo");
    await expect(teste).toContainText("Janela de três dias.");
  });

});

test.describe("Estratégia oficial — papéis e isolamento", () => {
  test("leitor vê, mas não recebe formulários nem ações", async ({ page }) => {
    await entrar(page, "ab-duas-empresas@local.test"); // leitor na Beta
    for (const rota of [`/e/${TENANT_B}/estrategia`]) {
      await page.goto(rota);
      await expect(page.getByRole("heading", { name: "Central Estratégica", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Objetivos", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Campanhas", exact: true })).toBeVisible();
      await expect(page.locator("form")).toHaveCount(0);
    }
  });

  test("a Beta não alcança a campanha da Alfa pela URL, nem a Alfa a estratégia da Beta", async ({ page }) => {
    await entrar(page, "b-owner@local.test");
    const idCampanha = urlCampanha.split("/").pop()!;
    await page.goto(`/e/${TENANT_B}/estrategia/campanhas/${idCampanha}`);
    await page.waitForURL(/erro=CAMPAIGN_NOT_FOUND/);
    await expect(page.locator(".erro")).toContainText("Campanha não encontrada");
    await expect(page.locator("body")).not.toContainText(NOME);

    await page.goto(ESTRATEGIA_A); // empresa de terceiro
    await expect(page).toHaveURL(/\/empresas/);
    await expect(page.locator("body")).not.toContainText(NOME);
  });

  test("sem rolagem horizontal em 768 e 360 px", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    for (const largura of [768, 360]) {
      await page.setViewportSize({ width: largura, height: 900 });
      for (const rota of [ESTRATEGIA_A, urlCampanha]) {
        await page.goto(rota);
        const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(sobra, `${rota} em ${largura}px`).toBeLessThanOrEqual(0);
      }
    }
  });
});
