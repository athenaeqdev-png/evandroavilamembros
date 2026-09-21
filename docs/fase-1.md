# Fase 1 — autenticação e preview

Esta fase mantém `evandroavila.com.br` intocado. O Worker da área de membros serve
os assets e a API na mesma origem, usa um D1 próprio e protege `/inicio` e `/perfil`
no servidor. Nenhum comando de deploy é executado automaticamente.

## Preparação local

```bash
npm install
cat > .dev.vars <<'EOF'
PASSWORD_PEPPER=gere-um-valor-aleatorio-longo
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
EOF
npm run db:migrate:local
npm run dev
```

Use a chave secreta de teste oficial do Turnstile apenas localmente. Acesse
`http://localhost:8787/login`.

## Criar o administrador sem versionar a senha

O script lê a senha e o pepper somente do ambiente, grava apenas PBKDF2-SHA256
com salt no D1, cria `role=admin`, `status=active` e
`must_change_password=true`, e sempre apaga o SQL temporário.

```bash
ADMIN_PHONE='11999332373' \
ADMIN_PASSWORD='SENHA_TEMPORARIA_FORNECIDA_FORA_DO_GIT' \
PASSWORD_PEPPER='o-mesmo-valor-de-.dev.vars' \
npm run admin:create
```

`ADMIN_EMAIL` é opcional; quando omitido, o script usa um identificador interno
não entregável porque o esquema legado exige e-mail. A autenticação pode ser feita
com o telefone, com ou sem `+55`, máscara, espaços ou hífen. Depois do primeiro
login, altere a senha temporária em `/perfil`.

## Checklist Cloudflare para preview

### Configuração do GitHub Actions

Em **Settings → Secrets and variables → Actions** do repositório, cadastre:

| Tipo | Nome exato | Conteúdo |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | token restrito usado pelo Wrangler |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | ID da conta Cloudflare |
| Secret | `TURNSTILE_SECRET_KEY` | secret key do widget de preview |
| Secret | `PASSWORD_PEPPER` | valor aleatório longo e exclusivo do preview |
| Secret | `PREVIEW_ADMIN_PASSWORD` | senha temporária (mínimo de 12 caracteres) enviada ao administrador por canal seguro |
| Variable | `PREVIEW_D1_DATABASE_ID` | UUID exibido na página do D1 `membros-preview` |
| Variable | `PREVIEW_TURNSTILE_SITE_KEY` | site key pública do widget `membros-preview` |

Não envie os três últimos valores secretos por chat e não reutilize valores de
produção. Em **Actions → Preview Cloudflare → Run workflow**, a opção
`verify` testa apenas a autenticação e lista os bancos D1. A opção `deploy`
valida todas as configurações, instala os secrets no Worker, aplica as migrations,
cria o administrador e publica exclusivamente o ambiente `preview`.

O workflow nunca referencia um ambiente de produção. Se a associação do domínio
falhar por permissão, não amplie o token genericamente: consulte a mensagem do
Wrangler e adicione somente a permissão indicada para gerenciar o Custom Domain
na zona `evandroavila.com.br`.

1. **D1:** em Workers & Pages → D1 → Create, crie `membros-preview`. Copie o ID
   para `PREVIEW_D1_DATABASE_ID` em `wrangler.jsonc` (não use o banco de produção).
2. **Turnstile:** crie um widget Managed para
   `membros-preview.evandroavila.com.br`. Troque `PREVIEW_TURNSTILE_SITE_KEY` pela
   site key. Guarde a secret key somente como secret.
3. **Secrets:** gere um pepper aleatório e diferente de produção; não troque esse
   valor depois de criar usuários. Cadastre ambos sem colocá-los em arquivo:

   ```bash
   npx wrangler secret put PASSWORD_PEPPER --env preview
   npx wrangler secret put TURNSTILE_SECRET_KEY --env preview
   ```

4. **Migration:** após autenticar o Wrangler, aplique somente no banco de preview:

   ```bash
   npx wrangler d1 migrations apply membros-preview --remote
   ```

5. **Administrador de preview:** execute com a mesma senha temporária fornecida
   por canal seguro e com o mesmo pepper cadastrado no passo 3:

   ```bash
   ADMIN_PHONE='11999332373' ADMIN_PASSWORD='...' PASSWORD_PEPPER='...' \
   ADMIN_DATABASE='membros-preview' ADMIN_REMOTE=true npm run admin:create
   ```

6. **Preview e domínio:** somente após autorização, publique com
   `npx wrangler deploy --env preview`; no Worker `evandroavilamembros-preview`,
   adicione a Custom Domain `membros-preview.evandroavila.com.br`. Esse host já é
   o valor de `APP_ORIGIN` preparado na configuração. O domínio principal não é
   alterado.

## Validação manual

No domínio de preview, valide:

1. cadastro → redirecionamento a `/inicio`;
2. atualização da página mantendo a sessão;
3. logout → tentativa de `/inicio` redireciona a `/login`;
4. login por e-mail e por telefone;
5. `/perfil` → alteração da senha temporária;
6. “esqueci minha senha” retorna mensagem neutra.

A recuperação cria token opaco de uso único no D1 sem enumerar contas. O envio e
o consumo do link por e-mail ainda dependem de um provedor transacional e, por
isso, o fluxo completo de redefinição continua pendente.
