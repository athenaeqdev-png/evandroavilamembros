# Banco D1 de produção

O binding `DB` de produção aponta exclusivamente para `membros-producao`
(`21fcb86e-cf42-473e-bced-91b5f8228cfd`). O ambiente `preview` possui outro
binding e nunca deve ser usado nos comandos desta página. Os comandos abaixo
não alteram o Worker, o domínio ou o Turnstile.

## Aplicar e conferir migrations

Com uma credencial Cloudflare autorizada disponível no ambiente:

```sh
npm run db:migrate:production
npm run db:validate:production
npx wrangler d1 migrations list membros-producao --env="" --remote
npx wrangler d1 execute membros-producao --env="" --remote --command \
  "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name;"
```

As migrations são idempotentemente controladas pelo Wrangler. Não copie dados
do preview e não apague ou recrie o banco para inicializá-lo.

O deploy de produção executa esses dois scripts antes de publicar o Worker. O
primeiro possui uma verificação prévia que exige exatamente o nome e UUID acima;
o segundo falha se alguma das 18 tabelas do projeto não estiver presente.

## Provisionar o primeiro administrador

Execute somente depois das migrations. O script recusa uma configuração cujo
nome ou UUID de produção não seja o esperado e confirma que preview não aponta
para o mesmo banco. Ele cria a conta pelo e-mail ou, caso ela já exista, renova
com segurança a senha e os campos administrativos sem duplicá-la. Em ambos os
casos a conta fica como `admin`, `active`, com e-mail verificado e
`must_change_password=1` para o fluxo de troca de senha. O telefone é opcional.

O provisionamento gera um salt aleatório e deriva a senha com
PBKDF2-HMAC-SHA-256 e 100.000 iterações, limite compatível com o Web Crypto dos
Cloudflare Workers. Ao alterar esse parâmetro, reprovisione a senha: hashes com
outro número de iterações não são reutilizados pelo login.

Para evitar que a senha seja gravada no histórico do shell, leia-a de forma
oculta. O `PASSWORD_PEPPER` deve ser exatamente o secret já configurado no
Worker de produção.

```sh
read -r -s -p "Senha inicial: " ADMIN_PASSWORD; echo
export ADMIN_PASSWORD
export ADMIN_EMAIL="nutrievandroavila@gmail.com"
# Opcional: export ADMIN_PHONE="11999999999"
export ADMIN_NAME="Evandro Ávila"
export PASSWORD_PEPPER # defina por um gerenciador de segredos ou prompt seguro
npm run admin:create:production
unset ADMIN_PASSWORD PASSWORD_PEPPER
```

O script não aceita nome de banco por parâmetro, não imprime segredos, remove
as variáveis sensíveis do ambiente do subprocesso Wrangler e apaga o arquivo
SQL temporário mesmo em caso de falha. O conflito é resolvido somente pelo
e-mail: outros usuários não são alterados.

Confirme sem revelar valores quais secrets existem no Worker:

```sh
npx wrangler secret list --env=""
```

Se `PASSWORD_PEPPER` não estiver na lista, gere e guarde o valor no gerenciador
de segredos adotado pela equipe e grave exatamente esse valor no Worker (não o
registre no Git nem no histórico do shell):

```sh
npx wrangler secret put PASSWORD_PEPPER --env=""
```

O valor usado localmente no provisionamento precisa ser idêntico ao secret do
Worker. O Cloudflare não permite recuperar o valor de um secret existente; se
ele não estiver disponível no gerenciador seguro, faça uma rotação controlada
do secret e reprovisione as senhas afetadas.
