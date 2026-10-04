// I-04 — Estratégia, campanhas e testes, pela interface, com sessões reais no Supabase local.
// Pressupõe o banco recém-recriado (db:reset → db:roles → verificar), como todo o gate. Usa a empresa Alfa:
// a-owner (dono), a-manager (gestor) e a-viewer (leitor). A marca é publicada aqui mesmo, pela interface, para que
// este arquivo não dependa do estado deixado pelo i03 (que concentra o fluxo na Beta).
import { test, expect, type Page } from "@playwright/test";
import { entrar, TENANT_A, TENANT_B } from "./ajuda";

const INICIO = `/e/${TENANT_A}`;
const MARCA = `${INICIO}/marca`;
const ESTRATEGIA = `${INICIO}/estrategia`;
const CAMPANHAS = `${INICIO}/campanhas`;

test.describe.configure({ mode: "serial" });

/** Publica uma marca mínima (um produto disponível e um futuro) pela interface, reaproveitando um rascunho aberto. */
async function publicarMarca(page: Page): Promise<void> {
  await page.goto(MARCA);
  const criar = page.getByRole("button", { name: "Criar rascunho" });
  if (await criar.isVisible()) await criar.click();
  else await page.getByRole("link", { name: "Editar rascunho" }).click();
  await expect(page.getByRole("heading", { name: "Rascunho da marca" })).toBeVisible();
  await page.locator("#positioning").fill("Operações de marketing para SaaS B2B.");
  await page.locator("#tone").fill("Direto e técnico.");
  await page.locator("#p_name_0").fill("Plataforma Alfa");
  await page.locator("#p_name_1").fill("Módulo Beta");
  await page.locator("#p_avail_1").selectOption("future");
  await page.getByRole("button", { name: "Salvar e publicar" }).click();
  await page.waitForURL(/\/marca\?ok=publicado/);
}

async function escolherProduto(page: Page, nome: string): Promise<void> {
  const valor = await page.locator("#produto option", { hasText: nome }).getAttribute("value");
  await page.locator("#produto").selectOption(valor!);
}

async function preencherMetodo(page: Page, completo: boolean): Promise<void> {
  const campos = { situacao: "Equipe de marketing sem visão de receita.", dor: "Relatórios manuais.", consequencia: "Decisões atrasadas.",
    desejo: "Ver o retorno por campanha.", mecanismo: "Painel unificado.", prova: "Estudo de caso.", oferta: "Demonstração gratuita." };
  for (const [campo, texto] of Object.entries(campos)) {
    if (completo || campo === "situacao") await page.locator(`#m_${campo}`).fill(texto);
  }
}

async function novaCampanha(page: Page, nome: string, produto: string, completo: boolean): Promise<void> {
  await page.goto(`${CAMPANHAS}/nova`);
  await page.locator("#nome").fill(nome);
  await page.locator("#objetivo").selectOption({ label: "Gerar demanda qualificada" });
  await escolherProduto(page, produto);
  await page.locator("#inicio").fill("2026-11-01");
  await page.locator("#fim").fill("2026-12-31");
  await page.locator("#orcamento").fill("5.000,00");
  await page.locator("#mensagem").fill("Veja o retorno de cada campanha.");
  await preencherMetodo(page, completo);
  await page.getByRole("button", { name: "Criar campanha" }).click();
  await page.waitForURL(/\/campanhas\/[0-9a-f-]{36}\?ok=criada/);
}

test.describe("pré-requisitos e estados vazios", () => {
  test("sem marca publicada, campanhas e nova campanha explicam o que falta", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(CAMPANHAS);
    await expect(page.getByRole("heading", { name: "Nenhuma campanha ainda" })).toBeVisible();
    await expect(page.getByRole("link", { name: "publique a marca" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nova campanha" })).toHaveCount(0);
    await page.goto(`${CAMPANHAS}/nova`);
    await expect(page.getByText("Publique a marca antes de criar uma campanha")).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
  });

  test("a estratégia começa vazia, com explicação", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await publicarMarca(page);
    await page.goto(ESTRATEGIA);
    await expect(page.getByText("Nenhum objetivo definido ainda.")).toBeVisible();
    await expect(page.getByText("Nenhuma persona cadastrada.")).toBeVisible();
    await page.goto(CAMPANHAS);
    await expect(page.getByText(/defina um objetivo/)).toBeVisible();
  });
});

test.describe("objetivos e personas", () => {
  test("cria objetivo com indicador; o progresso aparece como indisponível, nunca como zero", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(ESTRATEGIA);
    await page.locator("#nome").fill("Gerar demanda qualificada");
    await page.locator("#inicio").fill("2026-11-01");
    await page.locator("#fim").fill("2026-12-31");
    await page.locator("#k_name_0").fill("Leads qualificados");
    await page.locator("#k_unit_0").fill("leads");
    await page.locator("#k_target_0").fill("120");
    await page.getByRole("button", { name: "Criar objetivo" }).click();
    await page.waitForURL(/ok=objetivo/);
    await expect(page.locator(".sucesso")).toContainText("Objetivo criado.");
    const linha = page.getByRole("row", { name: /Leads qualificados/ });
    await expect(linha).toContainText("120 leads");
    await expect(linha).toContainText("Indisponível");
    await expect(page.getByText("01/11/2026 a 31/12/2026")).toBeVisible();
  });

  test("período invertido é recusado com a explicação do ponto", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(ESTRATEGIA);
    await page.locator("#nome").fill("Período ruim");
    await page.locator("#inicio").fill("2026-12-31");
    await page.locator("#fim").fill("2026-11-01");
    await page.getByRole("button", { name: "Criar objetivo" }).click();
    await page.waitForURL(/erro=STRATEGY_CONTENT_INVALID/);
    await expect(page.locator(".erro")).toContainText("Período: o fim não pode ser anterior ao início");
  });

  test("cria persona", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(ESTRATEGIA);
    await page.locator("#p_nome").fill("Gerente de marketing B2B");
    await page.locator("#p_dores").fill("Relatórios manuais");
    await page.getByRole("button", { name: "Criar persona" }).click();
    await page.waitForURL(/ok=persona/);
    await expect(page.getByText("Gerente de marketing B2B")).toBeVisible();
  });
});

test.describe("campanha: método, ativação e chave", () => {
  test("cria planejada com método incompleto; a chave é gerada e exibida", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await novaCampanha(page, "Lançamento Plataforma Pro", "Plataforma Alfa", false);
    await expect(page.getByRole("heading", { name: "Lançamento Plataforma Pro" })).toBeVisible();
    await expect(page.locator(".sucesso")).toContainText("Campanha criada como planejada.");
    await expect(page.locator("h1 + p .selo")).toHaveText("Planejada");
    await expect(page.locator("#chave")).toHaveText(/^cmp-lancamento-plataforma-pro-[0-9a-f]{4}$/);
    await expect(page.getByText("A chave fica fixa depois que a campanha for ativada")).toBeVisible();
    await expect(page.getByRole("button", { name: "Gerar nova chave" })).toBeVisible();
  });

  test("TST-30: ativar com método incompleto é recusado e lista o que falta", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(CAMPANHAS);
    await page.getByRole("link", { name: "Lançamento Plataforma Pro" }).click();
    await page.getByRole("button", { name: "Ativar" }).click();
    await page.waitForURL(/erro=CAMPAIGN_NOT_ACTIVATABLE/);
    const erro = page.locator(".erro");
    await expect(erro).toContainText("Dor: informe dor");
    await expect(erro).toContainText("Oferta: informe oferta");
    await expect(erro).not.toContainText("Situação:");
    await expect(page.locator("h1 + p .selo")).toHaveText("Planejada");
  });

  test("a chave pode ser regenerada enquanto planejada; completar o método e ativar fixa a chave", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(CAMPANHAS);
    await page.getByRole("link", { name: "Lançamento Plataforma Pro" }).click();
    const antes = await page.locator("#chave").innerText();
    await page.getByRole("button", { name: "Gerar nova chave" }).click();
    await page.waitForURL(/ok=chave/);
    const depois = await page.locator("#chave").innerText();
    expect(depois).not.toBe(antes);
    expect(depois).toMatch(/^cmp-lancamento-plataforma-pro-[0-9a-f]{4}$/);

    await preencherMetodo(page, true);
    await page.getByRole("button", { name: "Salvar campanha" }).click();
    await page.waitForURL(/ok=salva/);
    await expect(page.locator("#m_dor")).toHaveValue("Relatórios manuais.");

    await page.getByRole("button", { name: "Ativar" }).click();
    await page.waitForURL(/ok=estado/);
    await expect(page.locator("h1 + p .selo")).toHaveText("Ativa");
    await expect(page.locator("#chave")).toHaveText(depois);
    await expect(page.getByText("A chave é fixa: a campanha já foi ativada.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Gerar nova chave" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Salvar campanha" })).toHaveCount(0); // só planejada se edita
    await expect(page.getByText("Primeira ativação")).toBeVisible();
  });

  test("UTMs seguem a convenção: campanha = chave, origem e meio por canal", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(CAMPANHAS);
    await page.getByRole("link", { name: "Lançamento Plataforma Pro" }).click();
    const tabela = page.getByRole("table").filter({ hasText: "Origem" });
    await expect(tabela.getByRole("row", { name: /Meta Ads/ })).toContainText("paid_social");
    await expect(tabela.getByRole("row", { name: /Google Ads/ })).toContainText("paid_search");
    await expect(tabela.getByRole("row", { name: /E-mail/ })).toContainText("email");
    await expect(tabela.getByRole("row", { name: /LinkedIn Ads/ })).toContainText("linkedin");
    await expect(tabela.getByRole("button", { name: "Copiar parâmetros de Meta Ads" })).toBeVisible();
  });

  test("pausar, retomar e concluir; concluída é final e não aceita testes", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(CAMPANHAS);
    await page.getByRole("link", { name: "Lançamento Plataforma Pro" }).click();
    const chave = await page.locator("#chave").innerText();
    await page.getByRole("button", { name: "Pausar" }).click();
    await page.waitForURL(/ok=estado/);
    await expect(page.locator("h1 + p .selo")).toHaveText("Pausada");
    await page.getByRole("button", { name: "Retomar" }).click();
    await page.waitForURL(/ok=estado/);
    await expect(page.locator("h1 + p .selo")).toHaveText("Ativa");
    await expect(page.locator("#chave")).toHaveText(chave);

    // Testes enquanto a campanha está aberta.
    await page.locator("#hipotese").fill("Um gancho com número aumenta o clique.");
    await page.locator("#dimensao").selectOption("hook");
    await page.getByRole("button", { name: "Criar teste" }).click();
    await page.waitForURL(/ok=teste/);
    await expect(page.getByText("Um gancho com número aumenta o clique.")).toBeVisible();
    await expect(page.getByText("Planejado", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Iniciar" }).click();
    await page.waitForURL(/ok=teste-estado/);
    await expect(page.getByText("Em execução", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Concluir" }).click();
    await page.waitForURL(/ok=estado/);
    await expect(page.locator("h1 + p .selo")).toHaveText("Concluída");
    await expect(page.getByRole("button", { name: "Ativar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pausar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Criar teste" })).toHaveCount(0);
  });
});

test.describe("testes (hipótese) e produto futuro", () => {
  test("dimensão 'Outra' exige dizer qual; hipótese e dimensão são declaradas antes", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await novaCampanha(page, "Campanha de testes", "Plataforma Alfa", true);
    await page.locator("#hipotese").fill("Mostrar o preço antes aumenta a qualidade do lead.");
    await page.locator("#dimensao").selectOption("other");
    await page.getByRole("button", { name: "Criar teste" }).click();
    await page.waitForURL(/erro=STRATEGY_CONTENT_INVALID/);
    await expect(page.locator(".erro")).toContainText("Nota da dimensão: diga qual dimensão varia");
    await page.locator("#hipotese").fill("Mostrar o preço antes aumenta a qualidade do lead.");
    await page.locator("#dimensao").selectOption("other");
    await page.locator("#nota").fill("Posição do preço");
    await page.getByRole("button", { name: "Criar teste" }).click();
    await page.waitForURL(/ok=teste/);
    await expect(page.getByText("Outra: Posição do preço")).toBeVisible();
  });

  test("produto futuro: o rascunho existe, mas a ativação é recusada", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await novaCampanha(page, "Campanha do módulo futuro", "Módulo Beta", true);
    await expect(page.getByText("Futuro: não ativa até estar disponível")).toBeVisible();
    await page.getByRole("button", { name: "Ativar" }).click();
    await page.waitForURL(/erro=CAMPAIGN_NOT_ACTIVATABLE/);
    await expect(page.locator(".erro")).toContainText("Produto: o produto ainda não está disponível");
    await expect(page.locator("h1 + p .selo")).toHaveText("Planejada");
  });
});

test.describe("papéis e isolamento", () => {
  test("leitor consulta; não cria campanha, não ativa e não edita", async ({ page }) => {
    await entrar(page, "a-viewer@local.test");
    await page.goto(CAMPANHAS);
    await expect(page.getByRole("link", { name: "Lançamento Plataforma Pro" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nova campanha" })).toHaveCount(0);
    await page.goto(`${CAMPANHAS}/nova`);
    await expect(page.getByText("Seu papel não permite criar campanhas.")).toBeVisible();
    await page.goto(CAMPANHAS);
    await page.getByRole("link", { name: "Campanha de testes" }).click();
    await expect(page.getByRole("heading", { name: "Campanha de testes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ativar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Salvar campanha" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Criar teste" })).toHaveCount(0);
    await page.goto(ESTRATEGIA);
    await expect(page.getByText("Seu papel permite apenas consultar a estratégia.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar objetivo" })).toHaveCount(0);
  });

  test("gestor edita e ativa", async ({ page }) => {
    await entrar(page, "a-manager@local.test");
    await page.goto(CAMPANHAS);
    await page.getByRole("link", { name: "Campanha de testes" }).click();
    await page.getByRole("button", { name: "Ativar" }).click();
    await page.waitForURL(/ok=estado/);
    await expect(page.locator("h1 + p .selo")).toHaveText("Ativa");
  });

  test("campanha de outra empresa na URL é recusada, sem vazar nada", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(`/e/${TENANT_B}/campanhas`);
    await expect(page).toHaveURL(/\/empresas/);
    await expect(page.getByText("Você não tem mais acesso a essa empresa.")).toBeVisible();
    await page.goto(`${CAMPANHAS}/00000000-0000-4000-8000-000000000000`);
    await expect(page.getByText("Campanha não encontrada nesta empresa.")).toBeVisible();
    await page.goto(`${CAMPANHAS}/nao-e-um-uuid`);
    await expect(page.getByText("Campanha não encontrada nesta empresa.")).toBeVisible();
  });
});

test.describe("checklist, acessibilidade e adaptação", () => {
  test("o checklist reflete marca, objetivo, equipe e campanha reais", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(INICIO);
    await expect(page.getByText("4 de 4 passos concluídos")).toBeVisible();
    await expect(page.getByText("A ativação disponível está concluída.")).toBeVisible();
    const itens = page.locator(".passo");
    for (const passo of ["Cadastrar a marca mínima", "Definir o objetivo", "Convidar a equipe", "Criar a primeira campanha"]) {
      await expect(itens.filter({ hasText: passo }), passo).toContainText("Concluído");
    }
    await expect(itens.filter({ hasText: "Pedir a primeira copy" })).toContainText("Em breve");
  });

  test("navegação marca a seção atual e os formulários são operáveis por rótulo", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(CAMPANHAS);
    await expect(page.getByRole("link", { name: "Campanhas", exact: true })).toHaveAttribute("aria-current", "page");
    await page.goto(`${CAMPANHAS}/nova`);
    for (const rotulo of ["Nome da campanha", "Objetivo", "Produto da marca", "Persona (opcional)", "Início", "Fim", "Situação", "Oferta"]) {
      await expect(page.getByLabel(rotulo, { exact: true }), rotulo).toBeVisible();
    }
    const contorno = await page.getByLabel("Nome da campanha").evaluate((el) => { el.focus(); return getComputedStyle(el).outlineStyle; });
    expect(contorno).not.toBe("none");
  });

  for (const largura of [768, 360]) {
    test(`em ${largura} px as telas da estratégia não geram rolagem horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await entrar(page, "a-owner@local.test");
      await page.goto(CAMPANHAS);
      const link = await page.getByRole("link", { name: "Lançamento Plataforma Pro" }).getAttribute("href");
      for (const rota of [INICIO, ESTRATEGIA, CAMPANHAS, `${CAMPANHAS}/nova`, link!]) {
        await page.goto(rota);
        // Em caso de estouro, a mensagem lista os elementos que passam da borda direita da janela.
        const estouro = await page.evaluate(() => {
          const largura = document.documentElement.clientWidth;
          if (document.documentElement.scrollWidth <= largura + 1) return "";
          return [...document.querySelectorAll("body *")]
            .filter((el) => !el.closest(".rolavel") && el.getBoundingClientRect().right > largura + 1) // regiões roláveis podem ser mais largas
            .slice(0, 8).map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${String(el.className).split(" ")[0]} em ${el.parentElement?.tagName.toLowerCase()}.${String(el.parentElement?.className).split(" ")[0]} (${Math.round(el.getBoundingClientRect().right)}px)`).join(", ") || "sem elemento identificado";
        });
        expect(estouro, rota).toBe("");
      }
    });
  }
});
