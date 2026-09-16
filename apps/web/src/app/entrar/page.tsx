import { redirect } from "next/navigation";
import { autenticar, enviarLinkMagico, guardarSessao, claimsAtuais } from "../../lib/session";

export default async function Entrar({ searchParams }: { searchParams: Promise<{ erro?: string; enviado?: string }> }) {
  if (await claimsAtuais()) redirect("/empresas");
  const { erro, enviado } = await searchParams;

  async function entrarComSenha(dados: FormData) {
    "use server";
    const email = String(dados.get("email") ?? "");
    const senha = String(dados.get("senha") ?? "");
    try {
      await guardarSessao(await autenticar(email, senha));
    } catch {
      redirect("/entrar?erro=credenciais");
    }
    redirect("/empresas");
  }

  async function pedirLink(dados: FormData) {
    "use server";
    try {
      await enviarLinkMagico(String(dados.get("email") ?? ""));
    } catch {
      redirect("/entrar?erro=link");
    }
    redirect("/entrar?enviado=1");
  }

  return (
    <div className="pilha">
      <h1>Entrar</h1>
      {erro === "credenciais" && <p className="erro">E-mail ou senha inválidos.</p>}
      {erro === "link" && <p className="erro">Não foi possível enviar o link agora.</p>}
      {enviado && <p className="aviso">Link enviado. No ambiente local ele aparece no Mailpit, em <code>http://127.0.0.1:54424</code>.</p>}

      <form action={entrarComSenha} className="card pilha">
        <div>
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label htmlFor="senha">Senha</label>
          <input id="senha" name="senha" type="password" required autoComplete="current-password" />
        </div>
        <button className="btn" type="submit">Entrar</button>
      </form>

      <form action={pedirLink} className="card pilha">
        <h2>Ou receba um link por e-mail</h2>
        <div>
          <label htmlFor="email-link">E-mail</label>
          <input id="email-link" name="email" type="email" required />
        </div>
        <button className="btn secundario" type="submit">Enviar link de acesso</button>
      </form>
    </div>
  );
}
