import Link from "next/link";
import { contextoDaEmpresa } from "../../../lib/session";
import { activationDeps } from "../../../lib/deps-marca";
import { lerEmpresa } from "../../../lib/consultas";
import { getActivationChecklist } from "@oplyra/core/brand";
import type { ActivationStepState } from "@oplyra/core/brand";

const SELO: Record<ActivationStepState, { texto: string; classe: string }> = {
  done: { texto: "Concluído", classe: "selo ok" },
  pending: { texto: "Pendente", classe: "selo pendente" },
  unavailable: { texto: "Em breve", classe: "selo" },
};

/** Início da empresa: o próximo passo e o checklist de ativação, derivados do estado real (14 §3, F-01). */
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

  return (
    <div className="pilha">
      <div className="entre">
        <div>
          <h1>{empresa?.name ?? "Empresa"}</h1>
          <p className="muted">Você está como <strong>{ctx.roleKey}</strong>.</p>
        </div>
        <Link className="btn secundario" href="/empresas">Trocar de empresa</Link>
      </div>

      <section className="card" aria-labelledby="proximo-passo">
        <h2 id="proximo-passo">Próximo passo</h2>
        {checklist.next ? (
          <div className="entre">
            <p>{checklist.next.label}</p>
            <Link className="btn" href={`${base}/${checklist.next.href}`}>Fazer agora</Link>
          </div>
        ) : (
          <p>
            A ativação disponível está concluída. Definir o objetivo e conectar mídia chegam nos próximos incrementos.
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="ativacao">
        <h2 id="ativacao">Ativação</h2>
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
    </div>
  );
}
