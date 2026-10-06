import NewsletterAction from "@/components/NewsletterAction";
export const metadata = { title: "Confirmar assinatura", robots: { index: false, follow: false } };
export default function ConfirmPage() { return <main id="conteudo" className="section section--tint"><div className="shell narrow"><NewsletterAction action="confirmar" /></div></main>; }
