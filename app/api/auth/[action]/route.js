import { handled, json } from "@/lib/server/core";
import { register, login, logout, recover, resetPassword, profile, changePassword, confirmRegistration, resendRegistration, registrationStatus } from "@/lib/server/auth";
import { mfaSetup, mfaActivate, mfaLogin } from "@/lib/server/mfa";
import { sendEmailVerification, confirmEmailVerification } from "@/lib/server/email-verification";

export const runtime = "nodejs";
const actions = new Map([
  ["cadastro", register], ["login", login], ["sair", logout],
  ["recuperar", recover], ["redefinir", resetPassword],
  ["perfil", profile], ["senha", changePassword],
  ["confirmar-cadastro", confirmRegistration], ["reenviar-codigo", resendRegistration],
  ["configurar-2fa", mfaSetup], ["ativar-2fa", mfaActivate], ["confirmar-login", mfaLogin],
  ["enviar-confirmacao-email", sendEmailVerification], ["confirmar-email", confirmEmailVerification],
]);

export const POST = handled(async (request, context) => {
  const { action } = await context.params;
  const handler = actions.get(action);
  return handler ? handler(request) : json({ error: "Recurso não encontrado." }, 404);
});

export const GET = handled(async (request, context) => {
  const { action } = await context.params;
  return action === "cadastro-pendente" ? registrationStatus(request) : json({ error: "Recurso não encontrado." }, 404);
});
