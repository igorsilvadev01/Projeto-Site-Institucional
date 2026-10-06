import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export function localEmail(directory, address, pattern) {
  const folder = path.join(directory, "outbox");
  const files = readdirSync(folder).sort().reverse();
  for (const file of files) {
    const raw = readFileSync(path.join(folder, file), "utf8");
    const split = raw.search(/\r?\n\r?\n/);
    const headers = raw.slice(0, split), body = raw.slice(split).trim();
    const decoded = /Content-Transfer-Encoding: base64/i.test(headers) ? Buffer.from(body, "base64").toString("utf8") : body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    if (headers.includes(address) && pattern.test(decoded)) return decoded.match(pattern);
  }
  throw new Error("Mensagem local esperada não encontrada.");
}

export const registrationCode = (directory, address) => localEmail(directory, address, /confirma[^\r\n]*: (\d{6})/)[1];
