import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const directory = path.join(path.resolve(process.env.PORTFOLIO_DATA_DIR || ".data"), "outbox");
let files;
try { files = (await readdir(directory)).filter(file => file.endsWith(".eml")).sort().slice(-10); }
catch (error) { if (error.code !== "ENOENT") throw error; files = []; }
if (!files.length) console.log("Ainda não existem mensagens na caixa de testes local.");
for (const file of files) {
  const message = await readFile(path.join(directory, file), "utf8");
  const separator = message.search(/\r?\n\r?\n/);
  const headers = message.slice(0, separator), rawBody = message.slice(separator).trim();
  const content = /Content-Transfer-Encoding: base64/i.test(headers)
    ? Buffer.from(rawBody.replace(/\s/g, ""), "base64").toString("utf8")
    : /Content-Transfer-Encoding: quoted-printable/i.test(headers)
      ? Buffer.from(rawBody.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, value) => String.fromCharCode(parseInt(value, 16))), "latin1").toString("utf8")
      : rawBody;
  console.log(`\nMensagem local: ${file}\n${headers.match(/^To:.*$/m)?.[0] || ""}\n${content}\n`);
}
if (files.length) console.log("Mensagens de teste: nenhum e-mail foi enviado externamente. Os links de confirmação são privados.");
