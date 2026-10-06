import { handled, confirmSubscription } from "@/lib/server/core";
export const runtime = "nodejs";
export const POST = handled(confirmSubscription);
