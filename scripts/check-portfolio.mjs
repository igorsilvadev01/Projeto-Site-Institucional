import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const skip = new Set(['node_modules', '.git', '.next', '.next-tests', '.data', 'backups', 'test-results', 'playwright-report', 'artifacts']);
const issues = [];
let count = 0;
const originalMarker = new RegExp(['ky', 'va'].join(''), 'i');
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(root, absolute);
    if (entry.isSymbolicLink()) { issues.push(`Link simbólico no pacote: ${relative}`); continue; }
    if (entry.isDirectory()) { visit(absolute); continue; }
    count++;
    // O pacote de distribuição original também pode ficar na raiz do GitHub.
    if (relative === 'privacy-platform-portfolio.zip') continue;
    if ((/^\.env(?:\.|$)/.test(entry.name) && entry.name !== '.env.example') || /\.(sqlite(?:-\w+)?|db|pem|key|zip)$/i.test(entry.name)) issues.push(`Arquivo privado ou de execução: ${relative}`);
    if (/\.(ttf|png|jpg|jpeg|webp)$/i.test(entry.name)) continue;
    const text = fs.readFileSync(absolute, 'utf8');
    if (originalMarker.test(relative) || originalMarker.test(text)) issues.push(`Referência à identidade original: ${relative}`);
    if (/99133[-\s]?8077|108\.179\.253\.162|C:\\Users\\/i.test(text)) issues.push(`Dado de operação original: ${relative}`);
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}/.test(text)) issues.push(`Possível credencial: ${relative}`);
  }
}
visit(root);
for (const line of fs.readFileSync(path.join(root, '.env.example'), 'utf8').split(/\r?\n/)) {
  if (/^(SMTP_HOST|SMTP_USER|SMTP_PASS|MAIL_FROM|CONTACT_EMAIL|NEXT_PUBLIC_CONTACT_EMAIL|NEXT_PUBLIC_WHATSAPP|NEXT_PUBLIC_LINKEDIN_URL|NEXT_PUBLIC_FOUNDER_NAME|PORTFOLIO_ENCRYPTION_KEY)=.+/.test(line)) issues.push('Configuração sensível preenchida no exemplo de ambiente.');
}
if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
else console.log(`Pacote público verificado: ${count} arquivos; sem referências originais ou arquivos privados detectados. Dados locais e dependências ignorados. Esta checagem não substitui a revisão do conteúdo do commit.`);
