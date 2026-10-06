import { handled, subscribe } from "@/lib/server/core";
export const runtime = "nodejs";
export const POST = handled(subscribe);
