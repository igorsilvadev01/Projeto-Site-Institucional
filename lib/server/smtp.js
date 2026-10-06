import nodemailer from "nodemailer";

export function smtpReady() {
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM &&
    (!process.env.SMTP_USER || process.env.SMTP_PASS?.trim()));
}

export function createSmtpTransport() {
  if (!smtpReady()) throw new Error("MailNotConfigured");
  const host = process.env.SMTP_HOST;
  // O Google apresenta a senha de app em grupos separados por espaços.
  const pass = host === "smtp.gmail.com"
    ? process.env.SMTP_PASS?.replace(/\s/g, "") : process.env.SMTP_PASS;
  return nodemailer.createTransport({
    host, port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    requireTLS: process.env.SMTP_SECURE !== "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
}
