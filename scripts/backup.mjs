import { authDatabase } from "../lib/server/auth.js";
import { createBackup, restoreBackup } from "../lib/server/backups.js";
const [action, source, destination] = process.argv.slice(2);
try {
  if (action === "restaurar" && source && destination) {
    await restoreBackup(source, destination);
    console.log("Backup validado e restaurado em diretório novo. O banco ativo não foi alterado.");
  } else if (action === "criar") {
    const store = authDatabase();
    try { const result = await createBackup(store); console.log(`Backup criptografado criado: ${result.filename}`); }
    finally { store.close(); }
  } else throw new Error("Usage");
} catch (error) {
  console.error(error.message === "Usage" ? "Uso: npm run backup -- criar | restaurar arquivo.sqlite.enc diretorio-novo" : `Operação não concluída (${error?.name || "Error"}). Verifique a configuração e preserve o banco ativo.`);
  process.exitCode = 1;
}
