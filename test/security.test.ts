import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hashPassword, randomToken, verifyPassword } from "../src/security";
import worker, { normalizeLoginIdentifier, normalizePhone } from "../src/index";
describe("segurança", () => {
  it("faz hash de senha com salt e verifica sem guardar o texto", async () => { const value=await hashPassword("uma senha bastante segura","pepper"); expect(value.hash).not.toContain("uma senha"); expect(await verifyPassword("uma senha bastante segura","pepper",value.hash,value.parameters)).toBe(true); expect(await verifyPassword("errada","pepper",value.hash,value.parameters)).toBe(false); });
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
  it("não publica interface de cadastro", () => {
    const app = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
    expect(app).not.toContain("Cadastre-se");
    expect(app).not.toContain('href="/cadastro"');
    expect(app).not.toContain('kind:"register"');
  });
  it("redireciona a antiga rota de cadastro para o login", async () => {
    const response = await worker.fetch(new Request("https://membros.evandroavila.com.br/cadastro"), {} as never);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://membros.evandroavila.com.br/login");
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
