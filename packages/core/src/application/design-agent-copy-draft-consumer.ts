import { DomainError } from "../domain/errors.ts";
import type { ContentReferenceResolverOutput, ContentReferenceResolverPort } from "./content-reference-resolver.ts";
import type { ConsumerDeliveryOutcome, ConsumerDeliveryPort, ConsumerDeliveryRequest } from "./outbox-dispatcher-cycle.ts";

export type DesignAgentCopyDraftConsumerDependencies = {
  readonly resolver: ContentReferenceResolverPort;
};

const deterministicResolutionErrors = new Set([
  "REFERENCE_NOT_FOUND",
  "CONFLICT_VERSION",
  "TENANT_MISMATCH",
  "PERMISSION_DENIED",
  "TRANSACTION_SCHEMA_INVALID",
  "TENANT_REQUIRED",
]);

function terminal(code: "EVENT_NOT_REGISTERED" | "INVALID_STATE_TRANSITION", message: string): ConsumerDeliveryOutcome {
  return { outcome: "terminal_failure", error: { code, message, retryable: false } };
}

function exactResolution(request: ConsumerDeliveryRequest, output: ContentReferenceResolverOutput): boolean {
  const expectedRefs = [...request.event.payload.variantRefs].sort();
  const resolvedRefs = output.content.variants.map((variant) => variant.id).sort();
  return output.tenantId === request.tenantId
    && output.repository === "contentRepository"
    && output.draftRef === request.event.payload.draftRef
    && output.version === request.event.payload.version
    && output.sourceAction === request.event.payload.sourceAction
    && expectedRefs.length === resolvedRefs.length
    && expectedRefs.every((ref, index) => ref === resolvedRefs[index]);
}

/**
 * Primeiro consumidor executável de copy.draft_created.
 * Resolve referências tenant-scoped e apenas confirma intake; não cria asset,
 * briefing, task, handoff ou qualquer outro side effect de Design.
 */
export function createDesignAgentCopyDraftConsumer(
  dependencies: DesignAgentCopyDraftConsumerDependencies,
): ConsumerDeliveryPort {
  return {
    async deliver(request) {
      if (request.event.eventKey !== "copy.draft_created" || request.event.consumerAgent !== "design-agent") {
        return terminal("EVENT_NOT_REGISTERED", "evento não suportado pelo consumidor interno de Design");
      }
      if (typeof request.tenantId !== "string" || request.tenantId.length === 0) {
        return terminal("INVALID_STATE_TRANSITION", "evento sem tenant explícito não pode ser materializado");
      }

      try {
        const resolved = await dependencies.resolver.resolve({
          tenantId: request.tenantId,
          requesterAgent: "design-agent",
          requiredPermission: "read",
          repository: "contentRepository",
          draftRef: request.event.payload.draftRef,
          expectedVersion: request.event.payload.version,
          variantRefs: request.event.payload.variantRefs,
        });
        if (!exactResolution(request, resolved)) {
          return terminal("INVALID_STATE_TRANSITION", "conteúdo resolvido diverge das referências persistidas no evento");
        }
        return { outcome: "delivered" };
      } catch (error) {
        if (error instanceof DomainError && deterministicResolutionErrors.has(error.code)) {
          return terminal("INVALID_STATE_TRANSITION", "referências persistidas no evento não puderam ser materializadas");
        }
        throw error;
      }
    },
  };
}
