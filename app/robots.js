export default function robots() {
  const enabled = process.env.ALLOW_INDEXING === "true";
  return { rules: { userAgent:"*", ...(enabled ? {allow:"/",disallow:["/api/","/minha-conta","/administracao","/login","/cadastro","/redefinir-senha","/avaliacao-de-terceiros/relatorio/","/newsletter/confirmar","/newsletter/cancelar"]} : {disallow:"/"}) }, ...(enabled && process.env.SITE_URL ? {sitemap:`${new URL(process.env.SITE_URL).origin}/sitemap.xml`} : {}) };
}
