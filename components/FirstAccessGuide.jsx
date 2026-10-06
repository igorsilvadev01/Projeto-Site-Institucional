import Link from "next/link";

const steps = [
  { title: "Avalie uma empresa", description: "Responda a 12 perguntas sobre as práticas de segurança e privacidade da empresa avaliada." },
  { title: "Conheça os resultados", description: "Veja as notas e o relatório. Sua avaliação fica salva nesta conta para consultar depois." },
  { title: "Planeje as melhorias", description: "Use as recomendações do relatório para escolher o que melhorar primeiro com sua equipe." },
];

export default function FirstAccessGuide({ client }) {
  return <section id="primeiros-passos" className="first-access" aria-labelledby="first-access-title">
    <div className="first-access-intro">
      <p className="first-access-kicker">SEUS PRIMEIROS PASSOS</p>
      <h2 id="first-access-title">Comece pela sua primeira avaliação.</h2>
      <p>Sua conta reúne avaliações, relatórios e materiais de apoio. Veja como começar a entender as práticas de segurança e privacidade de uma empresa.</p>
    </div>
    <ol className="first-access-steps" aria-label="Como começar">
      {steps.map((step, index) => <li key={step.title}><span className="first-access-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><h3>{step.title}</h3><p>{step.description}</p></div></li>)}
    </ol>
    <div className="first-access-actions">
      <Link className="button button--navy" href="/avaliacao-de-terceiros#avaliacao">Fazer minha primeira avaliação</Link>
      <Link className="first-access-secondary" href="/minha-conta/materiais">Conhecer os materiais de apoio <span aria-hidden="true">→</span></Link>
    </div>
    {client && <p className="first-access-client">Como cliente Plataforma de Privacidade, você também pode acompanhar serviços e falar com a equipe pelo atendimento da conta.</p>}
  </section>;
}
