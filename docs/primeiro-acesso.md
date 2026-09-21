# Provisionamento e primeiro acesso

## Infraestrutura de e-mail

O projeto não possuía um provedor transacional implementado: a arquitetura apenas
previa uma interface futura. O fluxo agora usa o **Send Email binding nativo do
Cloudflare Workers**, chamado `EMAIL`. Portanto, nenhuma credencial SMTP ou chave
de terceiro é criada, versionada ou enviada ao navegador.

Antes do deploy, ative o Email Routing no domínio, valide o endereço remetente e
configure no Worker principal (e, separadamente, no preview):

- binding Send Email com o nome exato `EMAIL` (declarado em `wrangler.jsonc`);
- variável de texto `EMAIL_FROM`, contendo o endereço remetente validado;
- secret `PASSWORD_PEPPER`, já utilizado pelas senhas;
- secrets existentes `TURNSTILE_SECRET_KEY` e credenciais de deploy, sem mudança.

`EMAIL_FROM` não é segredo. O arquivo `.dev.vars.example` contém somente um valor
ilustrativo e nunca deve ser usado em produção. O binding deve ser validado no
painel antes do deploy. O código não registra a senha temporária nem a devolve na
resposta da API.

## Criar um usuário

Um administrador autenticado chama `POST /api/v1/admin/users`, na mesma origem,
com o cookie de sessão e o cabeçalho CSRF já usados pelo perfil:

```json
{
  "name": "Nome do membro",
  "email": "membro@example.com",
  "phone": "11999999999",
  "role": "member"
}
```

`phone` é opcional. `role` aceita `member` (padrão) ou `admin`. Não há endpoint de
cadastro público. O endpoint:

1. exige sessão com papel `admin` e CSRF válido;
2. gera 256 bits aleatórios por Web Crypto;
3. grava somente PBKDF2-HMAC-SHA-256, salt e parâmetros no D1, com
   `must_change_password=1`;
4. envia a senha temporária pelo binding `EMAIL`;
5. remove o registro recém-criado se o envio falhar, sem expor a senha na resposta.

Exemplo no console do navegador enquanto o administrador está autenticado:

```js
const csrf = document.cookie.split("; ").find(v => v.startsWith("csrf="))?.slice(5);
await fetch("/api/v1/admin/users", {
  method: "POST",
  headers: { "content-type": "application/json", "x-csrf-token": csrf },
  body: JSON.stringify({ name: "Nome do membro", email: "membro@example.com" })
});
```

## Primeiro acesso e troca posterior

O usuário autentica em `/login` com o e-mail e a senha recebida. A sessão é criada
normalmente e `must_change_password=1` o direciona a `/perfil`. Nesse estado o
formulário pede somente **Nova senha** e **Confirmar nova senha**. O endpoint usado
é `POST /api/v1/auth/change-password`.

Depois da troca, o hash e o salt são substituídos, o algoritmo permanece
`pbkdf2-sha256`, `must_change_password` passa a zero, todas as sessões anteriores
são revogadas e uma nova sessão é emitida. Assim, a senha temporária e os cookies
anteriores deixam definitivamente de autenticar. O navegador segue para `/inicio`.

Em alterações posteriores, o mesmo endpoint exige também `currentPassword`; a
interface volta a exibir **Senha atual**. Em todos os casos `newPassword` e
`confirmPassword` precisam coincidir e ter de 12 a 128 caracteres.

## Checklist manual antes do deploy

1. Ativar/configurar Email Routing e validar `EMAIL_FROM` no domínio.
2. Confirmar os bindings `EMAIL` nos ambientes principal e preview.
3. Confirmar `PASSWORD_PEPPER` e `TURNSTILE_SECRET_KEY` com
   `npx wrangler secret list --env=""` (sem tentar exibir seus valores).
4. Criar primeiro um usuário de teste no preview e confirmar a entrega da mensagem.
5. Executar `npm run check`, `npm test` e `npm run build`.

Não é necessária migration nova: `must_change_password` já existe na migration
`0002_user_phone.sql`.
