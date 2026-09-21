import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hashPassword, PASSWORD_ITERATIONS, randomToken, verifyPassword } from "../src/security";
import worker, { normalizeLoginIdentifier, normalizePhone } from "../src/index";
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
  it("protege a sala de aula /inicio contra acesso sem sessão", async () => {
    const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } } as never;
    const response = await worker.fetch(new Request("https://membros.evandroavila.com.br/inicio"), env);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://membros.evandroavila.com.br/login");
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
});
