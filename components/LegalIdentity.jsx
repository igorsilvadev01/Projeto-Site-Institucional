export default function LegalIdentity() {
  const approved = process.env.PORTFOLIO_LEGAL_APPROVED === "true";
  return <div className="notice">
    {!approved && <p><strong>Versão preliminar para validação.</strong> A identificação institucional, as bases legais, os prazos de conservação e os provedores precisam ser confirmados antes da publicação. Este texto descreve os recursos atuais do site.</p>}
    {process.env.PORTFOLIO_CONTROLLER_NAME && <p>Responsável: {process.env.PORTFOLIO_CONTROLLER_NAME}{process.env.PORTFOLIO_CONTROLLER_CNPJ && ` · CNPJ: ${process.env.PORTFOLIO_CONTROLLER_CNPJ}`}</p>}
    {process.env.PORTFOLIO_PRIVACY_EMAIL && <p>Contato sobre privacidade: <a href={`mailto:${process.env.PORTFOLIO_PRIVACY_EMAIL}`}>{process.env.PORTFOLIO_PRIVACY_EMAIL}</a></p>}
    <p>Atualização: 3 de outubro de 2026.</p>
  </div>;
}
