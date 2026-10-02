// CR-033 §13 passo 4 — higiene de CI (C-7, C-8, C-10 e a lint de C-4 do CR-032 §6).
// Lê os workflows por texto, sem dependência nova. Não importa scripts do harness.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8");
const WORKFLOWS_DIR = ".github/workflows";
const workflows = existsSync(join(RAIZ, WORKFLOWS_DIR))
  ? readdirSync(join(RAIZ, WORKFLOWS_DIR)).filter((n) => /\.ya?ml$/.test(n)).map((n) => ({ nome: n, texto: ler(`${WORKFLOWS_DIR}/${n}`) }))
  : [];
/** Remove comentários YAML de linha inteira ou finais, para que um comentário não conte como configuração. */
const semComentarios = (t: string) => t.split("\n").map((l) => l.replace(/(^|\s)#.*$/, "")).join("\n");

/** Pinagem aplicada localmente (SHAs completos em ci.yml); ainda não validada pelo CI remoto. Nenhuma action nova entra sem SHA. */
export const PENDING_SHA_PINS: readonly string[] = [];

describe("C-7 — descoberta do Vitest e do job validate", () => {
  it("test/contracts continua na descoberta do Vitest e `test` é `vitest run`", () => {
    const cfg = ler("vitest.config.ts");
    expect(cfg).toMatch(/include:\s*\[[^\]]*"test\/\*\*\/\*\.test\.ts"/);
    expect(cfg).not.toMatch(/exclude:[^\n]*contracts/);
    expect(existsSync(join(RAIZ, "test/contracts"))).toBe(true);
    const pkg = JSON.parse(ler("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts.test).toBe("vitest run");
    expect(pkg.scripts.verificar).toMatch(/pnpm test\b/);
  });

  it("o job `validate` executa `pnpm verificar`", () => {
    const ci = semComentarios(ler(`${WORKFLOWS_DIR}/ci.yml`));
    expect(ci).toMatch(/^\s{2}validate:/m);
    expect(ci).toMatch(/run:\s*pnpm verificar\s*$/m);
  });
});

describe("C-8 — actions fixadas por SHA", () => {
  const usos = workflows.flatMap((w) => [...semComentarios(w.texto).matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => ({ w: w.nome, ref: m[1]! })));

  it("há actions a verificar", () => {
    expect(usos.length).toBeGreaterThan(0);
  });

  it("toda action está fixada por SHA de 40 hex ou consta em PENDING_SHA_PINS; nenhuma action nova fica por tag", () => {
    const foraDaLista = usos.filter((u) => !/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(u.ref) && !PENDING_SHA_PINS.some((p) => u.ref.startsWith(`${p}@`)));
    expect(foraDaLista).toEqual([]);
  });

  it("PENDING_SHA_PINS não contém entrada obsoleta (já fixada ou removida)", () => {
    const porTag = PENDING_SHA_PINS.filter((p) => usos.some((u) => u.ref.startsWith(`${p}@`) && !/@[0-9a-f]{40}$/.test(u.ref)));
    expect([...porTag]).toEqual([...PENDING_SHA_PINS]);
  });
});

describe("C-8 — pinagem por SHA é pré-requisito PENDENTE das escritas reais (CR-033 D-7)", () => {
  const pendente = PENDING_SHA_PINS.length > 0;

  it("enquanto houver action por tag, a entrega delegada não pode estar ligada", () => {
    const chave = JSON.parse(ler(".claude/delegated-delivery.json")) as { delegatedDelivery: boolean };
    if (pendente) expect(chave.delegatedDelivery, "C-8 pendente: delegatedDelivery precisa continuar false").toBe(false);
  });

  it("o ESTADO.md registra o pré-requisito como pendente e nunca declara a pinagem concluída enquanto PENDING_SHA_PINS não estiver vazio", () => {
    const estado = ler("docs/harness/ESTADO.md");
    if (pendente) {
      expect(estado).toMatch(/PENDENTE[^\n]*pinagem[^\n]*SHA/i);
      expect(estado).not.toMatch(/pinagem[^\n]*(conclu[ií]d|feita|aplicada)/i);
    } else {
      expect(estado).not.toMatch(/PENDENTE[^\n]*pinagem[^\n]*SHA/i);
    }
  });
});

describe("C-9 e C-1 — cancelamento e higiene de diff", () => {
  const ci = semComentarios(ler(`${WORKFLOWS_DIR}/ci.yml`));

  it("cancel-in-progress não é verdadeiro para main", () => {
    expect(ci).not.toMatch(/cancel-in-progress:\s*true\b/);
    expect(ci).toMatch(/cancel-in-progress:\s*\$\{\{\s*github\.ref\s*!=\s*'refs\/heads\/main'\s*\}\}/);
  });

  it("o checkout tem histórico completo e `git diff --check` roda contra a base do PR", () => {
    expect(ci).toMatch(/fetch-depth:\s*0\b/);
    expect(ci).toMatch(/if:\s*github\.event_name == 'pull_request'/);
    expect(ci).toMatch(/run:\s*git diff --check "origin\/\$\{BASE_REF\}\.\.\.HEAD"/);
  });
});

describe("S4 — visibilidade de propriedade e proveniência", () => {
  it("CODEOWNERS cobre o control plane e o modelo de PR exige proveniência e avisa que revisão por IA é consultiva", () => {
    const co = ler(".github/CODEOWNERS");
    for (const p of ["/.github/", "/scripts/claude-*", "/.claude/", "/CLAUDE.md", "/tools/developer-harness/", "/docs/harness/", "/docs/product/marketing-ops/contracts/"]) {
      expect(co, p).toMatch(new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+@cabralgava$`, "m"));
    }
    const tpl = ler(".github/pull_request_template.md");
    expect(tpl).toMatch(/registro de autoriza/i);
    expect(tpl).toMatch(/consultiva/i);
    expect(tpl).toMatch(/Merge autom[aá]tico \*\*não está autorizado\*\*/);
  });
});

describe("C-10 — higiene de tokens e gatilhos (CR-033 §5.2)", () => {
  it("há workflows a verificar", () => {
    expect(workflows.length).toBeGreaterThan(0);
  });

  for (const w of workflows) {
    const t = semComentarios(w.texto);
    describe(w.nome, () => {
      it("declara permissions e nenhuma é de escrita", () => {
        expect(t).toMatch(/^permissions:/m);
        expect(t).not.toMatch(/^\s*[\w-]+:\s*write\b/m);
        expect(t).not.toMatch(/permissions:\s*write-all/);
      });
      it("sem pull_request_target, workflow_run nem workflow_dispatch", () => {
        for (const g of ["pull_request_target", "workflow_run", "workflow_dispatch"]) expect(t, g).not.toContain(g);
      });
      it("só referencia secrets.* equivalente a github.token (nenhum secret de Actions)", () => {
        expect(t).not.toMatch(/\bsecrets\./);
        expect(t).not.toMatch(/secrets:\s*inherit/);
      });
      it("sem runner self-hosted", () => {
        expect(t).not.toMatch(/self-hosted/);
        for (const m of t.matchAll(/runs-on:\s*(.+)/g)) expect(m[1]!.trim()).toMatch(/^(ubuntu|macos|windows)-[\w.-]+$/);
      });
      it("toda instalação usa --frozen-lockfile", () => {
        for (const m of t.matchAll(/run:\s*(pnpm install[^\n]*)/g)) expect(m[1], m[1]).toContain("--frozen-lockfile");
      });
    });
  }
});

describe("C-4 — lint de nome de branch e assunto de commit (CR-032 §3 e §4)", () => {
  const BRANCH = /^(agent\/)?(feat|fix|docs|test|refactor|chore|ci|revert)\/(i[0-9]{2}|cr-[0-9]{3}|dp-[0-9a-z]+|ops-[0-9]+)(-[a-z0-9]+){1,6}$/;
  const COMMIT = /^(feat|fix|docs|test|refactor|chore|ci|revert)(\([a-z0-9-]+\))?: [^\n]+[^.\n]$/;
  const assuntoValido = (s: string) => s.length <= 72 && COMMIT.test(s);

  it("aceita nomes de branch conformes", () => {
    for (const b of ["agent/feat/cr-033-delegated-delivery", "docs/cr-032-s1-policy-reconciliation", "feat/i01-first-slice"]) expect(BRANCH.test(b), b).toBe(true);
  });

  it("recusa nomes fora do padrão", () => {
    for (const b of ["main", "feature/x", "agent/feat/cr-33-x", "agent/feat/cr-033", "agent/feat/cr-033-Upper", "agent/feat/cr-033-a-b-c-d-e-f-g", "release/1"]) {
      expect(BRANCH.test(b), b).toBe(false);
    }
  });

  it("assunto de commit: Conventional Commits, até 72 caracteres, sem ponto final", () => {
    expect(assuntoValido("docs(contracts): reconcile Git lifecycle policy S1 (#4)")).toBe(true);
    expect(assuntoValido("feat(tooling): add secure developer harness")).toBe(true);
    for (const s of ["update stuff", "feat: termina com ponto.", "wip(x): y", `feat: ${"a".repeat(80)}`, "feat(Tooling): maiúscula"]) expect(assuntoValido(s), s).toBe(false);
  });
});
