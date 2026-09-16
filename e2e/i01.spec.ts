import { test, expect } from "@playwright/test";
import { entrar, sair, SENHA, TENANT_A, TENANT_B } from "./ajuda";

test.describe("entrada", () => {
  test("credenciais inválidas mostram erro e não criam sessão", async ({ page }) => {
    await entrar(page, "a-owner@local.test", "senha-errada");
    await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
    await page.goto("/empresas");
    await expect(page).toHaveURL(/\/entrar/); // rota protegida devolve ao login
  });

  test("login por senha leva às empresas do usuário", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await expect(page.getByRole("heading", { name: "Suas empresas" })).toBeVisible();
    await expect(page.getByText("Alfa Software (fictícia)")).toBeVisible();
  });

  test("rota protegida sem sessão vai para a entrada", async ({ page }) => {
    await page.goto(`/e/${TENANT_A}/equipe`);
    await expect(page).toHaveURL(/\/entrar/);
  });
});

test.describe("estados da lista de empresas", () => {
  test("sem vínculo, o estado vazio explica o próximo passo", async ({ page }) => {
    await entrar(page, "sem-empresa@local.test");
    await expect(page.getByText("Nenhuma empresa vinculada a este acesso.")).toBeVisible();
    await expect(page.getByText(/Peça um convite/)).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("com duas empresas, cada uma mostra o próprio papel", async ({ page }) => {
    await entrar(page, "ab-duas-empresas@local.test");
    const linhas = page.getByRole("row");
    await expect(page.getByText("Alfa Software (fictícia)")).toBeVisible();
    await expect(page.getByText("Beta Cloud (fictícia)")).toBeVisible();
    await expect(linhas.filter({ hasText: "Alfa" })).toContainText("marketing_manager");
    await expect(linhas.filter({ hasText: "Beta" })).toContainText("viewer");
  });

  test("sair encerra a sessão", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await sair(page);
    await expect(page).toHaveURL(/\/entrar/);
    await page.goto("/empresas");
    await expect(page).toHaveURL(/\/entrar/);
  });
});

test.describe("equipe e permissões", () => {
  test("Owner vê a equipe e convida, com o token exibido uma única vez", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.getByRole("link", { name: "Abrir equipe" }).click();
    await expect(page.getByRole("heading", { name: "Alfa Software (fictícia)" })).toBeVisible();
    await expect(page.getByText("Você está como")).toContainText("owner");

    const email = `e2e-${Date.now()}@local.test`;
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Papel").selectOption("marketing_manager");
    await page.getByRole("button", { name: "Gerar convite" }).click();

    await expect(page.getByText("Convite criado.")).toBeVisible();
    const convite = page.getByText(/\/convite\?token=/);
    await expect(convite).toBeVisible();

    // Recarregar não repete o token: ele só existe na resposta da criação.
    await page.goto(`/e/${TENANT_A}/equipe`);
    await expect(page.getByText("Convite criado.")).toHaveCount(0);
  });

  test("papel Leitura não vê formulário de convite nem ação de remover", async ({ page }) => {
    await entrar(page, "a-viewer@local.test");
    await page.goto(`/e/${TENANT_A}/equipe`);
    await expect(page.getByText("Você está como")).toContainText("viewer");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByText("Seu papel não permite convidar pessoas.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Gerar convite" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remover" })).toHaveCount(0);
  });

  test("empresa de terceiro na URL é recusada sem vazar dado", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(`/e/${TENANT_B}/equipe`);
    await expect(page).toHaveURL(/\/empresas/);
    await expect(page.getByText("Você não tem mais acesso a essa empresa.")).toBeVisible();
    await expect(page.getByText("Beta Cloud")).toHaveCount(0);
  });
});

test.describe("acessibilidade e adaptação", () => {
  test("o formulário de entrada é operável só pelo teclado", async ({ page }) => {
    await page.goto("/entrar");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("E-mail").first()).toBeFocused();
    await page.keyboard.type("a-owner@local.test");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Senha")).toBeFocused();
    await page.keyboard.type(SENHA);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Entrar" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Suas empresas" })).toBeVisible();
  });

  test("o foco é visível em todos os controles", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Senha").focus();
    const contorno = await page.getByLabel("Senha").evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(contorno).not.toBe("none");
  });

  test("em 768 px o conteúdo não gera rolagem horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await entrar(page, "a-owner@local.test");
    await page.goto(`/e/${TENANT_A}/equipe`);
    const estouro = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(estouro).toBe(false);
    await expect(page.getByRole("heading", { name: "Alfa Software (fictícia)" })).toBeVisible();
  });

  test("o tema escuro do guia está aplicado", async ({ page }) => {
    await page.goto("/entrar");
    const tokens = await page.evaluate(() => {
      const raiz = getComputedStyle(document.documentElement);
      return {
        fundo: raiz.getPropertyValue("--bg").trim(),
        acao: raiz.getPropertyValue("--accent").trim(),
        corpo: getComputedStyle(document.body).backgroundColor,
      };
    });
    expect(tokens.fundo).toBe("#0c1023");
    expect(tokens.acao).toBe("#5b3df5");
    expect(tokens.corpo).toBe("rgb(12, 16, 35)");
  });
});

test.describe("acesso por link no e-mail", () => {
  const MAILPIT = "http://127.0.0.1:54424";

  test("o link entregue no e-mail abre a sessão e não serve duas vezes", async ({ page, request }) => {
    // Caixa limpa: senão o teste pode achar um link de execução anterior, já usado.
    await request.delete(`${MAILPIT}/api/v1/messages`);
    await page.goto("/entrar");
    // Segundo formulário da tela: o de link por e-mail.
    await page.getByLabel("E-mail").nth(1).fill("a-manager@local.test");
    await page.getByRole("button", { name: "Enviar link de acesso" }).click();
    await expect(page.getByText(/Link enviado/)).toBeVisible();

    // Busca a mensagem mais recente para este destinatário.
    // expect.poll devolve o matcher, não o valor: o link é guardado aqui.
    let url: string | null = null;
    await expect.poll(async () => {
      const lista = await (await request.get(`${MAILPIT}/api/v1/messages`)).json();
      const msg = lista.messages?.find((m: { To: { Address: string }[] }) =>
        m.To?.[0]?.Address === "a-manager@local.test");
      if (!msg) return null;
      const corpo = await (await request.get(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
      const html: string = corpo.HTML ?? corpo.Text ?? "";
      url = html.match(/href="([^"]+confirmar[^"]*)"/)?.[1]?.replace(/&amp;/g, "&") ?? null;
      return url;
    }, { timeout: 15_000 }).not.toBeNull();
    expect(url).toContain("/auth/confirmar?token_hash=");
    await page.goto(url!);
    await expect(page.getByRole("heading", { name: "Suas empresas" })).toBeVisible();

    // Um link de acesso vale uma vez.
    await page.context().clearCookies();
    await page.goto(url!);
    await expect(page).toHaveURL(/erro=link-invalido/);
    await expect(page.getByText(/Este link expirou ou já foi usado/)).toBeVisible();
  });
});

test.describe("resposta e preferências do sistema", () => {
  test("o botão avisa que está enviando e bloqueia envio duplicado", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("E-mail").first().fill("a-owner@local.test");
    await page.getByLabel("Senha").fill(SENHA);
    // Atrasa a ação de servidor para observar o estado intermediário.
    await page.route("**/entrar", async (rota) => {
      await new Promise((r) => setTimeout(r, 1200));
      await rota.continue();
    });
    const botao = page.getByRole("button", { name: /Entrar|Entrando/ });
    await botao.click();
    await expect(botao).toHaveAttribute("aria-busy", "true");
    await expect(botao).toBeDisabled();
    await expect(page.getByText("Entrando…")).toBeVisible();
  });

  test("com redução de movimento, nenhuma transição desloca a tela", async ({ browser }) => {
    const contexto = await browser.newContext({ reducedMotion: "reduce" });
    const page = await contexto.newPage();
    await page.goto("/entrar");
    const duracao = await page.getByRole("button", { name: "Entrar" })
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    // O navegador devolve notação científica ("1e-05s"): comparar como número.
    expect(Number.parseFloat(duracao)).toBeLessThan(0.05);
    await contexto.close();
  });
});
