import Link from "next/link";
import { contextoDaEmpresa } from "../../../lib/session";
import { activationDeps } from "../../../lib/deps-marca";
import { lerEmpresa } from "../../../lib/consultas";
import { ResumoAgentes } from "../../../components/visao-agentes";
import { getActivationChecklist } from "@oplyra/core/brand";
import type { ActivationStepState } from "@oplyra/core/brand";

const SELO: Record<ActivationStepState, { texto: string; classe: string }> = {
  done: { texto: "Concluído", classe: "selo ok" },
  pending: { texto: "Pendente", classe: "selo pendente" },
  unavailable: { texto: "Em breve", classe: "selo" },
};

const INDICADORES = ["Leads", "Qualificados", "Reuniões", "CAC", "ROAS", "Contratos"];

/**
 * Início (frame dashboard-oplyra, 4:9): coluna principal "Precisa de você" + "Operando agora",
 * coluna lateral "Últimos 7 dias". Só o checklist de ativação tem dados reais; indicadores e a
 * operação dos agentes ainda não têm fonte e aparecem como indisponíveis (nunca zero). O cartão
 * de plano do frame não foi reproduzido: planos e limites não estão aprovados.
 */
export default async function Inicio({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const ctx = await contextoDaEmpresa(tenantId);
  const empresa = await lerEmpresa(ctx);
  const base = `/e/${encodeURIComponent(tenantId)}`;

  // O checklist junta fatos de marca e de equipe: sem poder ver os dois, nada é exibido.
  if (!ctx.permissions.has("brand.read") || !ctx.permissions.has("member.read")) {
    return (
      <div className="pilha">
        <h1>{empresa?.name ?? "Empresa"}</h1>
        <div className="card vazio" role="status">
          <p>Seu papel não permite ver o andamento da ativação.</p>
        </div>
      </div>
    );
  }
  const checklist = await getActivationChecklist(activationDeps, ctx);
  const pendentes = checklist.steps.filter((s) => s.state === "pending").length;

  return (
    <div className="pilha">
      <div className="entre">
        <div>
          <h1>{empresa?.name ?? "Empresa"}</h1>
          <p className="muted">Você está como <strong>{ctx.roleKey}</strong>.</p>
          <p className="muted">
            {pendentes > 0
              ? `${pendentes} ${pendentes === 1 ? "ponto precisa" : "pontos precisam"} de você hoje.`
              : "Nada pendente de você agora."}
          </p>
        </div>
        <Link className="btn secundario" href="/empresas">Trocar de empresa</Link>
      </div>

      <div className="dash">
        <div className="pilha">
          <section aria-labelledby="proximo-passo">
            <p className="rotulo-secao">Precisa de você</p>
            <div className="card destaque-grad">
              <h2 id="proximo-passo">Próximo passo</h2>
              {checklist.next ? (
                <div className="entre">
                  <p>{checklist.next.label}</p>
                  <Link className="btn" href={`${base}/${checklist.next.href}`}>Ir para {checklist.next.href === "marca" ? "a marca" : "a equipe"} →</Link>
                </div>
              ) : (
                <p>A ativação disponível está concluída. Definir o objetivo e conectar mídia chegam nos próximos incrementos.</p>
              )}
            </div>
          </section>

          <section className="card" aria-labelledby="ativacao">
            <p className="rotulo-secao">Ativação</p>
            <h2 id="ativacao">Passos da ativação</h2>
            <p className="muted" role="status">
              {checklist.done} de {checklist.total} {checklist.total === 1 ? "passo concluído" : "passos concluídos"}
            </p>
            <ol className="passos">
              {checklist.steps.map((s) => (
                <li key={s.key} className="passo">
                  <span className={SELO[s.state].classe}>{SELO[s.state].texto}</span>
                  <span>
                    {s.state === "pending" && s.href ? <Link href={`${base}/${s.href}`}>{s.label}</Link> : s.label}
                    {s.optional && <span className="muted"> (opcional)</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <ResumoAgentes href={`${base}/agentes`} />

          <section aria-labelledby="operando">
            <p className="rotulo-secao">Operando agora</p>
            <div className="card vazio" id="operando">
              <p>Operação dos agentes indisponível.</p>
              <p className="muted">Quando houver execuções, elas aparecem aqui. O histórico atual está em <Link href={`${base}/execucoes`}>Execuções</Link>. Veja quais agentes já funcionam em <Link href={`${base}/agentes`}>Agentes</Link>.</p>
            </div>
          </section>
        </div>

        <aside aria-labelledby="ultimos-7">
          <div className="card">
            <p className="rotulo-secao" id="ultimos-7">Últimos 7 dias</p>
            <dl className="indicadores-lista">
              {INDICADORES.map((r) => (
                <div key={r}>
                  <dt>{r}</dt>
                  <dd className="muted" aria-label={`${r}: indisponível`}>Indisponível</dd>
                </div>
              ))}
            </dl>
            <p className="muted nota-pequena">Mídia e conversões ainda não conectadas.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
