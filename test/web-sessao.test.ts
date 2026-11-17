import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { cookieSeguro, duracaoDaSessao, DURACAO_MAXIMA_S } from "../apps/web/src/lib/sessao-cookie.ts";

const jwt = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;
const AGORA = 1_800_000_000;

describe("cookie de sessão", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("HTTP só em local/ci; develop, produção e ambiente ausente exigem Secure", () => {
    expect(cookieSeguro("local")).toBe(false);
    expect(cookieSeguro("ci")).toBe(false);
    expect(cookieSeguro("develop")).toBe(true);
    expect(cookieSeguro("production")).toBe(true);
    vi.stubEnv("OPLYRA_ENV", undefined);
    expect(cookieSeguro(undefined)).toBe(true);
  });
  it("sem argumento consulta o ambiente atual, inclusive no processo de CI", () => {
    for (const [env, expected] of [["local",false],["ci",false],["develop",true],["production",true],[undefined,true]] as const) {
      vi.stubEnv("OPLYRA_ENV",env);
      expect(cookieSeguro()).toBe(expected);
    }
  });
  it("duração acompanha o exp do token e nunca passa do máximo", () => {
    expect(duracaoDaSessao(jwt({ exp: AGORA + 600 }), AGORA)).toBe(600);
    expect(duracaoDaSessao(jwt({ exp: AGORA + 99999 }), AGORA)).toBe(DURACAO_MAXIMA_S);
  });
  it("recusa token expirado, sem exp ou malformado", () => {
    expect(() => duracaoDaSessao(jwt({ exp: AGORA - 1 }), AGORA)).toThrow();
    expect(() => duracaoDaSessao(jwt({}), AGORA)).toThrow();
    expect(() => duracaoDaSessao("lixo", AGORA)).toThrow();
  });
  it("session.ts verifica o JWT antes de guardar e não deixa secure fixo em false", () => {
    const fonte = readFileSync(new URL("../apps/web/src/lib/session.ts", import.meta.url), "utf8");
    expect(fonte).not.toMatch(/secure:\s*false/);
    expect(fonte.indexOf("verifyAccessToken(accessToken)")).toBeGreaterThan(-1);
    expect(fonte.indexOf("verifyAccessToken(accessToken)")).toBeLessThan(fonte.indexOf("jar.set("));
  });
});
