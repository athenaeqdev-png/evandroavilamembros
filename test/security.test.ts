import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hashPassword, PASSWORD_ITERATIONS, randomToken, sha256, verifyPassword } from "../src/security";
import worker, { generateTemporaryPassword, normalizeLoginIdentifier, normalizePhone } from "../src/index";
describe("segurança", () => {
  it("fixa a Site Key de produção e preserva secrets de runtime", () => {
    const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
    expect(config.keep_vars).toBe(true);
    expect(config.assets.run_worker_first).toBe(true);
    expect(config.vars.TURNSTILE_SITE_KEY).toBe("0x4AAAAAAE_Epyppm4T7SENx");
    expect(config.vars).not.toHaveProperty("TURNSTILE_SECRET_KEY");
    expect(config.env.preview.vars.TURNSTILE_SITE_KEY).toBe("PREVIEW_TURNSTILE_SITE_KEY");
    expect(config.d1_databases).toContainEqual({ binding: "DB", database_name: "membros-producao", database_id: "21fcb86e-cf42-473e-bced-91b5f8228cfd" });
    expect(config.env.preview.d1_databases[0].database_name).not.toBe("membros-producao");
    expect(config.env.preview.d1_databases[0].database_id).not.toBe("21fcb86e-cf42-473e-bced-91b5f8228cfd");
  });
  it("mantém o provisionamento inicial restrito ao D1 remoto de produção", () => {
    const script = readFileSync(new URL("../scripts/create-production-admin.mjs", import.meta.url), "utf8");
    expect(script).toContain('const productionDatabase = "membros-producao"');
    expect(script).toContain('const productionDatabaseId = "21fcb86e-cf42-473e-bced-91b5f8228cfd"');
    expect(script).toContain('"--remote"');
    expect(script).toContain("ON CONFLICT(email) DO UPDATE SET");
    expect(script).toContain("role='admin'");
    expect(script).toContain("status='active'");
    expect(script).toContain("deleted_at=NULL");
    expect(script).toContain("const iterations = 100000");
    expect(script).not.toMatch(/210_?000/);
    expect(script).toContain('const phoneInput = process.env.ADMIN_PHONE?.trim() || ""');
    expect(script).toContain("delete childEnvironment.ADMIN_PASSWORD");
    expect(script).toContain("delete childEnvironment.PASSWORD_PEPPER");
    expect(script).not.toContain("membros-preview");
  });
  it("faz hash de senha com salt e verifica sem guardar o texto", async () => { const value=await hashPassword("uma senha bastante segura","pepper"); expect(value.hash).not.toContain("uma senha"); expect(await verifyPassword("uma senha bastante segura","pepper",value.hash,value.parameters)).toBe(true); expect(await verifyPassword("errada","pepper",value.hash,value.parameters)).toBe(false); });
  it("trata credenciais malformadas como inválidas sem derrubar o login", async () => {
    await expect(verifyPassword("senha", "pepper", "hash", "não é JSON")).resolves.toBe(false);
    await expect(verifyPassword("senha", "pepper", "hash", JSON.stringify({ iterations: PASSWORD_ITERATIONS, salt: "%%%" }))).resolves.toBe(false);
  });
  it("respeita o limite de iterações PBKDF2 do Cloudflare Workers", async () => {
    expect(PASSWORD_ITERATIONS).toBe(100_000);
    expect(PASSWORD_ITERATIONS).toBeLessThanOrEqual(100_000);

    const value = await hashPassword("uma senha bastante segura", "pepper", new Uint8Array(16));
    expect(JSON.parse(value.parameters).iterations).toBe(PASSWORD_ITERATIONS);
    await expect(verifyPassword("uma senha bastante segura", "pepper", value.hash, value.parameters)).resolves.toBe(true);
  });
  it("gera tokens opacos com pelo menos 256 bits", () => expect(randomToken().length).toBeGreaterThanOrEqual(43));
  it("gera senha temporária criptograficamente aleatória sem formato de URL", () => {
    const first=generateTemporaryPassword(),second=generateTemporaryPassword();
    expect(first).toHaveLength(43); expect(second).toHaveLength(43); expect(first).not.toBe(second); expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("normaliza telefones brasileiros com máscara ou código do país", () => { expect(normalizePhone("(11) 99933-2373")).toBe("+5511999332373"); expect(normalizePhone("+55 11 99933-2373")).toBe("+5511999332373"); expect(normalizePhone("telefone inválido")).toBe(""); });
  it("prepara e-mail ou telefone como identificador do mesmo login", () => {
    expect(normalizeLoginIdentifier(" NUTRIEVANDROAVILA@GMAIL.COM ")).toEqual({ email: "nutrievandroavila@gmail.com", phone: "" });
    expect(normalizeLoginIdentifier("(11) 99933-2373")).toEqual({ email: "(11) 99933-2373", phone: "+5511999332373" });
  });
  it("publica o formulário com identificação dupla e token explícito do Turnstile", () => {
    const app = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
    expect(app).toContain("E-mail ou telefone");
    expect(app).toContain("data.turnstileToken=turnstileToken");
    expect(app).not.toContain('||"dev-bypass"');
  });
  it("limita o link do WhatsApp ao hotspot responsivo da arte", () => {
    const app = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
    expect(app).toContain('href="https://chat.whatsapp.com/DHg1iTbNSZb20AJXDpxsbh"');
    expect(app).toContain('rel="noopener noreferrer"');
    expect(app).toContain('aria-label="Entrar no grupo gratuito da Jornada Metabólica no WhatsApp"');
    expect(app).toContain("const communityHotspot={left:640/1254,top:899/1254,width:532/1254,height:96/1254}");
    expect(app).not.toContain('<a class="visual-panel"');
  });
  it("não publica interface de cadastro", () => {
    const app = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
    expect(app).not.toContain("Cadastre-se");
    expect(app).not.toContain('href="/cadastro"');
    expect(app).not.toContain('kind:"register"');
  });
  it("redireciona rotas antigas de cadastro para o login", async () => {
    for (const path of ["/cadastro", "/cadastro/", "/registro", "/registro/", "/register", "/register/"]) {
      const response = await worker.fetch(new Request(`https://membros.evandroavila.com.br${path}`), {} as never);
      expect(response.status, path).toBe(302);
      expect(response.headers.get("location"), path).toBe("https://membros.evandroavila.com.br/login");
    }
  });
  it("serve /login e /login/ pelo Worker para visitantes", async () => {
    const fetch = async () => new Response("login");
    const env = { ASSETS: { fetch }, DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } } as never;
    for (const path of ["/login", "/login/"]) {
      const response = await worker.fetch(new Request(`https://membros.evandroavila.com.br${path}`), env);
      expect(response.status, path).toBe(200);
    }
  });
  it("protege perfil e início contra acesso sem sessão", async () => {
    const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } } as never;
    for (const path of ["/perfil", "/inicio"]) {
      const response = await worker.fetch(new Request(`https://membros.evandroavila.com.br${path}`), env);
      expect(response.status, path).toBe(302);
      expect(response.headers.get("location"), path).toBe("https://membros.evandroavila.com.br/login");
    }
  });
  it("mantém a sessão válida e evita apresentar o login novamente", async () => {
    const user = { id:"user-1", email:"membro@example.com", phone:null, display_name:"Membro", password_hash:"", password_parameters:"", role:"member", status:"active", must_change_password:0 };
    const env = { APP_ENV:"production", DB: { prepare: () => ({ bind: () => ({ first: async () => user }) }) } } as never;
    const response = await worker.fetch(new Request("https://membros.evandroavila.com.br/login", { headers:{ cookie:"__Host-session=sessao-valida" } }), env);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://membros.evandroavila.com.br/inicio");
  });
  it("obriga a troca da senha provisória antes de liberar a área", async () => {
    const user = { id:"user-1", email:"membro@example.com", phone:null, display_name:"Membro", password_hash:"", password_parameters:"", role:"member", status:"active", must_change_password:1 };
    const env = { APP_ENV:"production", DB: { prepare: () => ({ bind: () => ({ first: async () => user }) }) } } as never;
    for (const path of ["/login", "/inicio", "/inicio/"]) {
      const response = await worker.fetch(new Request(`https://membros.evandroavila.com.br${path}`, { headers:{ cookie:"__Host-session=sessao-valida" } }), env);
      expect(response.status, path).toBe(302);
      expect(response.headers.get("location"), path).toBe("https://membros.evandroavila.com.br/perfil");
    }
  });
  it("não cria loop ao servir perfil e início para uma sessão autenticada", async () => {
    const authenticatedRequest = (path: string) => new Request(`https://membros.evandroavila.com.br${path}`, { headers:{ cookie:"__Host-session=sessao-valida" } });
    const user = { id:"user-1", email:"membro@example.com", phone:null, display_name:"Membro", password_hash:"", password_parameters:"", role:"member", status:"active", must_change_password:1 };
    const assetPaths: string[] = [];
    const env = {
      APP_ENV:"production",
      DB: { prepare: () => ({ bind: () => ({ first: async () => user }) }) },
      ASSETS: { fetch: async (request: Request) => {
        const pathname = new URL(request.url).pathname;
        assetPaths.push(pathname);
        // Cloudflare canonicaliza URLs .html para a rota sem extensão. Repassar
        // /perfil.html ao binding reproduziria o ERR_TOO_MANY_REDIRECTS.
        return pathname.endsWith(".html") ? Response.redirect(new URL(pathname.replace(/\.html$/, ""), request.url), 302) : new Response("asset");
      } },
    } as never;

    const profile = await worker.fetch(authenticatedRequest("/perfil"), env);
    expect(profile.status).toBe(200);
    expect(profile.headers.get("location")).toBeNull();
    expect(assetPaths).toEqual(["/perfil"]);

    const start = await worker.fetch(authenticatedRequest("/inicio"), env);
    expect(start.status).toBe(302);
    expect(start.headers.get("location")).toBe("https://membros.evandroavila.com.br/perfil");
  });
  it("libera perfil e início depois da troca obrigatória de senha", async () => {
    const user = { id:"user-1", email:"membro@example.com", phone:null, display_name:"Membro", password_hash:"", password_parameters:"", role:"member", status:"active", must_change_password:0 };
    const served: string[] = [];
    const env = {
      APP_ENV:"production",
      DB: { prepare: () => ({ bind: () => ({ first: async () => user }) }) },
      ASSETS: { fetch: async (request: Request) => { served.push(new URL(request.url).pathname); return new Response("asset"); } },
    } as never;
    for (const path of ["/perfil", "/inicio"]) {
      const response = await worker.fetch(new Request(`https://membros.evandroavila.com.br${path}`, { headers:{ cookie:"__Host-session=sessao-valida" } }), env);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("location"), path).toBeNull();
    }
    expect(served).toEqual(["/perfil", "/inicio"]);
  });
  it("mantém o frontend do perfil na própria página durante a troca obrigatória", () => {
    const profile = readFileSync(new URL("../public/js/profile.js", import.meta.url), "utf8");
    const html = readFileSync(new URL("../public/perfil.html", import.meta.url), "utf8");
    expect(profile).not.toContain('location.replace("/perfil")');
    expect(profile).toContain('if(mandatoryChange)location.replace("/inicio")');
    expect(profile).toContain("currentField.hidden=true");
    expect(profile).toContain('button.textContent="Salvar e entrar"');
    expect(html).toContain('name="confirmPassword"');
  });
  it("protege também as variantes com barra final", async () => {
    const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } } as never;
    for (const path of ["/inicio/", "/perfil/"]) {
      const response = await worker.fetch(new Request(`https://membros.evandroavila.com.br${path}`), env);
      expect(response.status, path).toBe(302);
      expect(response.headers.get("location"), path).toBe("https://membros.evandroavila.com.br/login");
    }
  });
  it("não disponibiliza endpoint público de registro", async () => {
    const request = new Request("https://membros.evandroavila.com.br/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://membros.evandroavila.com.br" },
      body: JSON.stringify({ email: "membro@example.com", password: "senha-segura-123", name: "Membro" }),
    });
    const response = await worker.fetch(request, { APP_ORIGIN: "https://membros.evandroavila.com.br" } as never);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Rota não encontrada." });
  });

  it("executa o fluxo definitivo: senha temporária, troca obrigatória e logins seguintes", async () => {
    const pepper="pepper-de-teste",temporary="Temporaria-segura-123",permanent="Definitiva-segura-456";
    const initial=await hashPassword(temporary,pepper,new Uint8Array(16).fill(1));
    const user={id:"user-1",email:"membro@example.com",phone:null,display_name:"Membro",password_hash:initial.hash,password_algorithm:"pbkdf2-sha256",password_parameters:initial.parameters,role:"member",status:"active",must_change_password:1};
    const sessions=new Map<string,{csrf_secret_hash:string;revoked_at:string|null}>();
    const database={prepare(sql:string){return {bind(...values:unknown[]){return {
      first:async()=>{
        if(sql.startsWith("SELECT * FROM users WHERE")) return values[0]===user.email?user:null;
        if(sql.startsWith("SELECT u.* FROM sessions")){const session=sessions.get(values[0] as string);return session&&!session.revoked_at?user:null}
        if(sql.startsWith("SELECT csrf_secret_hash")) return sessions.get(values[0] as string)||null;
        return null;
      },
      run:async()=>{
        if(sql.startsWith("INSERT INTO sessions")) sessions.set(values[0] as string,{csrf_secret_hash:values[2] as string,revoked_at:null});
        if(sql.startsWith("UPDATE users SET password_hash")){if(values[3]!==user.id||values[4]!==user.password_hash)return {meta:{changes:0}};user.password_hash=values[0] as string;user.password_parameters=values[1] as string;user.password_algorithm="pbkdf2-sha256";user.must_change_password=0;return {meta:{changes:1}}}
        if(sql.startsWith("UPDATE sessions SET revoked_at")){for(const session of sessions.values())session.revoked_at=values[0] as string}
        return {meta:{changes:1}};
      },
    }}}}};
    const env={APP_ENV:"development",APP_ORIGIN:"https://membros.evandroavila.com.br",SESSION_TTL_SECONDS:"2592000",PASSWORD_PEPPER:pepper,DB:database} as never;
    const post=(path:string,payload:Record<string,unknown>,cookie?:string,csrf?:string)=>worker.fetch(new Request(`https://membros.evandroavila.com.br${path}`,{method:"POST",headers:{"content-type":"application/json",origin:"https://membros.evandroavila.com.br",...(cookie?{cookie}:{}),...(csrf?{"x-csrf-token":csrf}:{})},body:JSON.stringify(payload)}),env);

    const login=await post("/api/v1/auth/login",{identifier:user.email,password:temporary,turnstileToken:"dev-bypass"});
    expect(login.status).toBe(200); expect((await login.clone().json()).user.mustChangePassword).toBe(true);
    const cookies=login.headers.getSetCookie(),sessionCookie=cookies.find(value=>value.startsWith("session="))!.split(";")[0],csrfCookie=cookies.find(value=>value.startsWith("csrf="))!.split(";")[0],csrf=csrfCookie.slice(5),cookie=`${sessionCookie}; ${csrfCookie}`;

    const mismatch=await post("/api/v1/auth/change-password",{newPassword:permanent,confirmPassword:"Outra-senha-segura-789"},cookie,csrf);
    expect(mismatch.status).toBe(422); expect(user.must_change_password).toBe(1);
    const changed=await post("/api/v1/auth/change-password",{newPassword:permanent,confirmPassword:permanent},cookie,csrf);
    expect(changed.status).toBe(200); expect(user.must_change_password).toBe(0); expect(user.password_algorithm).toBe("pbkdf2-sha256");
    expect(await verifyPassword(temporary,pepper,user.password_hash,user.password_parameters)).toBe(false);
    expect(await verifyPassword(permanent,pepper,user.password_hash,user.password_parameters)).toBe(true);

    expect((await post("/api/v1/auth/login",{identifier:user.email,password:temporary,turnstileToken:"dev-bypass"})).status).toBe(401);
    const relogin=await post("/api/v1/auth/login",{identifier:user.email,password:permanent,turnstileToken:"dev-bypass"});
    expect(relogin.status).toBe(200); expect((await relogin.json()).user.mustChangePassword).toBe(false);
    const nextCookies=relogin.headers.getSetCookie(),nextSession=nextCookies.find(value=>value.startsWith("session="))!.split(";")[0],nextCsrfCookie=nextCookies.find(value=>value.startsWith("csrf="))!.split(";")[0],nextCsrf=nextCsrfCookie.slice(5);
    const withoutCurrent=await post("/api/v1/auth/change-password",{newPassword:"Terceira-senha-segura-789",confirmPassword:"Terceira-senha-segura-789"},`${nextSession}; ${nextCsrfCookie}`,nextCsrf);
    expect(withoutCurrent.status).toBe(401);
    const withCurrent=await post("/api/v1/auth/change-password",{currentPassword:permanent,newPassword:"Terceira-senha-segura-789",confirmPassword:"Terceira-senha-segura-789"},`${nextSession}; ${nextCsrfCookie}`,nextCsrf);
    expect(withCurrent.status).toBe(200);
  });

  it("provisiona usuário guardando somente o hash e envia a senha pelo binding de e-mail", async () => {
    const sessionToken="sessao-admin",csrf="csrf-admin",sessionId=await sha256(sessionToken),csrfHash=await sha256(csrf),inserted:unknown[][]=[],sent:EmailMessageBuilder[]=[];
    const admin={id:"admin-1",email:"admin@example.com",phone:null,display_name:"Admin",password_hash:"hash",password_algorithm:"pbkdf2-sha256",password_parameters:"{}",role:"admin",status:"active",must_change_password:0};
    const env={APP_ENV:"development",APP_ORIGIN:"https://membros.evandroavila.com.br",PASSWORD_PEPPER:"pepper-de-teste",EMAIL_FROM:"acesso@example.com",EMAIL:{send:async(message:EmailMessageBuilder)=>{sent.push(message);return {messageId:"message-1"}}},DB:{prepare:(sql:string)=>({bind:(...values:unknown[])=>({first:async()=>sql.startsWith("SELECT u.*")&&values[0]===sessionId?admin:sql.startsWith("SELECT csrf_secret_hash")?{csrf_secret_hash:csrfHash}:null,run:async()=>{if(sql.startsWith("INSERT INTO users"))inserted.push(values);return {meta:{changes:1}}}})})}} as never;
    const response=await worker.fetch(new Request("https://membros.evandroavila.com.br/api/v1/admin/users",{method:"POST",headers:{"content-type":"application/json",origin:"https://membros.evandroavila.com.br",cookie:`session=${sessionToken}; csrf=${csrf}`,"x-csrf-token":csrf},body:JSON.stringify({name:"Novo Membro",email:"novo@example.com"})}),env);
    expect(response.status).toBe(201); expect(inserted).toHaveLength(1); expect(sent).toHaveLength(1);
    const message=sent[0],temporary=message.text!.match(/Senha temporária: (.+)/)![1];
    expect(message.to).toBe("novo@example.com"); expect(temporary).toHaveLength(43); expect(inserted[0]).not.toContain(temporary);
    expect(inserted[0][4]).toBe("pbkdf2-sha256"); expect(inserted[0][8]).toBe(1);
    expect(await verifyPassword(temporary,"pepper-de-teste",inserted[0][3] as string,inserted[0][5] as string)).toBe(true);
  });
});
