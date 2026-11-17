import Link from "next/link";
import type { ReactNode } from "react";
import { AGENTES, AVALIACAO_EM, contagemPorEstado, incluidoNoPlano, rotuloPlanos, type EstadoAgente, type PlanoId } from "../lib/catalogo-agentes";

const ESTADO: Record<EstadoAgente, { rotulo: string; classe: string; ajuda: string }> = {
  operando: { rotulo: "Funcionando", classe: "selo ok", ajuda: "Opera de ponta a ponta." },
  parcial: { rotulo: "Parcial · só em teste local", classe: "selo pendente", ajuda: "Parte funciona em teste local, sem operação real." },
  nao_funciona: { rotulo: "Não funcionando", classe: "selo proibido", ajuda: "Definido, mas ainda não opera." },
};
const NOME_PLANO: Record<PlanoId, string> = { performance: "Performance", growth: "Growth" };

/** Resumo compacto para o dashboard (Início): contagem por estado e link para a visão completa. */
export function ResumoAgentes({ href }: { href: string }) {
  const c = contagemPorEstado(AGENTES);
  return (
    <section className="card pilha" aria-labelledby="resumo-agentes">
      <p className="rotulo-secao">Agentes</p>
      <h2 id="resumo-agentes" className="titulo-secao">{AGENTES.length} agentes definidos; operação ainda parcial</h2>
      <p>
        <span className={ESTADO.operando.classe}>{c.operando} funcionando</span>{" "}
        <span className={ESTADO.parcial.classe}>{c.parcial} parciais</span>{" "}
        <span className={ESTADO.nao_funciona.classe}>{c.nao_funciona} não funcionando</span>
      </p>
      <p className="muted nota-pequena">Avaliação da equipe em {AVALIACAO_EM}, não telemetria. <Link href={href}>Ver todos os agentes →</Link></p>
    </section>
  );
}

/**
 * Visão de todos os agentes do produto. `plano` indica o plano ativo; com `null` o plano da empresa é desconhecido (sem fonte de
 * entitlement) e nenhuma habilitação por plano é aplicada. `extra` recebe, por chave de agente, conteúdo adicional (ex.: execuções na demo).
 */
export function VisaoAgentes({ plano, extra }: { plano: PlanoId | null; extra?: Record<string, ReactNode> }) {
  const contagem = contagemPorEstado(AGENTES);
  const doPlano = plano ? AGENTES.filter((a) => incluidoNoPlano(a, plano)) : AGENTES;
  const contagemPlano = contagemPorEstado(doPlano);
  return (
    <div className="pilha">
      <section className="card pilha" aria-labelledby="agentes-resumo">
        <h2 id="agentes-resumo" className="titulo-secao">12 agentes definidos; operação ainda parcial</h2>
        <p className="muted">Performance usa oito agentes; Growth acrescenta quatro. Um módulo, handler ou teste não significa que o agente opera de ponta a ponta.</p>
        <p role="status">
          <span className={ESTADO.operando.classe}>{contagem.operando} funcionando</span>{" "}
          <span className={ESTADO.parcial.classe}>{contagem.parcial} parciais</span>{" "}
          <span className={ESTADO.nao_funciona.classe}>{contagem.nao_funciona} não funcionando</span>
        </p>
        <p className="muted nota-pequena">
          {plano
            ? `No plano ${NOME_PLANO[plano]}: ${doPlano.length} agentes incluídos (${contagemPlano.operando} funcionando, ${contagemPlano.parcial} parciais, ${contagemPlano.nao_funciona} não funcionando).`
            : "Plano da empresa não informado: ainda não há fonte de habilitação por plano na aplicação, então nenhum agente é marcado como ligado ou desligado por plano."}
          {" "}O estado é uma avaliação da equipe feita em {AVALIACAO_EM} a partir do repositório, não telemetria em tempo real.
        </p>
      </section>

      <ul className="camp-grade agentes-grade" aria-label="Agentes">
        {AGENTES.map((a) => {
          const dentro = plano ? incluidoNoPlano(a, plano) : true;
          const e = ESTADO[a.estado];
          return (
            <li key={a.chave} className={dentro ? "camp" : "camp agente-fora"}>
              <div className="agente-topo">
                <span className="selo">{rotuloPlanos(a)}</span>
                <span className={dentro ? e.classe : "selo"}>{dentro ? e.rotulo : "Fora do plano"}</span>
              </div>
              <h3>{a.nome}</h3>
              <p className="muted">{a.resumo}</p>
              {plano && <p className="muted">{dentro ? `Incluído no plano ${NOME_PLANO[plano]}.` : `Não incluído no plano ${NOME_PLANO[plano]}; disponível no Growth.`}</p>}
              <details>
                <summary>Implementação e limites</summary>
                <p><strong>Hoje:</strong> {a.situacao}</p>
                <p><strong>Limites:</strong> {a.limites}</p>
                <p className="muted">{e.ajuda}</p>
              </details>
              {extra?.[a.chave]}
              <code className="agente-chave">{a.chave}</code>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
