import { json, readJsonBody, checkCsrf } from "@/server/http";
import { getRequestUser } from "@/server/auth";
import {
  downloadsAvailable,
  startDownload,
  getJob,
  listJobs,
  cancelJob,
} from "@/server/library/downloader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { query, videoId?, title? } → start (or join) a download job.
 *  GET  ?job=<id> → one job's status · GET (bare) → availability + recent jobs
 *  (your own; admins see everyone's).
 *  DELETE ?job=<id> → cancel a queued/running job. */
export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  // Awaited verdict: downloadsEnabled() is optimistic on the very first call
  // (before the binary probe resolves) and would let a job start that then
  // fails with an obscure spawn error.
  if (!(await downloadsAvailable())) {
    return json({ ok: false, error: "Téléchargement indisponible : installez yt-dlp sur le serveur" }, { status: 503 });
  }

  const parsed = await readJsonBody<{ query?: string; videoId?: string; title?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const { query, videoId, title } = parsed.body;
  if (!videoId && !query?.trim()) {
    return json({ error: "Précisez un identifiant vidéo ou une recherche" }, { status: 400 });
  }

  const result = startDownload({
    query: (query ?? title ?? videoId ?? "").trim().slice(0, 300),
    videoId: videoId?.trim() || undefined,
    title: title?.trim().slice(0, 300) || undefined,
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
  const jobs = user.is_admin === 1 ? listJobs() : listJobs().filter((j) => j.requestedBy === user.username);
  return json({ enabled: await downloadsAvailable(), jobs });
}

export async function DELETE(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const url = new URL(request.url);
  const jobId = url.searchParams.get("job");
  if (!jobId) return json({ error: "Job manquant" }, { status: 400 });
  // Only the requester (or an admin) may cancel — the job list carries other
  // users' queries; cancelling someone else's download shouldn't be possible.
  const job = getJob(jobId);
  if (!job) return json({ error: "Job introuvable" }, { status: 404 });
  if (user.is_admin !== 1 && job.requestedBy !== user.username) {
    return json({ error: "Réservé au demandeur" }, { status: 403 });
  }
  const ok = cancelJob(jobId);
  return json({ ok }, { status: ok ? 200 : 409 });
}
