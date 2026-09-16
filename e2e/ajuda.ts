import type { Page } from "@playwright/test";

export const SENHA = "oplyra-local-2026";
export const TENANT_A = "11111111-1111-4111-8111-111111111111";
export const TENANT_B = "22222222-2222-4222-8222-222222222222";

export async function entrar(page: Page, email: string, senha = SENHA): Promise<void> {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").first().fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  // O login é uma ação de servidor que redireciona: em sucesso para /empresas,
  // em falha de volta para /entrar com o erro. Esperar o destino evita navegar
  // antes de o cookie de sessão existir.
  await page.waitForURL(/\/empresas|\/entrar\?erro=/, { timeout: 15_000 });
}

export async function sair(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sair" }).click();
}
