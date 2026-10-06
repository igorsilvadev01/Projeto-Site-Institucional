import { setAccountRole } from "../lib/server/operator.js";

const [email, role] = process.argv.slice(2);
if (!email || !["usuario", "cliente", "admin"].includes(role)) {
  console.error("Uso: npm run acesso -- email@empresa.com usuario|cliente|admin");
  process.exitCode = 1;
} else {
  try { setAccountRole(email, role); console.log(`Perfil atualizado para ${role}. Entre novamente. A alteração ficou no histórico de segurança.`); }
  catch (error) { console.error(error.message === "LastAdmin" ? "Não é permitido remover o acesso do último administrador." : "Não foi possível atualizar o acesso. Confira se a conta existe."); process.exitCode = 1; }
}
