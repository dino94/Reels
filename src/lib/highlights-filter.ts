/** Construit le filtre ffmpeg qui assemble les passages avec fond flouté, fondu et fondu audio. */
export function buildHighlightsFilter(
  clips: Array<{ start: number; end: number }>,
  dimensions: { width: number; height: number },
) {
  const durations = clips.map((clip) => clip.end - clip.start);
  const transitions = durations.slice(1).map((duration, index) =>
    Math.min(0.5, durations[index], duration),
  );
  const filters: string[] = [];
  if (clips.length > 1) {
    filters.push(`[0:v:0]split=${clips.length}${clips.map((_, index) => `[vsrc${index}]`).join("")}`);
    filters.push(`[0:a:0]asplit=${clips.length}${clips.map((_, index) => `[asrc${index}]`).join("")}`);
  }
  clips.forEach((clip, index) => {
    const videoInput = clips.length > 1 ? `[vsrc${index}]` : "[0:v:0]";
    const audioInput = clips.length > 1 ? `[asrc${index}]` : "[0:a:0]";
    filters.push(
      `${videoInput}trim=start=${clip.start.toFixed(3)}:end=${clip.end.toFixed(3)},setpts=PTS-STARTPTS,fps=30,setpts=N/(30*TB),split=2[backgroundsrc${index}][foregroundsrc${index}]`,
    );
    filters.push(
      `[backgroundsrc${index}]scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=increase,crop=${dimensions.width}:${dimensions.height},boxblur=24:12,setsar=1[background${index}]`,
    );
    filters.push(
      `[foregroundsrc${index}]scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease,setsar=1[foreground${index}]`,
    );
    filters.push(
      `[background${index}][foreground${index}]overlay=(W-w)/2:(H-h)/2,format=yuv420p,settb=AVTB[v${index}]`,
    );
    filters.push(
      `${audioInput}atrim=start=${clip.start.toFixed(3)}:end=${clip.end.toFixed(3)},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=N/SR/TB[a${index}]`,
    );
  });

  let videoLabel = "[v0]";
  let audioLabel = "[a0]";
  let assembledDuration = durations[0];
  for (let index = 1; index < clips.length; index++) {
    const transitionDuration = transitions[index - 1];
    const offset = Math.max(0, assembledDuration - transitionDuration);
    const nextVideoLabel = `[vx${index}]`;
    const nextAudioLabel = `[ax${index}]`;
    filters.push(
      `${videoLabel}[v${index}]xfade=transition=fade:duration=${transitionDuration.toFixed(3)}:offset=${offset.toFixed(3)}${nextVideoLabel}`,
    );
    filters.push(
      `${audioLabel}[a${index}]acrossfade=d=${transitionDuration.toFixed(3)}:c1=tri:c2=tri${nextAudioLabel}`,
    );
    videoLabel = nextVideoLabel;
    audioLabel = nextAudioLabel;
    assembledDuration += durations[index] - transitionDuration;
  }
  filters.push(`${videoLabel}null[vout]`);
  filters.push(`${audioLabel}apad[aout]`);
  return { filter: filters.join(";"), assembledDuration };
}
