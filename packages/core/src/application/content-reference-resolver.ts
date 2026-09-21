import {
  ConflictVersion,
  PermissionDenied,
  ReferenceNotFound,
  TenantMismatch,
  TenantRequired,
  TransactionSchemaInvalid,
} from "../domain/errors.ts";

export type CopyVariantSnapshot = {
  readonly id: string;
  readonly headline: string;
  readonly primaryText: string;
  readonly cta: string;
  readonly role?: "reference" | "challenger";
  readonly angle?: string;
  readonly changedElements?: readonly string[];
  readonly constantElements?: readonly string[];
  readonly version?: number;
  readonly extensions?: Readonly<Record<string, unknown>>;
};

export type ContentDraftSnapshot = {
  readonly tenantId: string;
  readonly draftRef: string;
  readonly version: number;
  readonly sourceAction: "create_copy_variants";
  readonly variants: readonly CopyVariantSnapshot[];
};

export type ContentReferenceResolverInput = {
  readonly tenantId: string;
  readonly requesterAgent: "design-agent";
  readonly requiredPermission: "read";
  readonly repository: "contentRepository";
  readonly draftRef: string;
  readonly expectedVersion: number;
  readonly variantRefs: readonly string[];
  readonly extensions?: Readonly<Record<string, unknown>>;
};

export type ContentReferenceResolverOutput = {
  readonly tenantId: string;
  readonly repository: "contentRepository";
  readonly draftRef: string;
  readonly version: number;
  readonly sourceAction: "create_copy_variants";
  readonly content: { readonly variants: readonly CopyVariantSnapshot[] };
  readonly resolvedAt: string;
};

export type ContentReferenceLookup =
  | { readonly status: "found"; readonly draft: ContentDraftSnapshot }
  | { readonly status: "not_found" }
  | { readonly status: "tenant_mismatch" };

export interface ContentReferenceRepositoryPort {
  /** O adapter deve consultar por tenant e referências; nunca por id isolado. */
  lookup(input: ContentReferenceResolverInput): Promise<ContentReferenceLookup>;
}

export interface ContentReferenceAuthorizationPort {
  canRead(input: Pick<ContentReferenceResolverInput, "tenantId" | "requesterAgent" | "repository">): Promise<boolean>;
}

export interface ContentReferenceResolverClockPort {
  now(): Date;
}

export interface ContentReferenceResolverPort {
  resolve(input: ContentReferenceResolverInput): Promise<ContentReferenceResolverOutput>;
}

export type ContentReferenceResolverDependencies = {
  readonly authorization: ContentReferenceAuthorizationPort;
  readonly repository: ContentReferenceRepositoryPort;
  readonly clock: ContentReferenceResolverClockPort;
};

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function validateContentReferenceResolverInput(input: ContentReferenceResolverInput): void {
  if (!nonEmpty(input.tenantId)) throw new TenantRequired();
  if (
    input.requesterAgent !== "design-agent" ||
    input.requiredPermission !== "read" ||
    input.repository !== "contentRepository" ||
    !nonEmpty(input.draftRef) ||
    !Number.isInteger(input.expectedVersion) ||
    input.expectedVersion < 1 ||
    !Array.isArray(input.variantRefs) ||
    input.variantRefs.length === 0 ||
    input.variantRefs.some((ref) => !nonEmpty(ref)) ||
    new Set(input.variantRefs).size !== input.variantRefs.length
  ) {
    throw new TransactionSchemaInvalid();
  }
}

/**
 * Política pura: só materializa output depois que todas as referências e
 * invariantes passam. Qualquer falha lança erro canônico e não retorna parcial.
 */
export function enforceContentReferenceResolution(
  input: ContentReferenceResolverInput,
  authorized: boolean,
  lookup: ContentReferenceLookup,
  resolvedAt: Date,
): ContentReferenceResolverOutput {
  validateContentReferenceResolverInput(input);
  if (!authorized) throw new PermissionDenied();
  if (lookup.status === "tenant_mismatch") throw new TenantMismatch();
  if (lookup.status === "not_found") throw new ReferenceNotFound();

  const draft = lookup.draft;
  if (draft.tenantId !== input.tenantId) throw new TenantMismatch();
  if (draft.draftRef !== input.draftRef || draft.sourceAction !== "create_copy_variants") {
    throw new TransactionSchemaInvalid();
  }
  if (draft.version !== input.expectedVersion) throw new ConflictVersion();

  const requested = new Set(input.variantRefs);
  const resolved = new Set(draft.variants.map((variant) => variant.id));
  if (resolved.size !== draft.variants.length) throw new TransactionSchemaInvalid("variant id duplicado no resultado");
  if (input.variantRefs.some((ref) => !resolved.has(ref))) throw new ReferenceNotFound("variantRef não resolvida");
  if (draft.variants.some((variant) => !requested.has(variant.id))) {
    throw new TransactionSchemaInvalid("resultado contém variant não solicitada");
  }

  return {
    tenantId: draft.tenantId,
    repository: "contentRepository",
    draftRef: draft.draftRef,
    version: draft.version,
    sourceAction: draft.sourceAction,
    content: { variants: [...draft.variants] },
    resolvedAt: resolvedAt.toISOString(),
  };
}

export function createContentReferenceResolver(
  dependencies: ContentReferenceResolverDependencies,
): ContentReferenceResolverPort {
  return {
    async resolve(input) {
      validateContentReferenceResolverInput(input);
      const authorized = await dependencies.authorization.canRead({
        tenantId: input.tenantId,
        requesterAgent: input.requesterAgent,
        repository: input.repository,
      });
      if (!authorized) throw new PermissionDenied();
      const lookup = await dependencies.repository.lookup(input);
      return enforceContentReferenceResolution(input, true, lookup, dependencies.clock.now());
    },
  };
}
