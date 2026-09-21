const encoder = new TextEncoder();
// Cloudflare Workers rejects PBKDF2 requests above 100,000 iterations.
export const PASSWORD_ITERATIONS = 100_000;

export function bytesToBase64(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

export async function sha256(value: string): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export async function hashPassword(password: string, pepper: string, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<{ hash: string; parameters: string }> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password + pepper), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS }, key, 256);
  return { hash: bytesToBase64(new Uint8Array(bits)), parameters: JSON.stringify({ iterations: PASSWORD_ITERATIONS, salt: bytesToBase64(salt) }) };
}

export async function verifyPassword(password: string, pepper: string, expected: string, parameters: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(parameters) as { iterations?: unknown; salt?: unknown };
    if (parsed.iterations !== PASSWORD_ITERATIONS || typeof parsed.salt !== "string" || !parsed.salt) return false;
    const salt = Uint8Array.from(atob(parsed.salt), (char) => char.charCodeAt(0));
    if (salt.length !== 16) return false;
    const actual = (await hashPassword(password, pepper, salt)).hash;
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index++) difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
    return difference === 0;
  } catch {
    // A legacy or damaged credential must behave like an invalid password, not
    // turn a login attempt into an unhandled Worker exception.
    return false;
  }
}

export function randomToken(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
