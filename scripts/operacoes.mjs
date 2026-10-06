import { operationTick, operationsDatabase } from "../lib/server/operations.js";
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopping = true; });
const once = process.argv.includes("--once");
while (!stopping) {
  try { await operationTick(); }
  catch (error) { console.error(JSON.stringify({ event: "worker_failed", error: error?.name || "Error" })); process.exitCode = once ? 1 : 0; }
  if (once) break;
  // Esperas curtas permitem encerrar o processo sem abandonar um envio em curso.
  for (let seconds = 0; seconds < 30 && !stopping; seconds++) await new Promise(resolve => setTimeout(resolve, 1000));
}
operationsDatabase().close();
