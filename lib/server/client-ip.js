import { isIP } from "node:net";

function normalizeIp(value) {
  if (typeof value !== "string") return null;
  const address = value.trim();
  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6) return null;
  const normalized = new URL(`http://[${address.split("%")[0]}]/`).hostname.slice(1, -1);
  // IPv4 e sua representação IPv6 devem compartilhar o mesmo intervalo.
  const mapped = normalized.match(/^::ffff:([\da-f]+):([\da-f]+)$/);
  if (!mapped) return normalized;
  const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

export function clientIdentity(request, remoteAddress) {
  // Só confiar no cabeçalho quando a hospedagem tiver um proxy que o sobrescreva.
  const forwarded = process.env.PORTFOLIO_TRUST_PROXY === "true"
    ? normalizeIp(request.headers.get("x-forwarded-for")?.split(",")[0]) : null;
  if (process.env.NODE_ENV === "production" && process.env.PORTFOLIO_TRUST_PROXY === "true") return forwarded || "local";
  return forwarded || normalizeIp(remoteAddress) || "local";
}
