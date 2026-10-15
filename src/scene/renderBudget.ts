/** Keep a large desktop's 3D buffer near native HD rather than multiplying it by
 * the monitor DPI. HTML controls remain at the screen's full resolution. */
export function scenePixelRatio(width: number, height: number, deviceRatio: number): number {
  return Math.min(deviceRatio > 0 && Number.isFinite(deviceRatio) ? deviceRatio : 1,
    1.5, Math.sqrt(1_800_000 / (Math.max(1, width) * Math.max(1, height))));
}

/** Slow adjustments after warm-up; retain at least 65% of the base linear
 * resolution and recover gradually when the GPU has sustained headroom. */
export function nextSceneQuality(current:number,fps:number):number {
  if(fps<26)return Math.max(.65,current*.85);
  if(fps>52)return Math.min(1,current+.05);
  return current;
}
