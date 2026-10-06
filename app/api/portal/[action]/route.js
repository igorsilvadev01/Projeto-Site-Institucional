import { handled } from "@/lib/server/core";
import { portalMutation } from "@/lib/server/portal";

export const runtime = "nodejs";
export const POST = handled(portalMutation);
