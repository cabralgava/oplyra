// Catálogo operacional local de modelos (CR-026 opção A: configuração
// operacional validada pelo schema model-registry-entry, fora do freeze).
// Somente modelos executados pelo Test Adapter, com tarifa zero. Os Model
// Profiles que os usam ficam no registry canônico
// contracts/registries/model-profiles.json, com teto de custo zero por
// chamada: mesmo que alguém acrescente um candidato pago, o Router o recusa.
import type { ModelDescriptor, ModelRegistry } from "@oplyra/core";
import { TEST_ADAPTER_KEY } from "./test-model-provider.ts";

const TARIFA_LOCAL = {
  tariffVersion: "local-test-0",
  currency: "USD",
  effectiveFrom: "2026-09-29",
  inputMicroUsdPerMillionTokens: 0,
  outputMicroUsdPerMillionTokens: 0,
  microUsdPerImage: 0,
} as const;

// O Test Adapter roda no processo: nenhum dado sai da máquina.
const POLITICA_LOCAL = {
  allowedDataClassifications: ["synthetic", "internal", "tenant_confidential", "personal_data"],
  zeroDataRetention: true,
  evidenceRef: "in-process deterministic Test Adapter; no network",
} as const;

const modeloTexto = (id: string, contexto: number): ModelDescriptor => ({
  modelId: `local-test-${id}`,
  provider: "oplyra-test",
  adapterKey: TEST_ADAPTER_KEY,
  providerModelId: `oplyra-test/${id}`,
  status: "active",
  capabilities: ["classification", "generation", "analysis", "strategy", "quality_gate"],
  inputModalities: ["text"],
  supportedParameters: ["temperature", "top_p", "seed"],
  structuredOutput: true,
  toolCalling: false,
  contextWindowTokens: contexto,
  maxOutputTokens: 4_096,
  tariff: TARIFA_LOCAL,
  dataPolicy: POLITICA_LOCAL,
  qualityEvidence: [],
  evidenceDate: "2026-09-29",
});

export const LOCAL_TEST_MODEL_REGISTRY: ModelRegistry = {
  registryVersion: "local-test-1",
  models: [
    modeloTexto("text-economy", 32_000),
    modeloTexto("text-extended", 128_000),
    {
      modelId: "local-test-image",
      provider: "oplyra-test",
      adapterKey: TEST_ADAPTER_KEY,
      providerModelId: "oplyra-test/image",
      status: "active",
      capabilities: ["image_generation", "image_edit"],
      inputModalities: ["text", "image"],
      supportedParameters: ["seed"],
      structuredOutput: false,
      toolCalling: false,
      contextWindowTokens: 8_000,
      maxOutputTokens: 1_024,
      tariff: TARIFA_LOCAL,
      dataPolicy: POLITICA_LOCAL,
      qualityEvidence: [],
      evidenceDate: "2026-09-29",
    },
  ],
};
