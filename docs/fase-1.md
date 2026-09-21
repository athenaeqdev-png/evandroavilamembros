# Fase 1 — autenticação

Esta fase mantém o site principal intocado e não realiza deploy. O Worker serve os
assets e a API na mesma origem, usa D1 e protege `/inicio` no servidor.

## Preparação local

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

O arquivo `.dev.vars` deve definir `PASSWORD_PEPPER` e `TURNSTILE_SECRET_KEY`.
O Turnstile usa as chaves públicas de teste da Cloudflare no ambiente local.

## Administrador exclusivamente local

Depois da migration, crie uma conta sem versionar credenciais:

```bash
DEV_ADMIN_EMAIL=admin@example.test \
DEV_ADMIN_PASSWORD='uma-senha-local-longa' \
PASSWORD_PEPPER='o-mesmo-valor-de-.dev.vars' \
node scripts/create-dev-admin.mjs
```

O script sempre aponta para o D1 local. O SQL temporário é protegido, ignorado pelo
Git e removido ao final.

## Configuração Cloudflare antes de preview/produção

1. Crie um D1 separado por ambiente e substitua o placeholder `D1_DATABASE_ID` na
   configuração apropriada; nunca reutilize o banco de produção em preview.
2. Cadastre `PASSWORD_PEPPER` e `TURNSTILE_SECRET_KEY` com `wrangler secret put`.
3. Defina `APP_ENV=production`, `APP_ORIGIN=https://membros.evandroavila.com.br`,
   TTLs e a site key real do Turnstile.
4. Aplique `migrations/0001_initial.sql` primeiro em preview e valide cadastro,
   login, persistência, logout, recuperação e redirecionamento de `/inicio`.
5. A recuperação já cria tokens de uso único no D1 e responde sem enumerar contas;
   o envio e o consumo por e-mail dependem da escolha do provedor transacional e
   permanecem deliberadamente fora desta fase.

Nenhum comando de deploy faz parte dos scripts do projeto.
