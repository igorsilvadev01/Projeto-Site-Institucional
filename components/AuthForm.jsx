"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const content = {
  login: { title: "Acesse sua conta", description: "Que bom ter você por aqui. Entre com seu e-mail e senha.", action: "Entrar" },
  cadastro: { title: "Crie sua conta", description: "Seu primeiro passo para estar mais perto da Plataforma de Privacidade.", action: "Criar conta" },
  recuperar: { title: "Esqueceu sua senha?", description: "Informe o e-mail da sua conta para recuperar o acesso.", action: "Solicitar recuperação" },
  redefinir: { title: "Escolha uma nova senha", description: "Use uma senha exclusiva para sua conta Plataforma de Privacidade.", action: "Redefinir senha" },
};

export default function AuthForm({ mode = "login" }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [completed, setCompleted] = useState(false);
  const [secondFactor, setSecondFactor] = useState(false);
  const registration = mode === "cadastro";
  const recovery = mode === "recuperar";
  const resetting = mode === "redefinir";
  const newPassword = registration || resetting;
  const copy = secondFactor ? { title: "Confirme seu acesso", description: "Use o código do aplicativo autenticador ou um dos seus códigos de recuperação.", action: "Confirmar acesso" } : content[mode];

  useEffect(() => {
    if (resetting) {
      const value = window.location.hash.slice(1);
      setResetToken(value);
      if (!/^[\w-]{43}$/.test(value)) setError("Link inválido. Solicite uma nova recuperação de senha.");
    }
  }, [resetting]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setMessage("");
    const fields = event.currentTarget.elements;
    if (registration && !fields.namedItem("name").value.trim()) {
      setError("Informe seu nome completo.");
      fields.namedItem("name").focus();
      return;
    }
    if (newPassword && fields.namedItem("password").value !== fields.namedItem("confirmation").value) {
      setError("As senhas não coincidem. Confira a confirmação da senha.");
      fields.namedItem("confirmation").focus();
      return;
    }
    const payload = {
      email: fields.namedItem("email")?.value,
      name: fields.namedItem("name")?.value,
      password: fields.namedItem("password")?.value,
      terms: fields.namedItem("terms")?.checked,
      ...(resetting ? { token: resetToken } : {}),
      ...(secondFactor ? { code: fields.namedItem("code")?.value } : {}),
    };
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${secondFactor ? "confirmar-login" : mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) { if (secondFactor && response.status === 401) setSecondFactor(false); throw new Error(result.error || "Não foi possível concluir. Tente novamente."); }
      if (result.mfaRequired) { setSecondFactor(true); setMessage(result.message); return; }
      if (registration && result.verificationRequired) {
        window.location.assign("/confirmar-cadastro");
        return;
      }
      if (mode === "login") {
        window.location.assign("/minha-conta");
        return;
      }
      setMessage(result.message);
      if (resetting) {
        setCompleted(true);
        setResetToken("");
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch (failure) { setError(failure.message || "Verifique sua conexão e tente novamente."); }
    finally { setBusy(false); }
  }

  return (
    <main id="conteudo" className="auth-page">
      <div className="shell auth-layout">
        <aside className="auth-intro" aria-label="Plataforma de Privacidade">
          <span className="auth-kicker">ÁREA DO USUÁRIO</span>
          <h2>Confiança em cada conexão.</h2>
          <p>Governança, privacidade e segurança da informação para acompanhar a evolução do seu negócio.</p>
          <div className="auth-intro__detail"><span aria-hidden="true">↗</span><p>Mais proximidade.<br />Mais possibilidades.</p></div>
          <Link href="/sobre">Conheça a Plataforma de Privacidade ↗</Link>
        </aside>
        <section className="auth-card" aria-labelledby="auth-title">
          <Link href="/" className="auth-back">← Voltar ao site</Link>
          <h1 id="auth-title">{copy.title}</h1>
          <p className="auth-description">{copy.description}</p>
          <form onSubmit={handleSubmit} aria-label={copy.title} aria-busy={busy} onChange={() => { setError(""); setMessage(""); }}>
            <fieldset className="auth-fields" disabled={busy || completed}>
            {registration && <label className="form-field" htmlFor="auth-name">Nome completo<input id="auth-name" name="name" autoComplete="name" required maxLength={120} /></label>}
            {secondFactor && <label className="form-field" htmlFor="auth-code">Código de autenticação<input id="auth-code" name="code" required maxLength={32} autoComplete="one-time-code" autoCapitalize="characters" /></label>}
            {!resetting && !secondFactor && <label className="form-field" htmlFor="auth-email">E-mail<input id="auth-email" name="email" type="email" autoComplete="email" placeholder="voce@empresa.com.br" required maxLength={254} /></label>}
            {!recovery && !secondFactor && <div className="form-field">
              <label htmlFor="auth-password">Senha</label>
              <div className="auth-password">
                <input id="auth-password" name="password" type={visible ? "text" : "password"} autoComplete={newPassword ? "new-password" : "current-password"} required minLength={newPassword ? 12 : undefined} maxLength={128} aria-describedby={newPassword ? "password-help" : undefined} />
                <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visible} aria-controls="auth-password">{visible ? "Ocultar" : "Mostrar"}</button>
              </div>
              {newPassword && <small id="password-help" className="form-help">Use de 12 a 128 caracteres. Uma frase com várias palavras pode ajudar.</small>}
            </div>}
            {newPassword && <label className="form-field" htmlFor="auth-confirmation">Confirmar senha<input id="auth-confirmation" name="confirmation" type={visible ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} /></label>}
            {mode === "login" && !secondFactor && <div className="auth-recovery"><Link href="/recuperar-senha">Esqueci minha senha</Link></div>}
            {secondFactor && <button type="button" className="admin-clear" onClick={() => { setSecondFactor(false); setError(""); setMessage(""); }}>Voltar para email e senha</button>}
            {registration && <label className="consent-field"><input type="checkbox" required name="terms" /><span>Li e aceito os <Link href="/termos-de-uso">Termos de Uso</Link> e estou ciente da <Link href="/politica-de-privacidade">Política de Privacidade</Link>.</span></label>}
            <button type="submit" className="auth-submit" disabled={resetting && !resetToken}>{busy ? "Aguarde…" : copy.action} <span aria-hidden="true">↗</span></button>
            </fieldset>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div role="status" aria-live="polite">{message && <p className="auth-notice">{message}</p>}</div>
          </form>
          {resetting && !completed && <p className="auth-switch"><Link href="/recuperar-senha">Solicitar outro link de recuperação</Link></p>}
          <p className="auth-switch">{mode === "login" ? <>Ainda não tem conta? <Link href="/cadastro">Cadastre-se</Link></> : <>Já tem uma conta? <Link href="/login">Voltar para o login</Link></>}</p>
        </section>
      </div>
    </main>
  );
}
