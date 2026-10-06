import { handled, uploadEvidence } from "@/lib/server/core";
export const runtime = "nodejs";
export const POST = handled(uploadEvidence);
