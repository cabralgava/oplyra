#!/usr/bin/env node
// Supervisor persistente em primeiro plano. Um serviço do SO pode executá-lo; esta importação não ativa serviços.
import { pathToFileURL } from "node:url";
import { runLoop } from "./claude-runner.mjs";

export async function serve({ run = runLoop, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), shouldStop = () => false, intervalMs = 30_000 } = {}) {
  while (!shouldStop()) {
    const result = await run({ stopRequested: shouldStop });
    // Revisão é um estado transitório observado novamente; limites, revogação e falhas exigem parada segura.
    if (result.reason !== "awaiting-owner:review-required") return result;
    await sleep(Math.min(intervalMs, 30_000));
  }
  return { status: "stopped", reason: "signal" };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let signal = false;
  const stop = () => { signal = true; };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  try {
    const result = await serve({ shouldStop: () => signal });
    process.exitCode = result.status === "done" || result.reason === "signal" ? 0 : 2;
  } catch {
    // Nunca serializar a exceção: pode incluir dados de serviços ou de processos filhos.
    process.stderr.write("Codex supervisor: falha; trabalho e checkpoint preservados.\n");
    process.exitCode = 2;
  } finally {
    process.off("SIGINT", stop); process.off("SIGTERM", stop);
  }
}
