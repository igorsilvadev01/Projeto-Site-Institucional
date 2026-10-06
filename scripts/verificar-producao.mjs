import { productionProblems } from "../lib/server/preflight.js";
const errors = productionProblems();
if (errors.length) { console.error("Configuração de produção pendente:\n" + errors.map(error => `- ${error}`).join("\n")); process.exitCode = 1; }
else console.log("Configuração validada. Execute os testes de entrega SMTP e restauração antes de liberar usuários reais.");
