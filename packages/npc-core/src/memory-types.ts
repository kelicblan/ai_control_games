export const EXPERIENCE_CATEGORIES = ['action', 'body', 'dialogue', 'self', 'social', 'intent'] as const;
export interface Experience {
  eventId: string; sequence: number; at: number; npcId: string;
  category: typeof EXPERIENCE_CATEGORIES[number]; actorId: string; audience: string[];
  fact: string; interpretation: string; evidenceIds: string[];
  source: 'experienced' | 'heard' | 'self'; salience: number;
}
export interface MemoryState { watermark: number; recent: Experience[] }
export interface MemorySummary { npcId: string; through: number; text: string; evidenceIds: string[]; version: 1 }
