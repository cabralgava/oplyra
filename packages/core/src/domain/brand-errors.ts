// Erros do Brand OS (I-03). Arquivo próprio: `errors.ts` pertence ao conjunto governado pelos
// manifests de contrato e não é alterado por este incremento. `issues` lista cada regra violada;
// a fronteira as mostra ao usuário.
import { DomainError, ConflictVersion } from "./errors.ts";

export { ConflictVersion };

export type BrandIssue = { readonly code: string; readonly path: string; readonly message: string };

export class BrandVersionNotFound extends DomainError {
  constructor(mensagem = "versão da marca não encontrada") { super("BRAND_VERSION_NOT_FOUND", mensagem); }
}
export class BrandDraftAlreadyExists extends DomainError {
  constructor(mensagem = "já existe um rascunho da marca") { super("BRAND_DRAFT_ALREADY_EXISTS", mensagem); }
}
export class BrandVersionImmutable extends DomainError {
  constructor(mensagem = "versão publicada não pode ser alterada") { super("BRAND_VERSION_IMMUTABLE", mensagem); }
}
export class BrandContentInvalid extends DomainError {
  readonly issues: readonly BrandIssue[];
  constructor(issues: readonly BrandIssue[]) {
    super("BRAND_CONTENT_INVALID", "conteúdo da marca inválido");
    this.issues = issues;
  }
}
export class BrandNotPublishable extends DomainError {
  readonly issues: readonly BrandIssue[];
  constructor(issues: readonly BrandIssue[]) {
    super("BRAND_NOT_PUBLISHABLE", "a versão não atende aos requisitos mínimos de publicação");
    this.issues = issues;
  }
}
