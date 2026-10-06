import Link from "next/link";

export function PageHero({ eyebrow, title, description, children }) {
  return <section className="page-hero"><div className="shell page-hero__inner"><div>{eyebrow && <p className="page-kicker">{eyebrow}</p>}<h1>{title}</h1><p>{description}</p></div>{children && <div className="page-hero__aside">{children}</div>}</div></section>;
}

export function SectionHeading({ eyebrow, title, description }) {
  return <div className="section-heading">{eyebrow && <p className="page-kicker">{eyebrow}</p>}<h2>{title}</h2>{description && <p>{description}</p>}</div>;
}

export function ServiceCard({ number, title, description, children }) {
  return <article className="service-card">{number && <span className="service-card__number" aria-hidden="true">{number}</span>}<h3>{title}</h3>{description && <p>{description}</p>}{children}</article>;
}

export function FAQ({ items }) {
  return <div className="faq-list">{items.map(({ question, answer }) => <details key={question}><summary>{question}</summary><div className="content-prose"><p>{answer}</p></div></details>)}</div>;
}

export function CtaBand({ title, description, href = "/contato", label = "Conversar com a Plataforma de Privacidade" }) {
  return <section className="cta-band"><div className="shell split-layout"><div><h2>{title}</h2><p>{description}</p></div><Link className="button button--navy" href={href}>{label}</Link></div></section>;
}

export function Steps({ items }) {
  return <ol className="process-grid">{items.map(({ title, description }, index) => <li className="process-step" key={title}><span className="service-card__number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{description}</p></li>)}</ol>;
}
