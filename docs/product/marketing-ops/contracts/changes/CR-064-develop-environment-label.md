# CR-064 — Correção visual do rótulo de develop

Manutenção da publicação develop autorizada pelo proprietário. O rótulo fixo local permanece na branch remota develop aa15f94; não indica falha da conexão real. B7fc132 contém também fontes e novo shell com dependências não commitadas, portanto não deve ser integrado inteiro como correção do selo.

Aplicar somente helper de rótulo/testes e sua chamada no layout raiz atual de develop. O layout da empresa remoto não tem outro selo e herda o cabeçalho raiz; preservar seu conteúdo. Sem importar fontes, BannerInterrupcao, componentes ou telas da árvore compartilhada. Sem executar o aplicador ignorado, que pode sobrescrever arquivos ou deixar resultado parcial.

Develop mostra ambiente develop · dados de teste; local/ci mantêm o texto anterior; produção omite o selo sintético conforme proposta visual existente, sem deploy produtivo. Helper só lê OPLYRA_ENV e não configura banco, permissão ou sessão. Testes isolam a variável herdada; o teste original com argumento undefined usava implicitamente o default do processo.

Classificar somente os arquivos novos e eventual exceção corrente do layout, preservando manifest/Freeze. Validar tipos, build, contratos e rótulo hospedado em oplyra-develop após PR/CI. Não alterar dados, credenciais ou produção. Aceite entre tenants permanece separado e pendente.
