import { describe, expect, it, vi } from "vitest";
import {
  ConflictVersion,
  IntegrationUnavailable,
  PermissionDenied,
  ReferenceNotFound,
  TenantMismatch,
  TransactionSchemaInvalid,
  createDesignAgentCopyDraftConsumer,
} from "../src/index.ts";
import type {
  ConsumerDeliveryRequest,
  ContentReferenceResolverInput,
  ContentReferenceResolverOutput,
  ContentReferenceResolverPort,
} from "../src/index.ts";

function request(): ConsumerDeliveryRequest {
  return {
    tenantId: "tenant-a",
    dispatcherId: "dispatcher-01",
    event: {
      eventTransactionId: "txn_event_design_01",
      eventKey: "copy.draft_created",
      schemaVersion: "1.0",
      producerAgent: "copywriting-agent",
      consumerAgent: "design-agent",
      payload: {
        draftRef: "draft-01",
        version: 1,
        sourceAction: "create_copy_variants",
        variantRefs: ["variant-a", "variant-b"],
      },
      trace: { correlationId: "corr-01" },
      context: {},
      attempt: 1,
      fencingToken: "fence-01",
      leaseExpiresAt: "2026-09-21T22:02:00Z",
    },
  };
}

function resolver(): ContentReferenceResolverPort {
  return {
    resolve: vi.fn(async (input: ContentReferenceResolverInput): Promise<ContentReferenceResolverOutput> => ({
      tenantId: input.tenantId,
      repository: "contentRepository",
      draftRef: input.draftRef,
      version: input.expectedVersion,
      sourceAction: "create_copy_variants",
      content: {
        variants: input.variantRefs.map((id) => ({ id, headline: id, primaryText: "texto", cta: "request_demo" })),
      },
      resolvedAt: "2026-09-21T22:00:00Z",
    })),
  };
}

describe("design-agent copy.draft_created consumer", () => {
  it("resolve exatamente as referências no tenant e confirma intake", async () => {
    const content = resolver();
    const consumer = createDesignAgentCopyDraftConsumer({ resolver: content });
    await expect(consumer.deliver(request())).resolves.toEqual({ outcome: "delivered" });
    expect(content.resolve).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      requesterAgent: "design-agent",
      requiredPermission: "read",
      repository: "contentRepository",
      draftRef: "draft-01",
      expectedVersion: 1,
      variantRefs: ["variant-a", "variant-b"],
    });
  });

  it("aceita ordem diferente no resultado sem alterar o conjunto", async () => {
    const content = resolver();
    vi.mocked(content.resolve).mockImplementationOnce(async (input) => ({
      tenantId: input.tenantId,
      repository: "contentRepository",
      draftRef: input.draftRef,
      version: 1,
      sourceAction: "create_copy_variants",
      content: { variants: [
        { id: "variant-b", headline: "B", primaryText: "B", cta: "request_demo" },
        { id: "variant-a", headline: "A", primaryText: "A", cta: "request_demo" },
      ] },
      resolvedAt: "2026-09-21T22:00:00Z",
    }));
    await expect(createDesignAgentCopyDraftConsumer({ resolver: content }).deliver(request()))
      .resolves.toEqual({ outcome: "delivered" });
  });

  it("rejeita evento ou consumidor não registrado sem consultar conteúdo", async () => {
    const content = resolver();
    const invalid = request() as unknown as { event: Record<string, unknown> };
    invalid.event = { ...request().event, eventKey: "copy.unknown" };
    await expect(createDesignAgentCopyDraftConsumer({ resolver: content }).deliver(invalid as unknown as ConsumerDeliveryRequest))
      .resolves.toMatchObject({ outcome: "terminal_failure", error: { code: "EVENT_NOT_REGISTERED" } });
    expect(content.resolve).not.toHaveBeenCalled();
  });

  it("rejeita ausência de tenant explícito", async () => {
    const content = resolver();
    await expect(createDesignAgentCopyDraftConsumer({ resolver: content }).deliver({ ...request(), tenantId: "" }))
      .resolves.toMatchObject({ outcome: "terminal_failure", error: { code: "INVALID_STATE_TRANSITION" } });
    expect(content.resolve).not.toHaveBeenCalled();
  });

  it("rejeita conteúdo resolvido que diverge do evento", async () => {
    const content = resolver();
    vi.mocked(content.resolve).mockImplementationOnce(async (input) => ({
      tenantId: input.tenantId,
      repository: "contentRepository",
      draftRef: "outro-draft",
      version: 1,
      sourceAction: "create_copy_variants",
      content: { variants: [] },
      resolvedAt: "2026-09-21T22:00:00Z",
    }));
    await expect(createDesignAgentCopyDraftConsumer({ resolver: content }).deliver(request()))
      .resolves.toMatchObject({ outcome: "terminal_failure", error: { code: "INVALID_STATE_TRANSITION" } });
  });

  it("normaliza falhas determinísticas de resolução como estado terminal", async () => {
    for (const error of [
      new ReferenceNotFound(), new ConflictVersion(), new TenantMismatch(),
      new PermissionDenied(), new TransactionSchemaInvalid(),
    ]) {
      const content: ContentReferenceResolverPort = { resolve: vi.fn(async () => { throw error; }) };
      await expect(createDesignAgentCopyDraftConsumer({ resolver: content }).deliver(request()))
        .resolves.toMatchObject({
          outcome: "terminal_failure",
          error: { code: "INVALID_STATE_TRANSITION", retryable: false },
        });
    }
  });

  it("não converte indisponibilidade em falha terminal", async () => {
    const unavailable = new IntegrationUnavailable();
    const content: ContentReferenceResolverPort = { resolve: vi.fn(async () => { throw unavailable; }) };
    await expect(createDesignAgentCopyDraftConsumer({ resolver: content }).deliver(request()))
      .rejects.toBe(unavailable);
  });

  it("não cria side effects além da leitura pelo resolver", async () => {
    const content = resolver();
    const consumer = createDesignAgentCopyDraftConsumer({ resolver: content });
    await consumer.deliver(request());
    expect(content.resolve).toHaveBeenCalledTimes(1);
    expect(Object.keys(consumer)).toEqual(["deliver"]);
  });
});
