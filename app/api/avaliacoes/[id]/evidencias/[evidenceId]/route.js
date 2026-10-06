import { handled, downloadEvidence, deleteEvidence } from "@/lib/server/core";
export const runtime = "nodejs";
export const GET = handled(downloadEvidence);
export const DELETE = handled(deleteEvidence);
