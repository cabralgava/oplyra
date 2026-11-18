# ADR-0011 — credenciais de anúncios cifradas e separação das chaves

Data: 16/11/2026. Escopo: CR-055, conexão/leitura Google e Meta. Estado: incorporada pelo CR-055 v1.0 nesta manutenção autorizada; persistência/RBAC validados localmente e migrations aplicadas em develop. Ativação do BFF/worker e configuração de chaves hospedadas permanecem pendentes. Não é aprovação humana de release/produção.

## Contexto

O código existente não contém cofre persistente de tokens por tenant. O banco da aplicação já é Supabase/Postgres; Netlify hospeda o BFF e Railway é o destino previsto do worker. Não há razão demonstrada para contratar outro serviço de cofre nesta etapa.

## Decisão técnica

Credenciais globais OAuth e developer token são fornecidos somente pelo secret manager do host. Tokens por autorização são guardados, na persistência governada do CR-055, como ciphertext AES-256-GCM em schema privado do mesmo banco. A chave de cifra de 32 bytes fica no secret manager do host, separada de dados/backup do banco. Nenhuma chave real foi criada, lida ou cadastrada nesta sessão.

O envelope contém versão, keyId, nonce aleatório de 96 bits, tag de 128 bits e ciphertext. AAD prende a credencial a tenant, usuário, plataforma e tentativa/geração da autorização. Nonces são novos em cada cifra. Ciphertext adulterado, chave desconhecida e contexto divergente são recusados com erro fixo. O código copia o material de chave recebido e não o serializa.

O ID da tentativa é imutável; uma nova autorização tem nova geração. Seleção de conta não transfere a credencial para outro tenant. A persistência deve vincular a tentativa à geração vigente e revalidar sessão/membership/RBAC/entitlement na transação. Desconexão desativa a geração e cerca jobs antes da revogação remota. Não executar revogação Google de forma compartilhada entre tenants.

Rotação: manter leitura por keyId antigo e escrita somente pela chave ativa; recifrar por operação de manutenção com CAS/fencing e auditoria; retirar a chave antiga somente depois de confirmar que nenhuma credencial/recuperação depende dela. O mecanismo criptográfico existe; a operação de rotação e o procedimento de backup/recuperação das chaves ainda precisam ser implantados.

## Limites

Cifra protege contra leitura isolada do banco, não contra servidor autorizado comprometido. RLS, GRANTs mínimos, autenticação, auditoria, retenção e minimização continuam obrigatórios. Somente serviços autorizados podem decifrar. Não conceder acesso a tabela de credenciais pelo Data API/browser, nem usar service role para substituir o enforcement.

Implementação: `packages/infra/src/ad-platform-security.ts`. Testes exercitam separação entre tenants, usuários, plataformas e tentativas; adulteração e troca de chave; nonce novo e ausência de segredo no envelope. Testes locais cobrem também persistência SQL, isolamento, geração e desconexão. Banco develop recebeu o schema privado, sem credenciais reais; cofre do host, rotação operacional e integração hospedada ainda não foram provisionados.
