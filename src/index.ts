import { hashPassword, randomToken, sha256, verifyPassword } from "./security";

interface Env { DB: D1Database; ASSETS: Fetcher; APP_ENV: string; APP_ORIGIN: string; SESSION_TTL_SECONDS: string; PASSWORD_RESET_TTL_SECONDS: string; TURNSTILE_SITE_KEY: string; TURNSTILE_SECRET_KEY: string; PASSWORD_PEPPER: string }
interface User { id: string; email: string; phone: string | null; display_name: string; password_hash: string; password_parameters: string; role: string; status: string; must_change_password: number }
const json = (body: unknown, status = 200, extra: HeadersInit = {}) => { const headers=new Headers(extra); headers.set("content-type","application/json; charset=utf-8"); headers.set("cache-control","no-store"); return new Response(JSON.stringify(body),{status,headers}); };
const normalizeEmail = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
const validEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export const normalizePhone = (value: unknown) => {
  if (typeof value !== "string") return "";
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits.length >= 12 && digits.length <= 15 ? `+${digits}` : "";
};
export const normalizeLoginIdentifier = (value: unknown) => ({ email: normalizeEmail(value), phone: normalizePhone(value) });
const cookie = (request: Request, name: string) => request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);

function secureHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff"); headers.set("x-frame-options", "DENY"); headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("content-security-policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function assetCacheHeaders(response: Response, pathname: string): Response {
  const headers = new Headers(response.headers);
  if (pathname.endsWith(".html") || !pathname.includes(".")) headers.set("cache-control", "no-store");
  else if (pathname.endsWith(".js") || pathname.endsWith(".css")) headers.set("cache-control", "no-cache");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
async function body(request: Request): Promise<Record<string, unknown> | null> { try { return await request.json() as Record<string, unknown>; } catch { return null; } }
function sameOrigin(request: Request, env: Env) { const origin = request.headers.get("origin"), fetchSite=request.headers.get("sec-fetch-site"); return origin ? origin === env.APP_ORIGIN : fetchSite === "same-origin"; }
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
  const token = randomToken(), csrf = randomToken(), id = await sha256(token), now = new Date(), expires = new Date(now.getTime() + Number(env.SESSION_TTL_SECONDS || 2592000) * 1000), secure = env.APP_ENV === "production" ? "; Secure" : "";
  await env.DB.prepare("INSERT INTO sessions(id,user_id,csrf_secret_hash,ip_hash,user_agent,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,?,?,?,?)").bind(id, userId, await sha256(csrf), null, request.headers.get("user-agent")?.slice(0, 500) || null, now.toISOString(), now.toISOString(), expires.toISOString()).run();
  return [`${env.APP_ENV === "production" ? "__Host-session" : "session"}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${env.SESSION_TTL_SECONDS || 2592000}${secure}`, `csrf=${csrf}; Path=/; SameSite=Lax; Max-Age=${env.SESSION_TTL_SECONDS || 2592000}${secure}`];
}
const sessionHeaders = async (userId: string, request: Request, env: Env) => { const headers = new Headers(); for (const value of await createSession(userId, request, env)) headers.append("set-cookie", value); return headers; };
async function validCsrf(request: Request, env: Env, sessionId: string) { const supplied=request.headers.get("x-csrf-token"), csrfCookie=cookie(request,"csrf"); if(!supplied||supplied!==csrfCookie) return false; const row=await env.DB.prepare("SELECT csrf_secret_hash FROM sessions WHERE id=?").bind(sessionId).first<{csrf_secret_hash:string}>(); return !!row && row.csrf_secret_hash===await sha256(supplied); }
async function api(request: Request, env: Env, path: string): Promise<Response> {
  if (!sameOrigin(request, env) && request.method !== "GET") return json({ error: "Origem inválida." }, 403);
  const data = request.method === "GET" ? null : await body(request);
  if (request.method !== "GET" && !data) return json({ error: "JSON inválido." }, 400);
  if (path === "/api/v1/config" && request.method === "GET") {
    if (!/^[01]x[A-Za-z0-9_-]{10,}$/.test(env.TURNSTILE_SITE_KEY || "")) return json({ error: "Configuração de segurança indisponível." }, 503);
    return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY });
  }
  if (path === "/api/v1/auth/login" && request.method === "POST") {
    const identifier = typeof data?.identifier === "string" ? data.identifier : data?.email, { email, phone } = normalizeLoginIdentifier(identifier), password = data?.password;
    if (!await turnstile(data?.turnstileToken, request, env)) return json({ error: "Verificação de segurança inválida." }, 400);
    const user = await env.DB.prepare("SELECT * FROM users WHERE (email=? OR phone=?) AND deleted_at IS NULL").bind(email,phone).first<User>();
    if (!user || user.status !== "active" || typeof password !== "string" || !await verifyPassword(password, env.PASSWORD_PEPPER, user.password_hash, user.password_parameters)) return json({ error: "E-mail/telefone ou senha inválidos." }, 401);
    const now = new Date().toISOString(); await env.DB.prepare("UPDATE users SET last_login_at=?,updated_at=? WHERE id=?").bind(now,now,user.id).run();
    return json({ user: { id:user.id,email:user.email,displayName:user.display_name,role:user.role,mustChangePassword:!!user.must_change_password } }, 200, await sessionHeaders(user.id,request,env));
  }
  if (path === "/api/v1/auth/session" && request.method === "GET") { const auth = await currentUser(request,env); return auth ? json({ user:{ id:auth.user.id,email:auth.user.email,displayName:auth.user.display_name,role:auth.user.role,status:auth.user.status,mustChangePassword:!!auth.user.must_change_password }}) : json({ error:"Não autenticado."},401); }
  if (path === "/api/v1/auth/logout" && request.method === "POST") { const auth=await currentUser(request,env); if(auth&&!await validCsrf(request,env,auth.sessionId)) return json({error:"Token CSRF inválido."},403); if(auth) await env.DB.prepare("UPDATE sessions SET revoked_at=? WHERE id=?").bind(new Date().toISOString(),auth.sessionId).run(); const headers=new Headers(); headers.append("set-cookie",`${env.APP_ENV === "production" ? "__Host-session":"session"}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${env.APP_ENV === "production" ? "; Secure":""}`); headers.append("set-cookie",`csrf=; Path=/; SameSite=Lax; Max-Age=0${env.APP_ENV === "production" ? "; Secure":""}`); return json({ok:true},200,headers); }
  if (path === "/api/v1/auth/change-password" && request.method === "POST") { const auth=await currentUser(request,env); if(!auth) return json({error:"Não autenticado."},401); if(!await validCsrf(request,env,auth.sessionId)) return json({error:"Token CSRF inválido."},403); const current=data?.currentPassword,newPassword=data?.newPassword; if(typeof current!=="string"||!await verifyPassword(current,env.PASSWORD_PEPPER,auth.user.password_hash,auth.user.password_parameters)) return json({error:"Senha atual inválida."},401); if(typeof newPassword!=="string"||newPassword.length<12||newPassword.length>128) return json({error:"A nova senha deve ter entre 12 e 128 caracteres."},422); const value=await hashPassword(newPassword,env.PASSWORD_PEPPER),now=new Date().toISOString(); await env.DB.prepare("UPDATE users SET password_hash=?,password_parameters=?,must_change_password=0,updated_at=? WHERE id=?").bind(value.hash,value.parameters,now,auth.user.id).run(); await env.DB.prepare("UPDATE sessions SET revoked_at=? WHERE user_id=? AND id<>?").bind(now,auth.user.id,auth.sessionId).run(); return json({ok:true}); }
  if (path === "/api/v1/auth/forgot-password" && request.method === "POST") { const email=normalizeEmail(data?.email); if(await turnstile(data?.turnstileToken,request,env) && validEmail(email)){ const user=await env.DB.prepare("SELECT id FROM users WHERE email=? AND status='active'").bind(email).first<{id:string}>(); if(user){ const token=randomToken(),now=new Date(); await env.DB.prepare("INSERT INTO password_resets(id,user_id,token_hash,created_at,expires_at) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),user.id,await sha256(token),now.toISOString(),new Date(now.getTime()+Number(env.PASSWORD_RESET_TTL_SECONDS||3600)*1000).toISOString()).run(); } } return json({message:"Se o e-mail estiver cadastrado, você receberá as instruções."}); }
  return json({ error: "Rota não encontrada." }, 404);
}

export default { async fetch(request: Request, env: Env): Promise<Response> { const url=new URL(request.url); let response:Response; if(url.pathname.startsWith("/api/")) response=await api(request,env,url.pathname); else if(url.pathname==="/cadastro"||url.pathname==="/cadastro/") response=Response.redirect(`${url.origin}/login`,302); else if(url.pathname==="/inicio"||url.pathname==="/perfil"){ if(!await currentUser(request,env)) response=Response.redirect(`${url.origin}/login`,302); else response=await env.ASSETS.fetch(new Request(new URL(url.pathname==="/perfil"?"/perfil.html":"/inicio.html",url),request)); } else { response=await env.ASSETS.fetch(request); } return secureHeaders(assetCacheHeaders(response,url.pathname)); } };
