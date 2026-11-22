export type Scene = {
  start: string;
  end: string;
  description: string;
  purpose?: string;
  transition?: string;
};

export type VideoAnalysis = {
  hook: string;
  patternInterrupt?: string;
  narrativeStructure?: string;
  scenes: Scene[];
  texts: string[];
  cta: string;
  emojis: string[];
  editingStyle: string;
  visualStyle: string;
  soundEffects?: string[];
  music: string;
  targetAudience: string;
  improvementTips: string[];
  viralScore: number;
};

export type VideoRecord = {
  id: string;
  title: string;
  storage_path: string;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  thumbnail_paths?: string[] | null;
  status: "uploaded" | "processing" | "completed" | "failed";
  created_at: string;
};

export type AnalysisRecord = {
  id: string;
  video_id: string;
  result: VideoAnalysis;
  created_at: string;
};
