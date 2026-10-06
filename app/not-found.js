import Link from "next/link";
export default function NotFound() {
  return <main id="conteudo" className="section section--tint"><div className="shell narrow"><p className="page-kicker">404 / Página não encontrada</p><h1>Vamos encontrar um novo caminho.</h1><p>O endereço informado não corresponde a uma página deste site.</p><div className="hero-actions"><Link className="button button--navy" href="/">Voltar ao início</Link><Link className="button button--outline" href="/contato">Entrar em contato</Link></div></div></main>;
}
