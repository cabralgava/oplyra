/** Rótulo visual; não configura conexões nem concede autorização. */
export function rotuloAmbiente(env: string | undefined = process.env.OPLYRA_ENV): string {
  if (env === "develop") return "ambiente develop · dados de teste";
  if (env === "production") return "";
  return "ambiente local · dados sintéticos";
}
