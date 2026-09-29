// Contratos internos de resultado do Product AI Model Harness.
//
// Cada falha interna aponta para exatamente um código do Error Registry 1.5
// (contracts/registries/errors.json, Contract Registry Release 2.17). Os
// códigos MODEL_* foram registrados pelo CR-026 e `BUDGET_NOT_CONFIGURED` e
// `MODEL_ATTEMPT_CLOSE_UNCONFIRMED` pelo CR-027; os demais já existiam e são reutilizados sem mudar semântica.

/** Códigos do Error Registry 1.5 emitidos pelo harness. */
export const HARNESS_REGISTERED_ERROR_CODES = [
  "TENANT_REQUIRED",
  "TENANT_MISMATCH",
  "IDEMPOTENCY_CONFLICT",
  "REFERENCE_NOT_FOUND",
  "AGENT_NOT_FOUND",
  "ACTION_NOT_FOUND",
  "PERMISSION_DENIED",
  "ENTITLEMENT_REQUIRED",
  "BUDGET_LIMIT_EXCEEDED",
  "BUDGET_NOT_CONFIGURED",
  "INVALID_STATE_TRANSITION",
  "INTEGRATION_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "PROVIDER_RATE_LIMITED",
  "UPSTREAM_SERVICE_UNAVAILABLE",
  "MODEL_INVOCATION_INVALID",
  "MODEL_PROFILE_NOT_FOUND",
  "MODEL_CAPABILITY_BLOCKED",
  "MODEL_ROUTE_UNAVAILABLE",
  "MODEL_ATTEMPTS_EXHAUSTED",
  "MODEL_REQUEST_REJECTED",
  "MODEL_PARAMETER_NOT_APPLIED",
  "MODEL_OUTPUT_INVALID",
  "MODEL_RESOLUTION_MISMATCH",
  "MODEL_PROVIDER_RESPONSE_INVALID",
  "MODEL_ATTEMPT_IN_PROGRESS",
  "MODEL_ATTEMPT_ALREADY_EXECUTED",
  "MODEL_ATTEMPT_CLOSE_UNCONFIRMED",
] as const;
export type HarnessRegisteredErrorCode = (typeof HARNESS_REGISTERED_ERROR_CODES)[number];

export type HarnessFailureKind =
  | "tenant_required"
  | "invalid_request"
  | "idempotency_conflict"
  | "classification_source_not_found"
  | "visual_capability_blocked"
  | "tenant_mismatch"
  | "agent_not_found"
  | "action_not_found"
  | "action_not_callable_by_agent"
  | "entitlement_required"
  | "profile_not_found"
  | "no_eligible_model"
  | "budget_exceeded"
  | "budget_not_configured"
  | "ledger_unavailable"
  | "attempt_close_rejected"
  | "attempt_close_unconfirmed"
  | "provider_timeout"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "provider_rejected_request"
  | "parameter_not_applied"
  | "output_invalid"
  | "resolution_mismatch"
  | "provider_response_invalid"
  | "attempt_in_progress"
  | "attempt_already_executed"
  | "attempts_exhausted";

export type HarnessContractCode = { readonly registered: true; readonly code: HarnessRegisteredErrorCode };

type KindSpec = { readonly contract: HarnessContractCode; readonly retryable: boolean };

const registrado = (code: HarnessRegisteredErrorCode, retryable: boolean): KindSpec =>
  ({ contract: { registered: true, code }, retryable });

/**
 * Mapeamento único entre falha interna e contrato. `retryable` repete o valor
 * do Error Registry; o teste de contrato confere cada par contra errors.json.
 */
export const HARNESS_FAILURE_CONTRACT: Readonly<Record<HarnessFailureKind, KindSpec>> = {
  tenant_required: registrado("TENANT_REQUIRED", false),
  tenant_mismatch: registrado("TENANT_MISMATCH", false),
  idempotency_conflict: registrado("IDEMPOTENCY_CONFLICT", false),
  classification_source_not_found: registrado("REFERENCE_NOT_FOUND", false),
  agent_not_found: registrado("AGENT_NOT_FOUND", false),
  action_not_found: registrado("ACTION_NOT_FOUND", false),
  action_not_callable_by_agent: registrado("PERMISSION_DENIED", false),
  entitlement_required: registrado("ENTITLEMENT_REQUIRED", false),
  budget_exceeded: registrado("BUDGET_LIMIT_EXCEEDED", false),
  budget_not_configured: registrado("BUDGET_NOT_CONFIGURED", false),
  // Somente antes da aquisição, quando nada foi chamado.
  ledger_unavailable: registrado("INTEGRATION_UNAVAILABLE", true),
  // Rejeição determinística do fechamento (token, transição, comando ou replay divergente).
  attempt_close_rejected: registrado("INVALID_STATE_TRANSITION", false),
  // Resultado do commit desconhecido mesmo após um replay idempotente do fechamento.
  attempt_close_unconfirmed: registrado("MODEL_ATTEMPT_CLOSE_UNCONFIRMED", false),
  provider_timeout: registrado("PROVIDER_TIMEOUT", true),
  provider_rate_limited: registrado("PROVIDER_RATE_LIMITED", true),
  provider_unavailable: registrado("UPSTREAM_SERVICE_UNAVAILABLE", true),
  invalid_request: registrado("MODEL_INVOCATION_INVALID", false),
  visual_capability_blocked: registrado("MODEL_CAPABILITY_BLOCKED", false),
  profile_not_found: registrado("MODEL_PROFILE_NOT_FOUND", false),
  no_eligible_model: registrado("MODEL_ROUTE_UNAVAILABLE", false),
  provider_rejected_request: registrado("MODEL_REQUEST_REJECTED", false),
  parameter_not_applied: registrado("MODEL_PARAMETER_NOT_APPLIED", false),
  output_invalid: registrado("MODEL_OUTPUT_INVALID", false),
  resolution_mismatch: registrado("MODEL_RESOLUTION_MISMATCH", false),
  provider_response_invalid: registrado("MODEL_PROVIDER_RESPONSE_INVALID", false),
  attempt_in_progress: registrado("MODEL_ATTEMPT_IN_PROGRESS", false),
  attempt_already_executed: registrado("MODEL_ATTEMPT_ALREADY_EXECUTED", false),
  attempts_exhausted: registrado("MODEL_ATTEMPTS_EXHAUSTED", false),
};

/** Motivo pelo qual um candidato do perfil não pôde ser usado nesta tentativa. */
export type CandidateRejectionReason =
  | "not_in_registry"
  | "already_attempted"
  | "forbidden_by_profile"
  | "provider_not_allowed_by_profile"
  | "forbidden_by_tenant"
  | "provider_not_allowed_by_tenant"
  | "status_disabled"
  | "experimental_not_allowed"
  | "adapter_not_enabled"
  | "kill_switch"
  | "unavailable"
  | "capability_missing"
  | "modality_missing"
  | "structured_output_missing"
  | "tool_calling_missing"
  | "context_window_too_small"
  | "output_limit_too_small"
  | "parameter_unsupported"
  | "data_policy_incompatible"
  | "zero_data_retention_required"
  | "tariff_missing"
  | "quality_evidence_missing"
  | "quality_below_threshold"
  | "exceeds_call_cost_limit"
  | "exceeds_remaining_budget";

export const BUDGET_REJECTIONS: ReadonlySet<CandidateRejectionReason> =
  new Set(["exceeds_call_cost_limit", "exceeds_remaining_budget"]);

export type CandidateRejection = {
  readonly modelId: string;
  readonly reasons: readonly CandidateRejectionReason[];
};

export type HarnessFailure = {
  readonly kind: HarnessFailureKind;
  readonly contract: HarnessContractCode;
  readonly retryable: boolean;
  /** Mensagem operacional. Nunca contém prompt, resposta nem PII. */
  readonly message: string;
  readonly rejections?: readonly CandidateRejection[];
  readonly attempts?: number;
  readonly lastAttemptKind?: HarnessFailureKind;
  /** Caminhos e regras violadas; nunca valores recebidos. */
  readonly issues?: readonly string[];
};

export function harnessFailure(
  kind: HarnessFailureKind,
  message: string,
  extra: Omit<Partial<HarnessFailure>, "kind" | "contract" | "retryable" | "message"> = {},
): HarnessFailure {
  const spec = HARNESS_FAILURE_CONTRACT[kind];
  return { kind, contract: spec.contract, retryable: spec.retryable, message, ...extra };
}
