import { describe, expect, it } from "vitest";
import {
  createContentReferenceResolver,
  enforceContentReferenceResolution,
  type ContentDraftSnapshot,
  type ContentReferenceLookup,
  type ContentReferenceResolverInput,
} from "../src/index.ts";

const input: ContentReferenceResolverInput = {
  tenantId: "tenant_123",
  requesterAgent: "design-agent",
  requiredPermission: "read",
  repository: "contentRepository",
  draftRef: "copy_draft_01",
  expectedVersion: 1,
  variantRefs: ["var_a", "var_b"],
};

const draft: ContentDraftSnapshot = {
  tenantId: "tenant_123",
  draftRef: "copy_draft_01",
  version: 1,
  sourceAction: "create_copy_variants",
  variants: [
    { id: "var_a", headline: "A", primaryText: "Texto A", cta: "request_demo" },
    { id: "var_b", headline: "B", primaryText: "Texto B", cta: "request_demo" },
  ],
};

const found = (value: ContentDraftSnapshot = draft): ContentReferenceLookup => ({ status: "found", draft: value });
const now = new Date("2026-09-21T13:30:26Z");

describe("content reference resolver policy", () => {
  it("orquestra autorização, lookup tenant-scoped e materialização", async () => {
    const calls: string[] = [];
    const resolver = createContentReferenceResolver({
      authorization: {
        async canRead(request) {
          calls.push(`authorize:${request.tenantId}:${request.requesterAgent}:${request.repository}`);
          return true;
        },
      },
      repository: {
        async lookup(request) {
          calls.push(`lookup:${request.tenantId}:${request.draftRef}`);
          return found();
        },
      },
      clock: { now: () => now },
    });

    await expect(resolver.resolve(input)).resolves.toMatchObject({
      tenantId: input.tenantId,
      draftRef: input.draftRef,
      version: input.expectedVersion,
    });
    expect(calls).toEqual([
      "authorize:tenant_123:design-agent:contentRepository",
      "lookup:tenant_123:copy_draft_01",
    ]);
  });

  it("materializa o resultado somente após validar todas as invariantes", () => {
    expect(enforceContentReferenceResolution(input, true, found(), now)).toEqual({
      tenantId: "tenant_123",
      repository: "contentRepository",
      draftRef: "copy_draft_01",
      version: 1,
      sourceAction: "create_copy_variants",
      content: { variants: draft.variants },
      resolvedAt: "2026-09-21T13:30:26.000Z",
    });
  });

  it("exige tenantId", () => {
    expect(() => enforceContentReferenceResolution({ ...input, tenantId: "" }, true, found(), now))
      .toThrow(expect.objectContaining({ code: "TENANT_REQUIRED" }));
  });

  it("rejeita input fora do schema", () => {
    expect(() => enforceContentReferenceResolution({ ...input, expectedVersion: 0 }, true, found(), now))
      .toThrow(expect.objectContaining({ code: "TRANSACTION_SCHEMA_INVALID" }));
  });

  it("nega antes de consultar o repository", async () => {
    let lookups = 0;
    const resolver = createContentReferenceResolver({
      authorization: { async canRead() { return false; } },
      repository: { async lookup() { lookups += 1; return found(); } },
      clock: { now: () => now },
    });
    await expect(resolver.resolve(input)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(lookups).toBe(0);
  });

  it("mapeia referência ausente sem retornar parcial", () => {
    expect(() => enforceContentReferenceResolution(input, true, { status: "not_found" }, now))
      .toThrow(expect.objectContaining({ code: "REFERENCE_NOT_FOUND" }));
  });

  it("mapeia cross-tenant explícito", () => {
    expect(() => enforceContentReferenceResolution(input, true, { status: "tenant_mismatch" }, now))
      .toThrow(expect.objectContaining({ code: "TENANT_MISMATCH" }));
  });

  it("revalida tenant mesmo após lookup encontrado", () => {
    expect(() => enforceContentReferenceResolution(input, true, found({ ...draft, tenantId: "tenant_999" }), now))
      .toThrow(expect.objectContaining({ code: "TENANT_MISMATCH" }));
  });

  it("aplica optimistic version", () => {
    expect(() => enforceContentReferenceResolution(input, true, found({ ...draft, version: 2 }), now))
      .toThrow(expect.objectContaining({ code: "CONFLICT_VERSION" }));
  });

  it("rejeita draft diferente do solicitado", () => {
    expect(() => enforceContentReferenceResolution(input, true, found({ ...draft, draftRef: "copy_draft_02" }), now))
      .toThrow(expect.objectContaining({ code: "TRANSACTION_SCHEMA_INVALID" }));
  });

  it("rejeita variant solicitada ausente", () => {
    expect(() => enforceContentReferenceResolution(input, true, found({ ...draft, variants: [draft.variants[0]!] }), now))
      .toThrow(expect.objectContaining({ code: "REFERENCE_NOT_FOUND" }));
  });

  it("rejeita variant extra", () => {
    const extra = { id: "var_c", headline: "C", primaryText: "Texto C", cta: "request_demo" };
    expect(() => enforceContentReferenceResolution(input, true, found({ ...draft, variants: [...draft.variants, extra] }), now))
      .toThrow(expect.objectContaining({ code: "TRANSACTION_SCHEMA_INVALID" }));
  });

  it("rejeita ids duplicados retornados pelo adapter", () => {
    expect(() => enforceContentReferenceResolution(input, true, found({ ...draft, variants: [draft.variants[0]!, draft.variants[0]!] }), now))
      .toThrow(expect.objectContaining({ code: "TRANSACTION_SCHEMA_INVALID" }));
  });
});
