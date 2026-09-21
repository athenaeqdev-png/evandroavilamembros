# Proposta de arquitetura — membros.evandroavila.com.br

> **Status:** proposta para aprovação. Este documento não cria recursos na Cloudflare,
> não altera DNS e não conecta a tela atual a uma API.

## 1. Diagnóstico do repositório atual

O repositório é um protótipo estático pequeno, publicado pelo Wrangler como **Worker
com Static Assets** (e não como projeto Pages):

- `wrangler.jsonc` define somente o nome, a data de compatibilidade e `public/` como
  diretório de assets. Não existem bindings, rotas, variáveis ou IDs de recursos;
- `public/index.html` contém a tela de login e o modal de recuperação;
- `public/css/style.css` já estabelece a identidade visual em creme, verde-musgo e
  cobre, além de breakpoints para celular;
- `public/js/app.js` faz apenas validação no navegador, exibição de senha e controle
  do modal. O envio de login e recuperação é deliberadamente impedido e não há API;
- `public/logo-oficial.png` e `public/capa.png` são os assets efetivamente usados. As
  cópias `logo-oficial.png` e `foto.png` na raiz não participam da publicação atual;
- não há `package.json`, framework, suíte de testes, banco, autenticação, backend,
  CI/CD ou configuração de domínio versionados neste repositório.

### O que reaproveitar

1. A direção visual, os tokens de cor e os assets oficiais.
2. O conteúdo, a semântica básica e os estados acessíveis do formulário/modal.
3. O domínio conceitual já iniciado pelo nome do Worker.

O JavaScript atual **não é autenticação** e sua validação só deve ser reaproveitada
como melhoria de UX. Toda validação e autorização precisa ser repetida no servidor.

## 2. Decisões de arquitetura propostas

### 2.1 Visão geral

```text
Navegador
  |
  | HTTPS: membros.evandroavila.com.br (uma única origem)
  v
Cloudflare Pages
  |-- aplicação web / assets cacheáveis
  `-- /api/* -> Pages Function (gateway fino)
                    |
                    | Service Binding (sem exposição pública)
                    v
              Worker membros-api
                |-- D1: dados relacionais
                |-- R2: materiais/anexos privados
                |-- Turnstile: validação via Siteverify
                |-- e-mail transacional
                `-- Rate Limiting binding
```

Manter frontend e API sob a mesma origem simplifica cookies, CSRF, CSP e CORS. A
Pages Function deve apenas encaminhar as requisições `/api/*` ao Worker por um
**Service Binding**; regras de negócio ficam em um único Worker testável. Se a conta
ou o plano não permitir o binding pretendido, a alternativa para a Fase 1 é colocar
a API na própria Pages Function, preservando as mesmas camadas internas. Não é
recomendado começar com `api.membros...`, pois isso adiciona CORS e cookies entre
origens sem benefício imediato.

Antes da migração, confirmar no painel como o Worker atual é publicado. O mesmo
hostname não deve ser associado simultaneamente ao deployment atual e ao Pages sem
um plano explícito de cutover.

### 2.2 Aplicação

- **Frontend:** TypeScript, componentes renderizados como aplicação web responsiva
  e rotas separadas para público, membro e admin. A escolha final de framework fica
  para a Fase 1; Vite com uma camada de UI pequena evita complexidade desnecessária.
- **API:** TypeScript no runtime Workers, endpoints versionados em `/api/v1`.
- **Persistência:** D1 é a fonte de verdade; migrations SQL são versionadas e sempre
  aplicadas primeiro em ambiente local/preview.
- **Arquivos:** buckets R2 privados. O banco armazena chave, metadados e dono, nunca
  uma URL pública permanente. Download passa por autorização no Worker e retorna o
  objeto ou uma URL assinada de vida curta.
- **Vídeo:** nesta primeira versão, guardar apenas `video_provider` e
  `video_reference`. R2 atende PDFs/imagens/anexos, mas vídeo protegido/adaptativo
  deve ser avaliado com Cloudflare Stream antes da implementação da sala de aula.
- **E-mail:** criar uma interface `EmailProvider` para verificação e recuperação.
  O fornecedor só será escolhido/configurado após aprovação; sua chave fica em
  secret, jamais no frontend ou no D1.
- **Tempo real futuro:** mensagens começam em HTTP com paginação e polling moderado.
  Eventos e a interface do repositório ficam desacoplados para posterior adoção de
  Durable Objects/WebSockets, sem criar esse custo agora.

### 2.3 Limites de autorização

| Área | Regra inicial |
| --- | --- |
| Pública | login, cadastro (se habilitado), verificar e-mail e fluxos de recuperação |
| Membro | sessão ativa, conta `active` e matrícula ativa para o curso/aula/material |
| Mensagens | somente participantes; avisos publicados respeitam sua audiência |
| Moderador | mensagens/avisos e leitura operacional definida por permissões |
| Admin | `/admin` e operações administrativas; verificação obrigatória no backend |

O frontend pode esconder controles, mas nunca é a fronteira de segurança. Cada
handler carrega a sessão, o usuário e a permissão exigida. Uma matrícula ou material
bloqueado é negado mesmo que alguém conheça seu ID ou sua chave no R2.

## 3. Estrutura de diretórios proposta

```text
.
├── apps/
│   ├── web/                     # projeto Cloudflare Pages
│   │   ├── public/              # logo, capa e assets públicos
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── features/        # auth, dashboard, classroom, messages, admin
│   │   │   ├── routes/
│   │   │   ├── styles/          # tokens oficiais e estilos globais
│   │   │   └── lib/
│   │   └── functions/api/[[path]].ts # gateway /api
│   └── api/                     # Worker de domínio
│       ├── src/
│       │   ├── routes/
│       │   ├── middleware/      # sessão, CSRF, RBAC, rate limit, validação
│       │   ├── services/
│       │   ├── repositories/
│       │   ├── schemas/
│       │   └── index.ts
│       ├── test/
│       └── wrangler.jsonc
├── packages/
│   ├── contracts/               # schemas/tipos compartilhados, sem segredos
│   ├── ui/                      # componentes e tokens visuais
│   └── config/                  # TS/lint compartilhado
├── migrations/                  # D1, somente aditivas após produção
├── docs/
├── scripts/
├── package.json
└── wrangler.jsonc               # configuração local/orquestração, se necessária
```

Na Fase 1, os arquivos de `public/` serão movidos com histórico para `apps/web/public`
e seus caminhos serão atualizados. Até lá, permanecem intocados.

## 4. Schema D1 inicial proposto

### 4.1 Convenções

- IDs são UUIDs gerados no servidor e armazenados como `TEXT`.
- Datas são UTC em texto ISO-8601 (`YYYY-MM-DDTHH:mm:ss.sssZ`).
- Booleanos são `INTEGER NOT NULL CHECK (... IN (0, 1))`.
- Valores controlados usam `CHECK`; alterações futuras exigem migration consciente.
- Exclusão de conteúdo com histórico será preferencialmente lógica (`deleted_at`).
- Toda consulta parametriza valores; IDs nunca são interpolados no SQL.

### 4.2 DDL de referência

Este DDL é a base da primeira migration, ainda não aplicada:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  password_algorithm TEXT NOT NULL,
  password_parameters TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'member', 'patient', 'moderator')),
  status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'active', 'blocked', 'disabled')),
  display_name TEXT NOT NULL,
  avatar_key TEXT,
  email_verified_at TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                 -- hash SHA-256 do token, nunca o token bruto
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_secret_hash TEXT NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX sessions_user_expiry_idx ON sessions(user_id, expires_at);

CREATE TABLE password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  requested_ip_hash TEXT
);
CREATE INDEX password_resets_user_idx ON password_resets(user_id, created_at);

CREATE TABLE email_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  cover_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE modules (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL CHECK (position >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(course_id, position)
);

CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  body_html TEXT,
  cover_key TEXT,
  video_provider TEXT,
  video_reference TEXT,
  position INTEGER NOT NULL CHECK (position >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(module_id, slug),
  UNIQUE(module_id, position)
);

CREATE TABLE lesson_materials (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(lesson_id, position)
);

CREATE TABLE enrollments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  course_id TEXT NOT NULL REFERENCES courses(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'cancelled', 'expired')),
  enrolled_at TEXT NOT NULL,
  starts_at TEXT,
  expires_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, course_id)
);
CREATE INDEX enrollments_course_status_idx ON enrollments(course_id, status);

CREATE TABLE lesson_progress (
  id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  progress_percent INTEGER NOT NULL DEFAULT 0
    CHECK (progress_percent BETWEEN 0 AND 100),
  last_position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (last_position_seconds >= 0),
  first_started_at TEXT,
  last_viewed_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(enrollment_id, lesson_id)
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  subject TEXT,
  kind TEXT NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct', 'support')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE conversation_participants (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_participants_user_idx
  ON conversation_participants(user_id, conversation_id);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  edited_at TEXT,
  deleted_at TEXT
);
CREATE INDEX messages_conversation_created_idx
  ON messages(conversation_id, created_at);

CREATE TABLE message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  created_at TEXT NOT NULL
);

CREATE TABLE message_reads (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX message_reads_user_idx ON message_reads(user_id, read_at);

CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience_role TEXT CHECK (
    audience_role IS NULL OR audience_role IN ('admin', 'member', 'patient', 'moderator')
  ),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TEXT,
  expires_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  action_path TEXT,
  source_type TEXT,
  source_id TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX notifications_user_unread_idx ON notifications(user_id, read_at, created_at);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'active', 'past_due', 'paused', 'cancelled', 'expired')),
  starts_at TEXT,
  current_period_ends_at TEXT,
  expires_at TEXT,
  payment_provider TEXT,
  external_customer_id TEXT,
  external_subscription_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(payment_provider, external_subscription_id)
);
CREATE INDEX subscriptions_user_status_idx ON subscriptions(user_id, status);
```

`announcements`, `conversation_participants`, `message_attachments` e
`email_verifications` são tabelas auxiliares necessárias para representar, sem
sobrecarga em colunas genéricas, requisitos já pedidos. Cobrança não terá endpoints,
webhooks nem integração na primeira versão; `subscriptions` é apenas reserva de
modelo.

## 5. Recursos Cloudflare e configuração

### 5.1 Recursos por ambiente

Criar ambientes isolados `preview` e `production`; desenvolvimento usa Miniflare e
banco/bucket locais sempre que possível.

| Recurso | Binding sugerido | Finalidade |
| --- | --- | --- |
| Pages project | — | frontend e gateway de mesma origem |
| Worker `membros-api` | `API` (service binding) | regras de negócio e API |
| D1 database | `DB` | dados relacionais |
| R2 bucket privado | `PRIVATE_FILES` | materiais, avatares e anexos |
| Turnstile widget | `TURNSTILE_SITE_KEY` | chave pública entregue ao frontend |
| Turnstile secret | `TURNSTILE_SECRET_KEY` | validação server-side |
| Rate Limiting | `AUTH_RATE_LIMITER` | login, cadastro e recuperação |
| Analytics Engine (opcional) | `ANALYTICS` | métricas sem conteúdo sensível |

Durable Objects, Queues e Cloudflare Stream não são necessários na Fase 1. Queue
pode ser adicionada depois para e-mails/notificações resilientes, e Durable Object
somente quando o chat em tempo real for aprovado.

### 5.2 Variáveis não secretas

- `APP_ENV=preview|production`
- `APP_ORIGIN=https://membros.evandroavila.com.br` (origem real por ambiente)
- `SESSION_TTL_SECONDS`
- `PASSWORD_RESET_TTL_SECONDS`
- `EMAIL_VERIFICATION_TTL_SECONDS`
- `TURNSTILE_SITE_KEY`
- `EMAIL_FROM_NAME`
- `EMAIL_FROM_ADDRESS`
- `SUPPORT_EMAIL`

### 5.3 Secrets

- `TURNSTILE_SECRET_KEY`
- `PASSWORD_PEPPER` (versionado por identificador, nunca pelo valor)
- credencial do provedor de e-mail, por exemplo `EMAIL_API_KEY`

IDs de D1/R2 e nomes de bindings ficam na configuração por ambiente; valores
secretos são cadastrados pelo painel/CLI e nunca commitados. Nenhum segredo entra em
variável com prefixo público do bundler.

### 5.4 Rotas iniciais da API

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/session
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
POST /api/v1/auth/verify-email
POST /api/v1/auth/resend-verification
POST /api/v1/auth/change-password

GET  /api/v1/me/dashboard
GET  /api/v1/courses/:courseId
GET  /api/v1/lessons/:lessonId
PUT  /api/v1/lessons/:lessonId/progress
GET  /api/v1/materials/:materialId/download
GET  /api/v1/conversations
GET  /api/v1/conversations/:id/messages
POST /api/v1/conversations/:id/messages
PUT  /api/v1/messages/:id/read
GET  /api/v1/notifications
```

Rotas administrativas ficam sob `/api/v1/admin/*` com middleware `admin`; não basta
proteger a página `/admin`.

## 6. Controles de segurança mínimos

1. **Senhas:** preferir Argon2id em implementação auditada compatível com Workers,
   após benchmark do limite de CPU. Fallback explícito: PBKDF2-HMAC-SHA-256 com
   salt aleatório por usuário e custo vigente documentado. O formato guarda
   algoritmo/parâmetros para rehash futuro; nunca guardar senha, logá-la ou enviá-la
   a serviços de observabilidade.
2. **Sessão:** token opaco de pelo menos 256 bits do CSPRNG; somente seu SHA-256 vai
   ao D1. Cookie `__Host-session` com `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`,
   sem `Domain`; rotação no login/troca de senha e revogação server-side.
3. **CSRF:** conferir `Origin`/`Host` e exigir token CSRF vinculado à sessão em toda
   mutação autenticada. `SameSite` é defesa complementar, não única.
4. **Turnstile:** validar no servidor, incluindo ação/hostname esperado, e rejeitar
   token ausente, inválido, expirado ou reutilizado. Usar em cadastro/login e nos
   fluxos de recuperação conforme risco.
5. **Abuso:** limite combinado por IP anonimizado e identidade/e-mail normalizado;
   backoff progressivo. Respostas de recuperação/cadastro não revelam existência de
   conta. Bloqueio administrativo e revogação de sessões têm efeito imediato.
6. **Entrada/saída:** schemas server-side com limites de tamanho; SQL preparado;
   texto renderizado escapado. Se `body_html` for permitido, sanitização por lista
   positiva no servidor e CSP restritiva, sem scripts inline.
7. **Uploads:** allowlist de tipo/extensão, validação por assinatura do arquivo,
   limite de tamanho, chave R2 aleatória, nome original apenas como metadado e
   `Content-Disposition: attachment` quando cabível. Considerar varredura de malware
   antes de disponibilizar upload de usuário.
8. **Headers:** HSTS depois de validar todo o subdomínio, CSP, `nosniff`, política de
   referrer e proteção contra framing. Cache `no-store` para auth/dados pessoais;
   nunca cachear resposta privada em chave compartilhada.
9. **Auditoria:** adicionar `audit_logs` antes do painel admin para operações
   sensíveis (ator, ação, alvo, data e metadados não secretos). Logs técnicos não
   armazenam token, senha, corpo de mensagem ou dados clínicos.
10. **Privacidade:** perfil `patient` não implica prontuário. Dados de saúde exigem
    avaliação jurídica/LGPD, minimização, retenção, exportação/eliminação e controles
    adicionais antes de serem coletados.

## 7. Riscos para o site atual e mitigação

| Risco | Impacto | Mitigação antes de produção |
| --- | --- | --- |
| Trocar Worker Static Assets por Pages no mesmo hostname | indisponibilidade ou rota conflitante | inventariar DNS/routes no painel, criar preview, ensaiar cutover e manter rollback |
| Reorganizar `public/` cedo | quebrar caminhos de logo/capa e deployment atual | só mover na Fase 1, em commit isolado, com smoke test visual |
| Alterar `wrangler.jsonc` com IDs reais | apontar preview para produção ou expor configuração | arquivos por ambiente, placeholders documentados e validação no CI |
| Cookies/API em origem separada | falhas de login, CORS/CSRF mais complexo | manter `/api` na mesma origem pelo gateway |
| Servir objetos R2 diretamente | vazamento de materiais privados | bucket privado, autorização por matrícula e URLs curtas quando usadas |
| Reordenação com `UNIQUE(position)` | colisões durante atualização parcial | transaction/batch com posições temporárias e validação no serviço |
| Exclusões em cascata no admin | perda de progresso/histórico | soft delete, confirmação forte, auditoria e backup/teste de restauração |
| E-mail sem DNS alinhado | recuperação/verificação em spam | configurar e validar SPF, DKIM e DMARC antes de ativar fluxos |
| Assets grandes atuais | carregamento móvel lento | otimizar cópias WebP/AVIF preservando originais e medir regressão visual |

Não há evidência no repositório de como `evandroavila.com.br` principal é hospedado.
Portanto, nenhuma conclusão deve ser tomada sobre sua configuração: antes do
cutover, inventariar zona, DNS, Worker Routes, Custom Domains, Pages e regras de
cache/redirecionamento na conta Cloudflare.

## 8. Plano de implementação por etapas

### Fase 0 — aprovação e preparação

- aprovar esta arquitetura, a política de cadastro (aberto, convite ou criado pelo
  admin), o provedor de e-mail e a estratégia de vídeo;
- inventariar Cloudflare e documentar rollback sem modificar produção;
- fechar wireframes e critérios de aceite mobile/desktop;
- definir retenção, termos, privacidade e responsabilidades LGPD.

### Fase 1 — fundação, D1, autenticação e login

- criar monorepo, frontend Pages, Worker, contratos, testes e ambientes locais;
- transformar o DDL aprovado em migrations e seed local da Jornada Metabólica;
- implementar cadastro conforme política aprovada, login/logout, sessão, Turnstile,
  verificação de e-mail, recuperação/troca de senha e status da conta;
- conectar e aprimorar a tela atual, guards de páginas e middleware backend;
- incluir testes de autorização, CSRF, enumeração, expiração e revogação;
- publicar apenas em preview; produção exige aceite separado.

### Fase 2 — dashboard e perfil

- perfil/avatar privado, resumo da matrícula, progresso calculado, retomada, aulas e
  materiais recentes, avisos e contagem de não lidas;
- estados vazios/erro/loading e acessibilidade responsiva.

### Fase 3 — sala de aula

- curso, módulos, aulas publicadas, navegação anterior/próxima, materiais protegidos
  e progresso idempotente por aluno;
- avaliar/implementar provedor de vídeo protegido aprovado.

### Fase 4 — mensageria e avisos

- conversas individuais admin/membro, histórico paginado, leitura, anexos e avisos;
- polling com limites e arquitetura de evento preparada, sem WebSocket.

### Fase 5 — painel administrativo

- CRUD e reordenação de conteúdo, publicação, upload, usuários, matrículas,
  progresso, mensagens e avisos;
- RBAC, trilha de auditoria, confirmações destrutivas e testes de escalada de
  privilégio.

### Fase 6 — endurecimento e lançamento

- revisão de segurança, testes E2E/carga/acessibilidade, política de backup e ensaio
  de restauração, observabilidade e runbooks;
- preview homologado, checklist de DNS/cutover/rollback e somente então autorização
  explícita para produção.

### Fora de escopo até nova autorização

- cobrança, checkout, webhooks financeiros ou sincronização com provedor;
- prontuário/dados clínicos;
- chat em tempo real/WebSocket;
- aplicativo nativo;
- deploy ou alteração de DNS/produção.

## 9. Decisões necessárias para iniciar a Fase 1

1. Cadastro será **por convite/admin** (recomendado no lançamento) ou aberto?
2. Qual provedor de e-mail transacional será usado e qual remetente/domínio já está
   autorizado?
3. Os vídeos já estão em algum provedor ou devemos avaliar Cloudflare Stream?
4. `patient` terá nesta plataforma os mesmos conteúdos/permissões de `member` nesta
   primeira versão, sem qualquer dado clínico?
5. O inventário do painel confirma que o hostname atual está ligado ao Worker deste
   repositório e que há acesso para criar Pages, D1, R2 e Turnstile separados por
   ambiente?
