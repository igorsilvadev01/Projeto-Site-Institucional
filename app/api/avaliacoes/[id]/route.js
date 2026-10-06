import { handled, getAssessment } from "@/lib/server/core";
export const runtime = "nodejs";
export const GET = handled(getAssessment);
