import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";
export function productionProblems(env = process.env, { filesystem = true } = {}) {
  const errors = [];
  if (Number(process.versions.node.split(".")[0]) < 24) errors.push("Use Node.js 24 LTS ou posterior.");
  let origin;
  try {
    const url = new URL(env.SITE_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !url.hostname.includes(".") || /(^localhost$|\.localhost$|^127\.|^0\.|^\[)/.test(url.hostname)) throw new Error();
    origin = url;
  } catch { errors.push("SITE_URL deve conter a origem HTTPS pública, sem caminho ou credenciais."); }
  if (!env.PORTFOLIO_DOMAIN || origin?.hostname !== env.PORTFOLIO_DOMAIN) errors.push("PORTFOLIO_DOMAIN deve corresponder ao domínio de SITE_URL.");
  if (env.PORTFOLIO_TRUST_PROXY !== "true") errors.push("Configure o proxy confiável para sobrescrever X-Forwarded-For e habilite PORTFOLIO_TRUST_PROXY.");
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS?.trim() || !env.MAIL_FROM || !env.CONTACT_EMAIL) errors.push("Preencha SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM e CONTACT_EMAIL.");
  const secure = env.SMTP_SECURE === "true", port = Number(env.SMTP_PORT);
  if (!(secure && port === 465) && !(!secure && port === 587)) errors.push("SMTP deve usar TLS na porta 465 ou STARTTLS na porta 587.");
  if (!/^[A-Za-z0-9+/]{43}=$/.test(env.PORTFOLIO_ENCRYPTION_KEY || "")) errors.push("Configure uma chave privada PORTFOLIO_ENCRYPTION_KEY de 32 bytes em base64.");
  if (!env.PORTFOLIO_CONTROLLER_NAME?.trim() || !/^\d{14}$/.test((env.PORTFOLIO_CONTROLLER_CNPJ || "").replace(/\D/g, "")) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.PORTFOLIO_PRIVACY_EMAIL || "")) errors.push("Informe razão social, CNPJ e email oficial de privacidade.");
  if (env.PORTFOLIO_LEGAL_APPROVED !== "true") errors.push("Os termos e a política de privacidade precisam de revisão e aprovação antes de PORTFOLIO_LEGAL_APPROVED=true.");
  if (!env.PORTFOLIO_BACKUP_MIRROR_DIR) errors.push("Configure PORTFOLIO_BACKUP_MIRROR_DIR em armazenamento externo montado no servidor.");
  const retention = Number(env.PORTFOLIO_BACKUP_RETENTION || 14);
  if (!Number.isInteger(retention) || retention < 2 || retention > 365) errors.push("PORTFOLIO_BACKUP_RETENTION deve estar entre 2 e 365 cópias.");
  const dirs = ["PORTFOLIO_DATA_DIR", "PORTFOLIO_BACKUP_DIR", "PORTFOLIO_BACKUP_MIRROR_DIR"];
  for (const name of dirs) {
    if (!env[name] || !path.isAbsolute(env[name])) { errors.push(`${name} deve apontar para um diretório privado absoluto e persistente.`); continue; }
    if (filesystem) try { if (!statSync(env[name]).isDirectory()) throw new Error(); accessSync(env[name], constants.R_OK | constants.W_OK); } catch { errors.push(`${name} não está disponível para leitura e escrita.`); }
  }
  if (env.PORTFOLIO_BACKUP_DIR && env.PORTFOLIO_BACKUP_MIRROR_DIR && path.resolve(env.PORTFOLIO_BACKUP_DIR) === path.resolve(env.PORTFOLIO_BACKUP_MIRROR_DIR)) errors.push("O destino externo do backup deve diferir do destino local.");
  return errors;
}
