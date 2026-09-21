# Cloudflare Workers Builds (produção)

O Worker de produção publica os assets gerados em `dist/`. Essa pasta não é
versionada: ela precisa ser materializada por `npm run assets:prepare` antes de
qualquer comando Wrangler que carregue `wrangler.jsonc` para publicar uma versão.

## Configuração do painel

Na configuração de **Builds** do Worker de produção, use:

| Campo | Valor |
| --- | --- |
| Build command | `npm run assets:prepare` |
| Deploy command | `npm run deploy` |
| Version command | `npm run versions:upload` |
| Root directory | `/` (ou deixe vazio, que é o padrão para este repositório) |

Não use `npx wrangler versions upload` diretamente em nenhum desses campos. O
script `versions:upload` prepara `dist/` antes do upload e existe para os Builds
em que o Cloudflare executa o Version command. O Deploy command usa o lifecycle
do npm: `npm run deploy` executa automaticamente `predeploy`, que também recria
`dist/`, antes de executar `wrangler deploy`.

O comando de instalação pode ficar vazio para o Cloudflare usar a instalação
automática de dependências. Caso o painel ofereça um campo explícito e ele seja
necessário, use `npm ci`.

Esses valores são exclusivos do Worker de produção. Não selecione o ambiente
`preview` e não acrescente `--env preview` aos comandos acima.

## Banco e segredos de produção

O binding `DB` do ambiente principal aponta exclusivamente para o D1
`membros-producao`. Para aplicar as migrations versionadas nesse banco, use
`npm run db:migrate:production`. Esse comando não seleciona nem modifica o
ambiente `preview`.

O widget **Managed** de produção se chama `membros-producao` e autoriza o hostname
`membros.evandroavila.com.br` (sem `https://` e sem caminho). Sua Site Key pública
fica versionada em `wrangler.jsonc`, na variável `TURNSTILE_SITE_KEY`, para que
todo deploy do ambiente principal publique o mesmo valor.

A Secret Key nunca é versionada nem injetada pelo workflow. Cadastre-a uma única
vez diretamente no Worker principal como o secret `TURNSTILE_SECRET_KEY` (sem
`--env preview`):

```sh
npx wrangler secret put TURNSTILE_SECRET_KEY --env=""
```

O `keep_vars` do `wrangler.jsonc` preserva esse secret e as demais configurações
de runtime mantidas no painel durante `wrangler deploy --env=""`. Nunca versione a
Secret Key. O widget de preview é outro recurso, autoriza somente
`membros-preview.evandroavila.com.br` e continua usando
`PREVIEW_TURNSTILE_SITE_KEY` e secrets do ambiente `preview`.

## Ordem esperada

O pipeline oficial segue esta ordem:

1. `npm ci`;
2. `npm run assets:prepare`;
3. validação da existência de `dist/`;
4. `npm run check`;
5. `npm test`;
6. `npm run db:migrate:production`;
7. `npm run deploy`;
8. smoke test em `https://membros.evandroavila.com.br`.
