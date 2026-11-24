/**
 * Limiteur de charge EN MÉMOIRE.
 *
 * ⚠️ Limitation connue : ce limiteur n'est fiable que sur une instance de
 * processus unique. Sur du serverless multi-instance (Vercel, Cloud Run, etc.),
 * chaque instance garde son propre compteur, donc la limite réelle est
 * multipliée par le nombre d'instances. À terme, remplacer ce stockage en
 * mémoire par un stockage partagé (par exemple une table Supabase avec des
 * fenêtres horaires persistées), pour un comptage correct et global.
 */

const MAX_CONCURRENT_FFMPEG_PER_USER = 1;
const MAX_HEAVY_JOBS_PER_HOUR = 3;

const concurrent = new Map<string, number>();
const hourWindows = new Map<string, number[]>();

export type HeavyJob = "transcode" | "highlights" | "analyze" | "recreate";

export function checkRateLimit(userId: string, job: HeavyJob): { allowed: boolean; message?: string } {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;

  // 1 traitement ffmpeg simultané max par utilisateur (transcode/highlights).
  if (job === "transcode" || job === "highlights") {
    const running = concurrent.get(userId) || 0;
    if (running >= MAX_CONCURRENT_FFMPEG_PER_USER) {
      return {
        allowed: false,
        message: "Un traitement vidéo est déjà en cours. Attendez qu'il soit terminé.",
      };
    }
  }

  // 3 traitements lourds par heure glissante par utilisateur.
  const timestamps = (hourWindows.get(userId) || []).filter((ts) => ts > hourAgo);
  if (timestamps.length >= MAX_HEAVY_JOBS_PER_HOUR) {
    const oldest = Math.min(...timestamps);
    const waitSeconds = Math.ceil((oldest + 60 * 60 * 1000 - now) / 1000);
    return {
      allowed: false,
      message: `Limite de 3 traitements par heure atteinte. Réessayez dans environ ${waitSeconds} minute(s).`,
    };
  }

  if (job === "transcode" || job === "highlights") {
    concurrent.set(userId, (concurrent.get(userId) || 0) + 1);
  }
  hourWindows.set(userId, [...timestamps, now]);
  return { allowed: true };
}

/** À appeler quand un traitement ffmpeg (transcode/highlights) est terminé. */
export function releaseRateLimit(userId: string, job: HeavyJob) {
  if (job === "transcode" || job === "highlights") {
    const running = concurrent.get(userId) || 0;
    if (running <= 1) concurrent.delete(userId);
    else concurrent.set(userId, running - 1);
  }
}
