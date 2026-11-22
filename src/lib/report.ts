import type { VideoAnalysis } from "@/lib/types";

export function createVideoReport(title: string, analysis: VideoAnalysis) {
  const scenes = analysis.scenes
    .map((scene, index) => `## SCÈNE ${index + 1}\n\n${scene.start}-${scene.end} sec\n\n${scene.description}\n\n**Objectif :** ${scene.purpose || "Rétention"}\n\n**Transition :** ${scene.transition || "Non spécifiée"}`)
    .join("\n\n");
  return `# VIDEO ANALYSIS\n\n**Vidéo :** ${title}\n\n## HOOK\n\n${analysis.hook}\n\n## STRUCTURE\n\n${analysis.narrativeStructure || "Non déterminée"}\n\n${scenes}\n\n## TEXTES À L'ÉCRAN\n\n${analysis.texts.length ? analysis.texts.map((text) => `- ${text}`).join("\n") : "Aucun texte identifié."}\n\n## CTA\n\n${analysis.cta || "Aucun CTA détecté."}\n\n## STYLE\n\n- **Montage :** ${analysis.editingStyle}\n- **Visuel :** ${analysis.visualStyle}\n- **Musique :** ${analysis.music}\n- **Audience :** ${analysis.targetAudience}\n- **Score viral estimé :** ${analysis.viralScore}/100\n`;
}
