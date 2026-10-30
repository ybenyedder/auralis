import { json, readJsonBody, checkCsrf } from "@/server/http";
import { getRequestUser } from "@/server/auth";
import {
  downloadsAvailable,
  startDownload,
  startDownloadBatch,
  getJob,
  listJobs,
  cancelJob,
} from "@/server/library/downloader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { query, videoId?, title? } → start (or join) a download job ·
 *  POST { items: [{ query, videoId?, title? }] } → bulk enqueue (playlist import).
 *  GET  ?job=<id> → one job's status · GET (bare) → availability + recent jobs
 *  (your own; admins see everyone's).
 *  DELETE ?job=<id> → cancel a queued/running job. */
export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  // Awaited verdict kept for API compatibility — the download engine is pure
  // JS now, so availability is purely a configuration question.
  if (!(await downloadsAvailable())) {
    return json({ ok: false, error: "Téléchargement désactivé sur ce serveur" }, { status: 503 });
  }

  const parsed = await readJsonBody<{ query?: string; videoId?: string; title?: string; items?: Array<{ query?: string; videoId?: string; title?: string }> }>(request);
  if (!parsed.ok) return parsed.response;
  const { query, videoId, title, items } = parsed.body;

  // Bulk mode: "download this playlist's missing tracks" — each item is a
  // query (or a videoId) and becomes its own job, paced by the shared queue.
  if (Array.isArray(items)) {
    const batch = startDownloadBatch({
      items: items.map((item) => ({
        query: (item?.query ?? item?.title ?? item?.videoId ?? "").trim().slice(0, 300),
        videoId: item?.videoId?.trim() || undefined,
        title: item?.title?.trim().slice(0, 300) || undefined,
      })),
      requestedBy: user.username,
    });
    if (!batch.ok) return json({ ok: false, error: batch.error }, { status: batch.status });
    return json({ ok: true, jobs: batch.jobs });
  }

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
