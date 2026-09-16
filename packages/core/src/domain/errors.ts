// Erros de domínio nomeados. A fronteira HTTP traduz para status; nunca expõe
// a existência de um recurso de outra empresa: não encontrado e sem acesso
// recebem a mesma resposta.
export class DomainError extends Error {
  // Sem propriedade de parâmetro: o Node só apaga sintaxe de tipo.
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
  }
}

const erro = (code: string, mensagemPadrao: string) =>
  class extends DomainError {
    constructor(mensagem = mensagemPadrao) { super(code, mensagem); }
  };

export const InvalidSlug = erro("INVALID_SLUG", "identificador da empresa inválido");
export const SlugAlreadyTaken = erro("SLUG_ALREADY_TAKEN", "identificador já utilizado");
export const OperatorNotAuthorized = erro("OPERATOR_NOT_AUTHORIZED", "operador sem autorização");
export const PermissionDenied = erro("PERMISSION_DENIED", "sem permissão para esta ação");
export const RoleExceedsInviterRole = erro("ROLE_EXCEEDS_INVITER_ROLE", "não é possível conceder papel acima do próprio");
export const RoleExceedsActorRole = erro("ROLE_EXCEEDS_ACTOR_ROLE", "não é possível conceder papel acima do próprio");
export const MemberAlreadyActive = erro("MEMBER_ALREADY_ACTIVE", "já existe vínculo ativo");
export const InvalidEmail = erro("INVALID_EMAIL", "e-mail inválido");
export const InvitationNotFound = erro("INVITATION_NOT_FOUND", "convite inexistente ou já utilizado");
export const InvitationExpired = erro("INVITATION_EXPIRED", "convite expirado");
export const InvitationAlreadyUsed = erro("INVITATION_ALREADY_USED", "convite já utilizado");
export const EmailMismatch = erro("EMAIL_MISMATCH", "convite emitido para outro e-mail");
export const MembershipNotFound = erro("MEMBERSHIP_NOT_FOUND", "vínculo não encontrado");
export const MembershipInactive = erro("MEMBERSHIP_INACTIVE", "vínculo inativo");
export const LastOwnerCannotBeDemoted = erro("LAST_OWNER_CANNOT_BE_DEMOTED", "a empresa ficaria sem Owner ativo");
export const LastOwnerCannotBeRemoved = erro("LAST_OWNER_CANNOT_BE_REMOVED", "a empresa ficaria sem Owner ativo");
