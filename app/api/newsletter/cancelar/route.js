import { handled, cancelSubscription } from "@/lib/server/core";
export const runtime = "nodejs";
export const POST = handled(cancelSubscription);
