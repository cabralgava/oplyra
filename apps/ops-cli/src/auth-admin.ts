import type { AuthAdminPort, UserId } from "@oplyra/core";

/** Localiza ou cria a identidade no Supabase Auth. Só o ops-cli usa. */
export function criarAuthAdmin(apiUrl: string, chaveDeServico: string): AuthAdminPort {
  const cabecalhos = { apikey: chaveDeServico, Authorization: `Bearer ${chaveDeServico}`, "Content-Type": "application/json" };
  return {
    async ensureUser(email) {
      const criacao = await fetch(`${apiUrl}/auth/v1/admin/users`, {
        method: "POST", headers: cabecalhos,
        body: JSON.stringify({ email, email_confirm: true }),
      });
      if (criacao.ok) return ((await criacao.json()) as { id: string }).id as UserId;

      const lista = await fetch(`${apiUrl}/auth/v1/admin/users?per_page=200`, { headers: cabecalhos });
      const { users = [] } = (await lista.json()) as { users?: { id: string; email: string }[] };
      const achado = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (!achado) throw new Error(`não foi possível localizar nem criar a identidade ${email}`);
      return achado.id as UserId;
    },
  };
}
