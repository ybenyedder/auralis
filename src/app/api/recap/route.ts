// Monthly mood recap.
//   GET /api/recap                 → { months[], recap }   (most recent month with data)
//   GET /api/recap?month=2026-05   → { months[], recap }   (that specific month)
// `months` lets the client build a period selector; `recap` is the chosen month.

import { getMonthlyRecap, listRecapMonths } from "@/server/reco/recap";
import { getRequestUser } from "@/server/auth";
import { json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const requested = searchParams.get("month") || undefined;
  const months = listRecapMonths(user.id);
  // Default to the most recent month that actually has listens (so a brand-new
  // current month with nothing yet doesn't show an empty recap by default).
  const month = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : months[0];
  const recap = getMonthlyRecap(user.id, month);
  return json({ months, recap });
}
