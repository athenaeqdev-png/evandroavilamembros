import { describe, expect, it } from "vitest";
import { hashPassword, randomToken, verifyPassword } from "../src/security";
describe("segurança", () => {
  it("faz hash de senha com salt e verifica sem guardar o texto", async () => { const value=await hashPassword("uma senha bastante segura","pepper"); expect(value.hash).not.toContain("uma senha"); expect(await verifyPassword("uma senha bastante segura","pepper",value.hash,value.parameters)).toBe(true); expect(await verifyPassword("errada","pepper",value.hash,value.parameters)).toBe(false); });
  it("gera tokens opacos com pelo menos 256 bits", () => expect(randomToken().length).toBeGreaterThanOrEqual(43));
});
