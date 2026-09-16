/** @type {import('next').NextConfig} */
const config = {
  // O domínio e os adapters vivem em pacotes do workspace.
  transpilePackages: ["@oplyra/core", "@oplyra/infra"],
};
export default config;
