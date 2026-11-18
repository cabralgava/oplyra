import { afterEach, describe, expect, it, vi } from "vitest";
import { rotuloAmbiente } from "../apps/web/src/lib/rotulo-ambiente.ts";

afterEach(() => vi.unstubAllEnvs());
describe("rótulo do ambiente", () => {
  it("identifica develop sem afirmar que o banco é local", () => {
    expect(rotuloAmbiente("develop")).toBe("ambiente develop · dados de teste");
  });
  it.each(["local", "ci"])("preserva o rótulo sintético em %s", env => {
    expect(rotuloAmbiente(env)).toBe("ambiente local · dados sintéticos");
  });
  it("omite o selo de dados sintéticos em produção", () => {
    expect(rotuloAmbiente("production")).toBe("");
  });
  it("lê a configuração do processo sem depender do ambiente do teste", () => {
    vi.stubEnv("OPLYRA_ENV", "develop");
    expect(rotuloAmbiente()).toBe("ambiente develop · dados de teste");
    vi.stubEnv("OPLYRA_ENV", "production");
    expect(rotuloAmbiente()).toBe("");
    vi.stubEnv("OPLYRA_ENV", undefined);
    expect(rotuloAmbiente()).toBe("ambiente local · dados sintéticos");
  });
});
