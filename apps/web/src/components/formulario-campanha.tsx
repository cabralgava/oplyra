import type { Campaign, Objective, Persona } from "@oplyra/core/strategy";
import { METODO, ROTULO_METODO } from "@oplyra/core/strategy";
import type { BrandProduct } from "@oplyra/core/brand";
import { ROTULO_DISPONIBILIDADE } from "../lib/marca-form";
import { centavosParaCampo } from "../lib/estrategia-form";

/**
 * Campos da campanha (planejamento e método DEC-017), usados na criação e na edição de campanha planejada.
 * Componente de servidor: o formulário que o envolve define a ação. Valores iniciais vêm da campanha, se houver.
 */
export function CamposDaCampanha({ campanha, objetivos, produtos, personas }: {
  campanha?: Campaign;
  objetivos: readonly Objective[];
  produtos: readonly BrandProduct[];
  personas: readonly Persona[];
}) {
  return (
    <>
      <section className="card pilha" aria-labelledby="planejamento">
        <h2 id="planejamento">Planejamento</h2>
        <div>
          <label htmlFor="nome">Nome da campanha</label>
          <input id="nome" name="nome" maxLength={120} required defaultValue={campanha?.nome ?? ""} />
        </div>
        <div className="grade">
          <div>
            <label htmlFor="objetivo">Objetivo</label>
            <select id="objetivo" name="objetivo" required defaultValue={campanha?.objectiveId ?? ""}>
              <option value="" disabled>Escolha um objetivo</option>
              {objetivos.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="produto">Produto da marca</label>
            <select id="produto" name="produto" required defaultValue={campanha?.productKey ?? ""}>
              <option value="" disabled>Escolha um produto</option>
              {produtos.map((p) => (
                <option key={p.productKey} value={p.productKey}>
                  {p.name}{p.availability === "future" ? ` — ${ROTULO_DISPONIBILIDADE.future}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="persona">Persona (opcional)</label>
            <select id="persona" name="persona" defaultValue={campanha?.personaId ?? ""}>
              <option value="">Nenhuma</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        </div>
        <div className="grade">
          <div>
            <label htmlFor="inicio">Início</label>
            <input id="inicio" name="inicio" type="date" required defaultValue={campanha?.periodo.inicio ?? ""} />
          </div>
          <div>
            <label htmlFor="fim">Fim</label>
            <input id="fim" name="fim" type="date" required defaultValue={campanha?.periodo.fim ?? ""} />
          </div>
          <div>
            <label htmlFor="orcamento">Orçamento planejado (R$)</label>
            <input id="orcamento" name="orcamento" inputMode="decimal" placeholder="5.000,00" aria-describedby="orcamento-ajuda"
              defaultValue={campanha?.orcamento ? centavosParaCampo(campanha.orcamento.centavos) : ""} />
            <p id="orcamento-ajuda" className="muted">Apenas informativo; não limita nem consome nada.</p>
          </div>
        </div>
        <div>
          <label htmlFor="mensagem">Mensagem-chave</label>
          <input id="mensagem" name="mensagem" maxLength={500} defaultValue={campanha?.mensagemChave ?? ""} />
        </div>
      </section>

      <section className="card pilha" aria-labelledby="metodo">
        <h2 id="metodo">Método da campanha</h2>
        <p className="muted">
          Situação, dor, consequência, desejo, mecanismo, prova e oferta. Você pode salvar incompleto,
          mas a campanha só ativa com os sete campos preenchidos.
        </p>
        {METODO.map((campo) => (
          <div key={campo}>
            <label htmlFor={`m_${campo}`}>{ROTULO_METODO[campo]}</label>
            <textarea id={`m_${campo}`} name={`m_${campo}`} rows={2} maxLength={1000} defaultValue={campanha?.metodo[campo] ?? ""} />
          </div>
        ))}
      </section>
    </>
  );
}
