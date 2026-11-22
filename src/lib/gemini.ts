const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-3.6-flash";
const MAX_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 15_000;

function retryDelay(response: Response, retryIndex: number) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter?.trim()) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, seconds * 1000));
    }
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, retryAt - Date.now()));
    }
  }
  return Math.min(MAX_RETRY_DELAY_MS, 1000 * (2 ** retryIndex) + Math.floor(Math.random() * 250));
}

async function generate(parts: Array<Record<string, unknown>>) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY n'est pas configurée.");
  const body = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
  });
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(`${API_BASE}/${MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(240_000),
    });
    if (!response.ok) {
      const details = await response.text();
      const retryable = response.status === 503 || response.status === 429;
      if (retryable && attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      const summary = response.status === 503
        ? "Gemini reste temporairement indisponible après plusieurs tentatives."
        : `Gemini a répondu ${response.status}`;
      throw new Error(`${summary}: ${details.slice(0, 500)}`);
    }
    const payload = await response.json();
    const text = payload.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("");
    if (!text) throw new Error("Gemini n'a renvoyé aucun contenu.");
    return text;
  }
  throw new Error("Gemini n'a renvoyé aucune réponse.");
}

export async function analyzeFrames(frames: Array<{ second: number; base64: string }>) {
  const prompt = `Analyse cette séquence d'images prises à une image par seconde d'une vidéo football, comme un expert TikTok et Instagram Reels.
Retourne uniquement un JSON valide avec : hook (string), patternInterrupt (string), narrativeStructure (string), scenes (array d'objets start, end en secondes, description, purpose, transition), texts (array), cta (string), emojis (array), editingStyle (string), visualStyle (string), soundEffects (array), music (string; indique l'incertitude, ne prétends pas identifier un morceau sans preuve), targetAudience (string), improvementTips (array de conseils), viralScore (entier 0-100).
Les images comportent leur horodatage réel en secondes et peuvent être échantillonnées sur toute la vidéo. Base les débuts/fins de scènes sur ces horodatages. Décris les éléments visibles, n'invente pas de texte illisible et signale les incertitudes.`;
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  for (const frame of frames) {
    parts.push({ text: `Image à t=${frame.second}s` });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: frame.base64 } });
  }
  return generate(parts);
}

export async function generateRemake(analysis: unknown) {
  return generate([{
    text: `À partir de l'analyse vidéo suivante, écris un concept original de remake football (ne copie pas textuellement les phrases).
Réponds en JSON valide avec hook, onScreenText (array), scenes (array d'objets start, end, clip, shot, editingNote), editingScript (array), cta, rationale.
Analyse: ${JSON.stringify(analysis)}`,
  }]);
}
