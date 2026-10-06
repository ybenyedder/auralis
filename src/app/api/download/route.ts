import { json } from "@/server/http";
import { getRequestUser } from "@/server/auth";
import { readJsonBody } from "@/server/http";
import { downloadsAvailable, startDownload, getJob, listJobs, cancelJob } from "@/server/library/downloader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { query, videoId?, title? } → start (or join) a download job.
 *  GET  ?job=<id> → one job's status · GET (bare) → availability + recent jobs.
 *  DELETE ?job=<id> → cancel a queued/running job. */
export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await readJsonBody<{ query?: string; videoId?: string; title?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const { query, videoId, title } = parsed.body;
  if (!videoId && !query?.trim()) {
    return json({ error: "Précisez un identifiant vidéo ou une recherche" }, { status: 400 });
  }

  const result = startDownload({
    query: (query ?? title ?? videoId ?? "").trim(),
    videoId: videoId?.trim() || undefined,
    title: title?.trim() || undefined,
    requestedBy: user.username,
  });
  if (!result.ok) return json({ ok: false, error: result.error }, { status: result.status });
  return json({ ok: true, job: result.job });
}

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const jobId = url.searchParams.get("job");
  if (jobId) {
    const job = getJob(jobId);
    if (!job) return json({ error: "Job introuvable" }, { status: 404 });
    return json({ job });
  }
  return json({ enabled: await downloadsAvailable(), jobs: listJobs() });
}

export async function DELETE(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const jobId = url.searchParams.get("job");
  if (!jobId) return json({ error: "Job manquant" }, { status: 400 });
  const ok = cancelJob(jobId);
  return json({ ok }, { status: ok ? 200 : 409 });
}
