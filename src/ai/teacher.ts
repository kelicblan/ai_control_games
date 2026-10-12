/**
 * The rules baseline is the exact synthetic-data teacher used by train_policy.py.
 * It is intentionally a capable baseline, not a weakened opponent for the model.
 */
export function teacherScores(f: readonly number[]): { action: number[]; emotion: number[] } {
  const [hunger, energy, health, morale, fear, trust, bravery, diligence, empathy,
    wood, food, fire, danger, time, rain, wind, injured, allyHealth, alliesNeedHelp,
    woodWorkers, foodWorkers, fireWorkers, helpWorkers] = f;
  const fatigue = 1 - energy;
  const hungry = Math.max(0, hunger - 0.35);
  const risk = Math.min(1.5, danger * (1.15 - 0.55 * bravery) + 0.65 * fear * (1 - 0.4 * bravery));
  const late = Math.min(1, Math.max(0, (time - 0.84) / 0.12));
  const weather = Math.max(rain, wind);
  const commandStrength = 3.4 + 2 * trust + 1.2 * diligence
    - 2.5 * Math.max(0, fatigue - 0.5) - 1.3 * fear;

  const action = [
    0.8 + 2.5 * (1 - wood) + 1.1 * diligence + 1.8 * f[31]
      + 1.2 * (1 - fire) * (1 - wood) - 2.8 * hungry - 3.5 * fatigue
      - 4 * risk - 1.2 * injured - 1.8 * woodWorkers - 9 * late,
    0.9 + 3.5 * (1 - food) + diligence + 1.8 * f[32]
      - 2 * hungry - 3 * fatigue - 3.6 * risk - injured - 1.8 * foodWorkers - 9 * late,
    1 + 6 * (1 - fire) * (0.55 + 0.45 * time) + 0.9 * weather + 0.3 * diligence
      - 1.3 * hungry - 1.3 * fatigue - 0.6 * risk - 2 * fireWorkers,
    -1 + 11 * hungry + 1.5 * (1 - health) + 0.5 * food,
    -0.2 + 8.5 * Math.max(0, 0.65 - energy) + 3.5 * (1 - health)
      + 1.5 * injured + Math.max(0, 0.4 - morale) - 0.3 * hunger,
    -0.8 + 4.5 * alliesNeedHelp + 3.8 * (1 - allyHealth) + 2.3 * empathy
      - 2 * fatigue - 2 * risk - hungry - 2.2 * helpWorkers - injured,
    -0.7 + 8.5 * risk + 1.4 * f[33] + 2 * injured * danger
      + 1.8 * f[34] + 1.5 * f[35] + late * (3 + 12 * f[33]),
    0.4 + 2.4 * bravery + energy + 1.1 * (1 - time) + 1.8 * Math.min(wood, food)
      + 0.6 * morale + 0.2 * trust - 4 * risk - 3 * fatigue - 2 * hungry
      - 1.2 * injured - 9 * late,
  ];
  for (let i = 0; i < 8; i += 1) action[i] += f[23 + i] * commandStrength;
  const commandPresent = Math.min(1, f.slice(23, 31).reduce((sum, value) => sum + value, 0));
  const emotion = [
    1.8 + 0.6 * morale - 0.7 * danger - fear - 0.6 * hunger - 0.6 * fatigue,
    -0.5 + 2.6 * morale + 1.2 * trust + 0.6 * food + 0.4 * fire
      - 1.6 * hunger - 1.4 * fatigue - 2 * danger - fear,
    -0.7 + 3.4 * risk + 2 * Math.max(0, hunger - 0.55)
      + 2.3 * Math.max(0, 0.55 - health) + 1.6 * injured + 0.8 * (1 - fire) * late + 0.4 * weather,
    -0.4 + 1.4 * Math.max(0, 0.45 - trust) + 1.4 * Math.max(0, 0.4 - morale)
      + commandPresent * (1 + 1.9 * Math.max(0, 0.5 - trust)
        + 1.6 * Math.max(0, fatigue - 0.4) + 1.7 * Math.max(0, hunger - 0.55)),
    -0.7 + 2.2 * alliesNeedHelp + 1.8 * empathy + 1.2 * (1 - allyHealth)
      - 0.8 * hunger - fatigue - 1.4 * risk - 0.8 * injured,
  ];
  return { action, emotion };
}
