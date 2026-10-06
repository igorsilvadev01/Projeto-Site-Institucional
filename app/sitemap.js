import { navigation } from "@/lib/site";
export default function sitemap() {
  if (process.env.ALLOW_INDEXING !== "true" || !process.env.SITE_URL) return [];
  const base = new URL(process.env.SITE_URL).origin;
  return [...navigation.map(item=>item.href),"/politica-de-privacidade","/termos-de-uso"].map(path=>({url:`${base}${path}`,changeFrequency:"monthly",priority:path==="/"?1:0.7}));
}
