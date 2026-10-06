import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const kind = process.argv[2];
if (!["contatos", "newsletter"].includes(kind)) {
  console.error("Uso: node scripts/exportar-dados.mjs contatos|newsletter");
  process.exit(1);
}
const directory = path.resolve(process.env.PORTFOLIO_DATA_DIR || path.join(process.cwd(), ".data"));
const source = path.join(directory, "portfolio.sqlite");
if (!existsSync(source)) { console.error("Ainda não existem dados locais para exportar."); process.exit(1); }
const database = new DatabaseSync(source, { readOnly: true });
let rows;
try {
  rows = kind === "contatos"
    ? database.prepare("SELECT reference,payload,created_at,email_delivered FROM contact_requests ORDER BY created_at DESC").all().map(row => ({ ...JSON.parse(row.payload), reference: row.reference, createdAt: new Date(row.created_at).toISOString(), emailDelivered: Boolean(row.email_delivered) }))
    : database.prepare("SELECT name,email,consent_at,subscribed_at FROM subscribers WHERE status='subscribed' ORDER BY subscribed_at DESC").all().map(row => ({ name: row.name, email: row.email, consentAt: new Date(row.consent_at).toISOString(), subscribedAt: new Date(row.subscribed_at).toISOString() }));
} finally { database.close(); }
const target = path.join(directory, "exportacoes");
mkdirSync(target, { recursive: true, mode: 0o700 });
const output = path.join(target, `${kind}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(output, JSON.stringify(rows, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log(`${rows.length} registro(s) exportado(s) para ${output}`);
