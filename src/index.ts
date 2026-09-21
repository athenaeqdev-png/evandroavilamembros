import { hashPassword, randomToken, sha256, verifyPassword } from "./security";

interface Env { DB: D1Database; ASSETS: Fetcher; APP_ENV: string; APP_ORIGIN: string; SESSION_TTL_SECONDS: string; PASSWORD_RESET_TTL_SECONDS: string; TURNSTILE_SITE_KEY: string; TURNSTILE_SECRET_KEY: string; PASSWORD_PEPPER: string }
interface User { id: string; email: string; display_name: string; password_hash: string; password_parameters: string; role: string; status: string }
const json = (body: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const normalizeEmail = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
const validEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const cookie = (request: Request, name: string) => request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);

function secureHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff"); headers.set("x-frame-options", "DENY"); headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("content-security-policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
async function body(request: Request): Promise<Record<string, unknown> | null> { try { return await request.json() as Record<string, unknown>; } catch { return null; } }
function sameOrigin(request: Request, env: Env) { const origin = request.headers.get("origin"); return !origin || origin === env.APP_ORIGIN; }
async function turnstile(token: unknown, request: Request, env: Env) {
  if (env.APP_ENV === "development" && token === "dev-bypass") return true;
  if (typeof token !== "string" || !token || !env.TURNSTILE_SECRET_KEY) return false;
  const form = new FormData(); form.set("secret", env.TURNSTILE_SECRET_KEY); form.set("response", token); form.set("remoteip", request.headers.get("CF-Connecting-IP") || "");
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form }).then(r => r.json()) as { success: boolean };
  return result.success;
}
async function currentUser(request: Request, env: Env): Promise<{ user: User; sessionId: string } | null> {
  const token = cookie(request, "__Host-session") || (env.APP_ENV === "development" ? cookie(request, "session") : undefined); if (!token) return null;
  const id = await sha256(token); const now = new Date().toISOString();
  const user = await env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.status='active' AND u.deleted_at IS NULL").bind(id, now).first<User>();
  return user ? { user, sessionId: id } : null;
}
async function createSession(userId: string, request: Request, env: Env) {
  const token = randomToken(), id = await sha256(token), now = new Date(), expires = new Date(now.getTime() + Number(env.SESSION_TTL_SECONDS || 2592000) * 1000);
  await env.DB.prepare("INSERT INTO sessions(id,user_id,csrf_secret_hash,ip_hash,user_agent,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,?,?,?,?)").bind(id, userId, await sha256(randomToken()), null, request.headers.get("user-agent")?.slice(0, 500) || null, now.toISOString(), now.toISOString(), expires.toISOString()).run();
  return `${env.APP_ENV === "production" ? "__Host-session" : "session"}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${env.SESSION_TTL_SECONDS || 2592000}${env.APP_ENV === "production" ? "; Secure" : ""}`;
}
async function api(request: Request, env: Env, path: string): Promise<Response> {
  if (!sameOrigin(request, env) && request.method !== "GET") return json({ error: "Origem inválida." }, 403);
  const data = request.method === "GET" ? null : await body(request);
  if (request.method !== "GET" && !data) return json({ error: "JSON inválido." }, 400);
  if (path === "/api/v1/config" && request.method === "GET") return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY });
  if (path === "/api/v1/auth/register" && request.method === "POST") {
    const email = normalizeEmail(data?.email), password = data?.password, name = typeof data?.name === "string" ? data.name.trim() : "";
    if (!validEmail(email) || typeof password !== "string" || password.length < 12 || password.length > 128 || name.length < 2 || name.length > 100) return json({ error: "Confira nome, e-mail e senha (mínimo de 12 caracteres)." }, 422);
    if (!await turnstile(data?.turnstileToken, request, env)) return json({ error: "Verificação de segurança inválida." }, 400);
    const exists = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first(); if (exists) return json({ error: "Não foi possível concluir o cadastro." }, 409);
    const passwordData = await hashPassword(password, env.PASSWORD_PEPPER), id = crypto.randomUUID(), now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO users(id,email,password_hash,password_algorithm,password_parameters,role,status,display_name,email_verified_at,created_at,updated_at) VALUES(?,?,?,?,?,'member','active',?,?,?,?)").bind(id,email,passwordData.hash,"pbkdf2-sha256",passwordData.parameters,name,now,now,now).run();
    return json({ user: { id, email, displayName: name, role: "member" } }, 201, { "set-cookie": await createSession(id, request, env) });
  }
  if (path === "/api/v1/auth/login" && request.method === "POST") {
    const email = normalizeEmail(data?.email), password = data?.password;
    if (!await turnstile(data?.turnstileToken, request, env)) return json({ error: "Verificação de segurança inválida." }, 400);
    const user = await env.DB.prepare("SELECT * FROM users WHERE email=? AND deleted_at IS NULL").bind(email).first<User>();
    if (!user || user.status !== "active" || typeof password !== "string" || !await verifyPassword(password, env.PASSWORD_PEPPER, user.password_hash, user.password_parameters)) return json({ error: "E-mail ou senha inválidos." }, 401);
    const now = new Date().toISOString(); await env.DB.prepare("UPDATE users SET last_login_at=?,updated_at=? WHERE id=?").bind(now,now,user.id).run();
    return json({ user: { id:user.id,email:user.email,displayName:user.display_name,role:user.role } }, 200, { "set-cookie": await createSession(user.id, request, env) });
  }
  if (path === "/api/v1/auth/session" && request.method === "GET") { const auth = await currentUser(request,env); return auth ? json({ user:{ id:auth.user.id,email:auth.user.email,displayName:auth.user.display_name,role:auth.user.role,status:auth.user.status }}) : json({ error:"Não autenticado."},401); }
  if (path === "/api/v1/auth/logout" && request.method === "POST") { const auth=await currentUser(request,env); if(auth) await env.DB.prepare("UPDATE sessions SET revoked_at=? WHERE id=?").bind(new Date().toISOString(),auth.sessionId).run(); return json({ok:true},200,{"set-cookie":`${env.APP_ENV === "production" ? "__Host-session":"session"}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${env.APP_ENV === "production" ? "; Secure":""}`}); }
  if (path === "/api/v1/auth/forgot-password" && request.method === "POST") { const email=normalizeEmail(data?.email); if(await turnstile(data?.turnstileToken,request,env) && validEmail(email)){ const user=await env.DB.prepare("SELECT id FROM users WHERE email=? AND status='active'").bind(email).first<{id:string}>(); if(user){ const token=randomToken(),now=new Date(); await env.DB.prepare("INSERT INTO password_resets(id,user_id,token_hash,created_at,expires_at) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),user.id,await sha256(token),now.toISOString(),new Date(now.getTime()+Number(env.PASSWORD_RESET_TTL_SECONDS||3600)*1000).toISOString()).run(); } } return json({message:"Se o e-mail estiver cadastrado, você receberá as instruções."}); }
  return json({ error: "Rota não encontrada." }, 404);
}

export default { async fetch(request: Request, env: Env): Promise<Response> { const url=new URL(request.url); let response:Response; if(url.pathname.startsWith("/api/")) response=await api(request,env,url.pathname); else if(url.pathname==="/inicio"){ if(!await currentUser(request,env)) response=Response.redirect(`${url.origin}/login`,302); else response=await env.ASSETS.fetch(new Request(new URL("/inicio.html",url),request)); } else { response=await env.ASSETS.fetch(request); } return secureHeaders(response); } };
