import { createSmtpTransport, smtpReady } from "../lib/server/smtp.js";
import { mail } from "../lib/server/core.js";

let transport;
try {
  if (!smtpReady() || !process.env.CONTACT_EMAIL) {
    console.error("SMTP incompleto. Preencha SMTP_HOST, MAIL_FROM, CONTACT_EMAIL e, quando houver SMTP_USER, SMTP_PASS em .env.local.");
    console.error("Para Gmail, use uma senha de app: https://myaccount.google.com/apppasswords");
    process.exitCode = 1;
  } else {
    transport = createSmtpTransport();
    await transport.verify();
    await mail({ category: "teste",
      from: process.env.MAIL_FROM, to: process.env.CONTACT_EMAIL,
      subject: "Plataforma de Privacidade — teste de envio do formulário de contato",
      text: "Este é um teste da configuração SMTP da Plataforma de Privacidade.\n\nO servidor de e-mail aceitou o envio para o destinatário das notificações de contato. Para testar o fluxo completo, envie uma mensagem pela página /contato.\n\nPlataforma de Privacidade",
    });
    console.log(`SMTP autenticado. Mensagem de teste aceita para ${process.env.CONTACT_EMAIL}. Confira a caixa de entrada e o spam.`);
  }
} catch (error) {
  // Nunca imprime credenciais ou a resposta bruta do servidor SMTP.
  const message = error.code === "EAUTH"
    ? "Autenticação recusada. Confira SMTP_USER e a senha de app em SMTP_PASS."
    : ["ESOCKET", "ECONNECTION", "ETIMEDOUT", "EDNS"].includes(error.code)
      ? "Falha na conexão SMTP. Confira host, porta, TLS e acesso à rede."
      : "Falha no teste SMTP. Confira a configuração e o destinatário.";
  console.error(message);
  process.exitCode = 1;
} finally { transport?.close(); }
