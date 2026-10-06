import { handled } from "@/lib/server/core";
import { requireUser } from "@/lib/server/auth";
import { assessmentQuestions } from "@/lib/assessment";

export const runtime = "nodejs";
export const GET = handled(async request => {
  requireUser(request);
  const cell = value => `"${String(value).replaceAll('"', '""')}"`;
  const rows = [["Área", "Controle", "Pergunta", "Situação", "Responsável"], ...assessmentQuestions.map(item => [item.domain === "security" ? "Segurança" : "Privacidade", item.title, item.description, "", ""])];
  return new Response("\uFEFF" + rows.map(row => row.map(cell).join(";")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="portfolio-checklist.csv"', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
});
