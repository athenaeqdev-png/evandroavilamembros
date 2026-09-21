# Banco D1 de produção

O binding `DB` de produção aponta exclusivamente para `membros-producao`
(`21fcb86e-cf42-473e-bced-91b5f8228cfd`). O ambiente `preview` possui outro
binding e nunca deve ser usado nos comandos desta página. Os comandos abaixo
não alteram o Worker, o domínio ou o Turnstile.

## Aplicar e conferir migrations

Com uma credencial Cloudflare autorizada disponível no ambiente:

```sh
npm run db:migrate:production
npx wrangler d1 migrations list membros-producao --env="" --remote
npx wrangler d1 execute membros-producao --env="" --remote --command \
  "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name;"
```

As migrations são idempotentemente controladas pelo Wrangler. Não copie dados
do preview e não apague ou recrie o banco para inicializá-lo.

## Provisionar o primeiro administrador

Execute somente depois das migrations. O script recusa uma configuração cujo
nome ou UUID de produção não seja o esperado, confirma que preview não aponta
para o mesmo banco e só insere quando a tabela `users` está vazia. A conta é
marcada com `must_change_password=1` para o fluxo de troca de senha.

Para evitar que a senha seja gravada no histórico do shell, leia-a de forma
oculta. O `PASSWORD_PEPPER` deve ser exatamente o secret já configurado no
Worker de produção.

```sh
read -r -s -p "Senha inicial: " ADMIN_PASSWORD; echo
export ADMIN_PASSWORD
export ADMIN_EMAIL="administrador@example.com"
export ADMIN_PHONE="11999999999"
export ADMIN_NAME="Administrador"
export PASSWORD_PEPPER # defina por um gerenciador de segredos ou prompt seguro
npm run admin:create:production
unset ADMIN_PASSWORD PASSWORD_PEPPER
```

O script não aceita nome de banco por parâmetro, não imprime segredos, remove
as variáveis sensíveis do ambiente do subprocesso Wrangler e apaga o arquivo
SQL temporário mesmo em caso de falha. Se já houver qualquer usuário, nenhuma
nova conta é inserida; ele não altera usuários existentes.
