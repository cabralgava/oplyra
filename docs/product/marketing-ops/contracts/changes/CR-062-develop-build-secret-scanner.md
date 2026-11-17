# CR-062 — Escopo do marcador inerte no build de develop

**Escopo autorizado:** correção rotineira da publicação de login exclusivamente no develop, conforme solicitação do proprietário em17/11/2026. Sem alteração produtiva, contrato de domínio, permission ou credencial.

Deploy6afc8f54b7d9a98f6b44c5ce tentou publicar develop405e349. Build Next passou, mas o Secrets Controller sinalizou DATABASE_URL_APP em netlify.toml:18. O arquivo revisado contém ali somente URI pública fictícia de localhost/build-only. Netlify documenta que build.environment tem precedência sobre valores da API e que o scanner usa os valores efetivos das variáveis marcadas secret. Portanto o marcador de build sobrepôs o nome secreto nesse escopo; não ler/exportar a URI real para comparar valores.

Mudança mínima: mover somente a atribuição fictícia de DATABASE_URL_APP de [build.environment] para o ambiente do processo filho no build.command. Manter OPLYRA_ENV local/SUPABASE_URL localhost no build e comando pnpm original. O pai da Netlify/Secrets Controller conserva o segredo configurado na API, e Next recebe só o marcador local durante build; Functions continuam recebendo a variável real configurada no site. Não alterar variável/valor/escopos instalados pelo proprietário, desmarcar is_secret, excluir chaves/caminhos do scanner, desligar scanner, ampliar previews nem registrar URL privada.

Verificar build com marcador sintético no pai e assegurar que ele não aparece nos artefatos, contratos correntes/Freeze e diff. Inventário corrente classifica netlify.toml e este CR; snapshots e manifests congelados intactos. PR próprio com base develop, CI aprovada antes de integrar, sem tocar main. Configuração do site já aponta develop e auto publica essa branch: merge é publicação apenas no site oplyra-develop autorizado. Se falhar, a versão anterior continua publicada; não promover deploy reprovado.

Fontes: https://docs.netlify.com/build/environment-variables/overview/ e https://docs.netlify.com/manage/security/secret-scanning/ . O sucesso do build não substitui o scanner real nem o aceite hospedado.
