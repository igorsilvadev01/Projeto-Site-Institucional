import { db, json } from "@/lib/server/core";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  try { db().prepare("SELECT 1").get(); return json({ status: "ok" }); }
  catch { return json({ status: "unavailable" }, 503); }
}
