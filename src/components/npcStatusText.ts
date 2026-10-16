/** Format recorded body measurements for display without changing saved evidence. */
export function npcStatusText(text: string): string {
  return text.replace(/(精力|饥饿|健康)(\s*(?:[：:为]\s*)?)(-?\d+\.\d+)/g,
    (_match, label: string, separator: string, value: string) => `${label}${separator}${Math.round(Number(value))}`);
}
