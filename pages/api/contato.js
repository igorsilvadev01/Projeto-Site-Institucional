import { Readable } from "node:stream";
import { handled, contact } from "../../lib/server/core.js";

// IncomingMessage fornece o IP real do socket; NextRequest não o expõe.
// A validação e o limite de 32 KB continuam sendo feitos por contact().
export const config = { api: { bodyParser: false } };
const handleContact = handled(contact);

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Método não permitido." });
    return;
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const protocol = request.socket.encrypted ? "https" : "http";
  const webRequest = new Request(`${protocol}://${headers.get("host") || "localhost"}${request.url}`, {
    method: "POST", headers, body: Readable.toWeb(request), duplex: "half",
  });
  const result = await handleContact(webRequest, { clientIp: request.socket.remoteAddress });
  for (const [name, value] of result.headers) response.setHeader(name, value);
  response.status(result.status).send(Buffer.from(await result.arrayBuffer()));
}
