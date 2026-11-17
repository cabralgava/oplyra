# Provisionar empresa em develop pelo caso de uso aprovado

Preparação operacional do CR-063; não executada pelo agente com credencial real. Destino exclusivo Supabase eqpvjydnqbbawpkeizys, nunca produção. O login web já funciona; usuário Auth não recebe empresa ou papel global automaticamente.

## Operação privada do proprietário

Requer conta Auth confirmada criada/controlada pelo proprietário, Node instalado e dependências locais. Em Terminal normal fora de sessão de agente:

```bash
cd /Users/cmii/Documents/Projetos/Oplyra
node deploy/develop/provision-tenant.mjs --provision-develop
```

Entradas ocultas: mesma URL administrativa de develop já validada; e-mail de sua conta Auth que identifica o responsável pela operação; e-mail do Owner (Enter usa a mesma conta); nome; slug em letras minúsculas/números/hífens; motivo. Não enviar URL/senha no chat. A senha do usuário Auth e o token da Netlify não são pedidos. Nomes/slug/motivo inválidos ou slug existente recusam antes de habilitar o canal operacional. Usuário ausente/não confirmado não é criado artificialmente.

O helper confere o papel existente oplyra_ops_login LOGIN/NOINHERIT/NOBYPASSRLS/NOSUPERUSER/NOCREATEROLE/NOCREATEDB/NOREPLICATION, única membership oplyra_ops_exec SET sem ADMIN/INHERIT, senha ausente e nenhuma conexão operacional em uso. Mantém grants e a senha web intactos. Gera senha aleatória256bits apenas em memória, envia somente SCRAM ao SQL e abre uma conexão pelo login operacional mínimo, com CA oficial/TLS verificado. Não grava essa senha na Netlify, ambiente, arquivo ou log.

Executa **provisionTenant** existente, com repositories reais e withOperatorTransaction: empresa, membership Owner e auditoria na mesma transação. AuthAdmin.ensureUser é implementado por consulta parametrizada de identidade Auth já confirmada; não faz INSERT em auth.users, envia e-mail, concede papel global ao usuário, implementa política comercial ou cria entitlement. O id do responsável é uma identidade Auth real indicada no Terminal; autoridade da operação vem da credencial privada/role PostgreSQL operacional, não de metadata ou de se declarar owner.

Em saída normal/falha capturada, compara no servidor apenas um booleano indicando se o verificador ainda pertence à execução e remove a senha temporária (PASSWORD NULL). Fecha pool operacional/admin. Sucesso completo: OPS_TEMPORARIO_ENCERRADO, EMPRESA_DEVELOP_OWNER_OK e IDs da empresa/membership (não secretos). Atualizar /empresas para observar o vínculo.

## Estado parcial, interrupção e repetição

Não existe atomicidade distribuída entre inicialização da senha, transação de empresa e encerramento. Crash/kill/perda de conexão podem interromper limpeza; commit com resposta perdida é incerto. Em qualquer erro, não repetir cegamente: conferir existência da empresa pelo slug, auditoria e apenas presença de senha do papel operacional. Senha preexistente nunca é rotacionada, papel divergente ou conexão operacional ativa são recusados. Credencial trocada por outro ator não é apagada. Não alterar esse papel em paralelo; locks protegem somente operadores cooperantes, não edições administrativas externas. O helper não inclui reset/limpeza forçada ou recuperação destrutiva automática.

A validação em fakes não prova o pooler/conexão real do papel operacional. O resultado real será registrado depois da execução privada do proprietário. Testes de isolamento continuam exigindo outro Owner/empresa e conta sem membership; provisionar o primeiro Owner não equivale ao aceite completo das8 verificações hospedadas.
