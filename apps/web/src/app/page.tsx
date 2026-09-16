import { redirect } from "next/navigation";
import { claimsAtuais } from "../lib/session";

export default async function Inicio() {
  redirect((await claimsAtuais()) ? "/empresas" : "/entrar");
}
