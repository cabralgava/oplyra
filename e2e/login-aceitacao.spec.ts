import { test, expect } from "@playwright/test";
import { entrar, sair, TENANT_A, TENANT_B } from "./ajuda";

// Aceitação do login por HTTP local (OPLYRA_ENV=local): cookie, JWT, expiração, logout e isolamento.
// Complementa i01 (credencial inválida, sem vínculo, tenant alheio). Não prova o login hospedado em develop.
const COOKIE = "oplyra_sessao";

async function cookieDeSessao(page: import("@playwright/test").Page) {
  return (await page.context().cookies()).find((c) => c.name === COOKIE);
}

test.describe("cookie de sessão", () => {
  test("é httpOnly, SameSite=Lax, limitado a 1 h e inacessível ao script", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    const c = await cookieDeSessao(page);
    expect(c).toBeDefined();
    expect(c!.httpOnly).toBe(true);
    expect(c!.sameSite).toBe("Lax");
    expect(c!.path).toBe("/");
    // Secure é falso só no ambiente local validado (HTTP); em develop/produção exige HTTPS (test/web-sessao).
    expect(c!.secure).toBe(false);
    const restante = c!.expires - Date.now() / 1000;
    expect(restante).toBeGreaterThan(0);
    expect(restante).toBeLessThanOrEqual(3600 + 5);
    expect(await page.evaluate(() => document.cookie)).not.toContain(COOKIE);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/eyJ/);
  });
});

test.describe("JWT inválido ou expirado", () => {
  test("token adulterado é recusado e a rota protegida volta ao login", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    const c = (await cookieDeSessao(page))!;
    const [h, p, s] = c.value.split(".");
    const adulterado = [h, p, `${s!.slice(0, -3)}${s!.endsWith("AAA") ? "BBB" : "AAA"}`].join(".");
    await page.context().clearCookies();
    await page.context().addCookies([{ ...c, value: adulterado }]);
    await page.goto("/empresas");
    await expect(page).toHaveURL(/\/entrar/);
    await page.goto(`/e/${TENANT_A}/equipe`);
    await expect(page).toHaveURL(/\/entrar/);
  });

  test("payload trocado sem reassinar (outro sub/papel) é recusado", async ({ page }) => {
    await entrar(page, "a-viewer@local.test");
    const c = (await cookieDeSessao(page))!;
    const [h, p, s] = c.value.split(".");
    const corpo = JSON.parse(Buffer.from(p!, "base64url").toString("utf8"));
    corpo.sub = "00000000-0000-4000-8000-000000000000";
    corpo.role = "service_role";
    const forjado = [h, Buffer.from(JSON.stringify(corpo)).toString("base64url"), s].join(".");
    await page.context().clearCookies();
    await page.context().addCookies([{ ...c, value: forjado }]);
    await page.goto("/empresas");
    await expect(page).toHaveURL(/\/entrar/);
  });

  test("token sem assinatura (alg none) é recusado", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    const c = (await cookieDeSessao(page))!;
    const p = c.value.split(".")[1]!;
    const h = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    await page.context().clearCookies();
    await page.context().addCookies([{ ...c, value: `${h}.${p}.` }]);
    await page.goto("/empresas");
    await expect(page).toHaveURL(/\/entrar/);
  });

  test("cookie que o navegador descartou por expiração leva ao login", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    const c = (await cookieDeSessao(page))!;
    await page.context().clearCookies();
    await page.context().addCookies([{ ...c, expires: Math.floor(Date.now() / 1000) - 60 }]);
    await page.goto("/empresas");
    await expect(page).toHaveURL(/\/entrar/);
  });

  test("valor lixo no cookie não derruba a aplicação", async ({ page }) => {
    await page.goto("/entrar");
    await page.context().addCookies([{ name: COOKIE, value: "nao-e-um-jwt", url: page.url() }]);
    const r = await page.goto("/empresas");
    expect(r?.status()).toBeLessThan(500);
    await expect(page).toHaveURL(/\/entrar/);
  });
});

test.describe("logout", () => {
  test("remove o cookie e o JWT antigo não abre mais a sessão no navegador", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await sair(page);
    await expect(page).toHaveURL(/\/entrar/);
    expect(await cookieDeSessao(page)).toBeUndefined();
    await page.goto(`/e/${TENANT_A}/equipe`);
    await expect(page).toHaveURL(/\/entrar/);
  });
});

test.describe("isolamento", () => {
  test("usuário só da empresa A não acessa nenhuma tela da empresa B", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    for (const rota of ["equipe", "estrategia", "marca", "execucoes", "campanhas"]) {
      await page.goto(`/e/${TENANT_B}/${rota}`);
      await expect(page).toHaveURL(/\/empresas/);
      await expect(page.getByText("Beta Cloud")).toHaveCount(0);
    }
  });

  test("usuário sem vínculo não entra em nenhuma das empresas de teste", async ({ page }) => {
    await entrar(page, "sem-empresa@local.test");
    for (const t of [TENANT_A, TENANT_B]) {
      await page.goto(`/e/${t}/equipe`);
      await expect(page).toHaveURL(/\/empresas/);
    }
  });

  test("UUID inexistente e empresa alheia dão a mesma resposta", async ({ page }) => {
    await entrar(page, "a-owner@local.test");
    await page.goto(`/e/${TENANT_B}/equipe`);
    const alheia = await page.getByText(/acesso a essa empresa/).textContent();
    await page.goto("/e/99999999-9999-4999-8999-999999999999/equipe");
    await expect(page).toHaveURL(/\/empresas/);
    expect(await page.getByText(/acesso a essa empresa/).textContent()).toBe(alheia);
  });

  test("papéis diferem por empresa para o mesmo usuário", async ({ page }) => {
    await entrar(page, "ab-duas-empresas@local.test");
    await page.goto(`/e/${TENANT_B}/equipe`);
    await expect(page.getByText("Você está como")).toContainText("viewer");
    await expect(page.getByRole("button", { name: "Gerar convite" })).toHaveCount(0);
  });
});
