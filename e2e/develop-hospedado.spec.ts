import { test, expect, type Page } from "@playwright/test";

// Somente pelo runner interativo deploy/develop/validate-hosted-login.mjs.
// Configuração exclusiva: não inicia servidor local nem grava traces, vídeos ou telas.
const ORIGEM = "https://oplyra-develop.netlify.app";
const ligado = process.env.OPLYRA_DEVELOP_E2E === "1";
const EMAIL = process.env.OPLYRA_DEVELOP_EMAIL ?? "";
const SENHA = process.env.OPLYRA_DEVELOP_SENHA ?? "";
const EMAIL_SEM = process.env.OPLYRA_DEVELOP_SEM_VINCULO_EMAIL ?? "";
const SENHA_SEM = process.env.OPLYRA_DEVELOP_SEM_VINCULO_SENHA ?? "";
const EMPRESA_PROPRIA = process.env.OPLYRA_DEVELOP_TENANT_PROPRIO ?? "";
const EMPRESA_ALHEIA = process.env.OPLYRA_DEVELOP_TENANT_ALHEIO ?? "";

test.skip(!ligado, "validação hospedada: defina OPLYRA_DEVELOP_E2E=1 (somente develop)");
test.use({ baseURL: ORIGEM });

async function entrar(page: Page, email: string, senha: string) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").first().fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/empresas|\/entrar\?erro=/, { timeout: 30_000 });
}

test.describe("develop hospedado — login", () => {
  test("a entrada carrega por HTTPS sem segredo no HTML e sem link mágico", async ({ page, request }) => {
    const r = await request.get("/entrar");
    expect(r.status()).toBe(200);
    const html = await r.text();
    expect(html).not.toMatch(/DATABASE_URL|service_role|sb_secret_|postgres(ql)?:\/\//i);
    await page.goto("/entrar");
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar link de acesso" })).toHaveCount(0); // não validado em develop
  });

  test("rota protegida sem sessão volta à entrada", async ({ page }) => {
    await page.goto("/empresas");
    await expect(page).toHaveURL(/\/entrar/);
  });

  test("senha errada mostra erro e não cria sessão", async ({ page }) => {
    await entrar(page, EMAIL || "ninguem@exemplo.invalid", `${SENHA || "x"}-errada`);
    await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
    expect((await page.context().cookies()).some((c) => c.name === "oplyra_sessao")).toBe(false);
  });

  test("login válido: cookie Secure+HttpOnly+Lax, ≤ 1 h; logout remove", async ({ page }) => {
    test.skip(!EMAIL || !SENHA, "sem conta controlada de develop");
    await entrar(page, EMAIL, SENHA);
    await expect(page.getByRole("heading", { name: "Suas empresas" })).toBeVisible();
    const c = (await page.context().cookies()).find((k) => k.name === "oplyra_sessao");
    expect(Boolean(c)).toBe(true);
    expect(c!.secure).toBe(true);
    expect(c!.httpOnly).toBe(true);
    expect(c!.sameSite).toBe("Lax");
    expect(c!.expires - Date.now() / 1000).toBeLessThanOrEqual(3605);
    expect(await page.evaluate(() => document.cookie.includes("oplyra_sessao"))).toBe(false);
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/entrar/);
    expect((await page.context().cookies()).some((k) => k.name === "oplyra_sessao")).toBe(false);
  });

  test("JWT adulterado é recusado", async ({ page }) => {
    test.skip(!EMAIL || !SENHA, "sem conta controlada de develop");
    await entrar(page, EMAIL, SENHA);
    const c = (await page.context().cookies()).find((k) => k.name === "oplyra_sessao")!;
    const [h, p, s] = c.value.split(".");
    await page.context().clearCookies();
    await page.context().addCookies([{ ...c, value: [h, p, `${s!.slice(0, -3)}${s!.endsWith("AAA") ? "BBB" : "AAA"}`].join(".") }]);
    await page.goto("/empresas");
    await expect(page).toHaveURL(/\/entrar/);
  });

  test("empresa inexistente recebe recusa, sem vazar dado", async ({ page }) => {
    test.skip(!EMAIL || !SENHA, "sem conta controlada de develop");
    await entrar(page, EMAIL, SENHA);
    await page.goto("/e/99999999-9999-4999-8999-999999999999/equipe");
    await expect(page).toHaveURL(/\/empresas/);
    await expect(page.getByText(/acesso a essa empresa/)).toBeVisible();
  });

  test("empresa própria abre; empresa existente alheia recebe a mesma recusa da inexistente", async ({ page }) => {
    test.skip(!EMAIL || !SENHA || !EMPRESA_PROPRIA || !EMPRESA_ALHEIA, "sem duas empresas controladas distintas");
    await entrar(page, EMAIL, SENHA);
    await page.goto(`/e/${EMPRESA_PROPRIA}/equipe`);
    await expect(page).toHaveURL(new RegExp(`/e/${EMPRESA_PROPRIA}/equipe`));
    await expect(page.getByRole("heading", { name: "Equipe", exact: true })).toBeVisible();
    for (const id of [EMPRESA_ALHEIA, "99999999-9999-4999-8999-999999999999"]) {
      await page.goto(`/e/${id}/equipe`);
      await expect(page).toHaveURL(/\/empresas/);
      await expect(page.getByText(/acesso a essa empresa/)).toBeVisible();
    }
  });

  test("conta autenticada sem vínculo não recebe empresa nem concessão artificial", async ({ page }) => {
    test.skip(!EMAIL_SEM || !SENHA_SEM, "sem conta de develop sem vínculo");
    await entrar(page, EMAIL_SEM, SENHA_SEM);
    await expect(page.getByText("Nenhuma empresa vinculada a este acesso.")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });
});
