"use client";
import { useState } from "react";

export default function NewsletterArchive({ editions }) {
  const [query, setQuery] = useState("");
  const filtered = editions.filter(edition => `${edition.title} ${edition.description}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  if (!editions.length) return <div className="empty-state"><span className="service-card__number">↗</span><h3>Um espaço para acompanhar cada edição.</h3><p>As edições publicadas serão reunidas aqui assim que seus links estiverem disponíveis. Inscreva-se para acompanhar as próximas publicações.</p></div>;
  return <><label className="form-field archive-search">Buscar uma edição<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Busque por tema ou título" /></label><p className="form-help" aria-live="polite">{filtered.length} edição(ões) encontrada(s).</p><div className="card-grid">{filtered.map(edition => <article className="service-card" key={edition.url}><span className="tag">{edition.date}</span><h3>{edition.title}</h3><p>{edition.description}</p><a className="card-link" href={edition.url} target="_blank" rel="noopener noreferrer">Ler edição ↗</a></article>)}</div></>;
}
