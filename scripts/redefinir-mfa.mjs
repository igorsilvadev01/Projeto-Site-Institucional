import { resetAccountMfa } from "../lib/server/operator.js";
const [email, flag, confirmation] = process.argv.slice(2);
try {
  if (!email || flag !== "--confirmar" || confirmation !== email) throw new Error("Usage");
  resetAccountMfa(email);
  console.log("Autenticador redefinido e sessões encerradas. A conta deverá cadastrar um novo autenticador antes de acessar a administração. A ação foi auditada.");
} catch (error) {
  console.error(error.message === "Usage" ? "Uso: npm run mfa:redefinir -- email@empresa.com --confirmar email@empresa.com. Verifique a identidade do titular antes de executar." : "Não foi possível redefinir a proteção da conta.");
  process.exitCode = 1;
}
