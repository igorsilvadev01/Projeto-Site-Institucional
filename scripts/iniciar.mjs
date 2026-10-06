import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectDirectory = fileURLToPath(new URL("../", import.meta.url));
const nextCli = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
const server = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1"], {
  cwd: projectDirectory,
  stdio: ["inherit", "pipe", "pipe"],
});

let output = "";
let browserOpened = false;

server.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  output = (output + chunk.toString()).slice(-8192);
  const plainOutput = output.replace(/\x1b\[[0-9;]*m/g, "");
  const address = plainOutput.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)/)?.[1];

  if (!browserOpened && address && /Ready in/.test(plainOutput)) {
    browserOpened = true;
    const browser = spawn(
      "powershell.exe",
      ["-NoProfile", "-Command", `Start-Process '${address}'`],
      { windowsHide: true, stdio: "ignore" },
    );
    browser.on("error", () => console.log(`Abra o site no navegador: ${address}`));
    browser.on("exit", (code) => {
      if (code) console.log(`Abra o site no navegador: ${address}`);
    });
  }
});

server.stderr.on("data", (chunk) => process.stderr.write(chunk));
server.on("error", (error) => {
  console.error(`Nao foi possivel iniciar o site: ${error.message}`);
  process.exitCode = 1;
});
server.on("exit", (code) => {
  process.exitCode = code ?? 0;
});

// O terminal tambem entrega Ctrl+C ao Next.js; aguarde sua finalizacao.
process.on("SIGINT", () => {});
