// Identificadores com marca: impedem trocar um TenantId por um UserId sem querer.
declare const marca: unique symbol;
type Marcado<T extends string> = string & { readonly [marca]: T };

export type TenantId = Marcado<"TenantId">;
export type UserId = Marcado<"UserId">;
export type MembershipId = Marcado<"MembershipId">;
export type InvitationId = Marcado<"InvitationId">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const criar = <T extends string>(rotulo: string) => (valor: string): Marcado<T> => {
  if (!UUID.test(valor)) throw new TypeError(`${rotulo} inválido: ${valor}`);
  return valor as Marcado<T>;
};

export const tenantId = criar<"TenantId">("TenantId");
export const userId = criar<"UserId">("UserId");
export const membershipId = criar<"MembershipId">("MembershipId");
export const invitationId = criar<"InvitationId">("InvitationId");
