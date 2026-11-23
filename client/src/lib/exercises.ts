export const EXERCISE_CATALOG = [
  { key: "biceps", label: "Bíceps" },
  { key: "triceps", label: "Tríceps" },
  { key: "piernas", label: "Piernas" },
  { key: "pecho", label: "Pecho" },
  { key: "espalda", label: "Espalda" },
  { key: "hombros", label: "Hombros" },
  { key: "abdomen", label: "Abdomen" },
  { key: "gluteos", label: "Glúteos" },
  { key: "antebrazos", label: "Antebrazos" },
  { key: "cardio", label: "Cardio" },
] as const;

export type ExerciseKey = (typeof EXERCISE_CATALOG)[number]["key"];

const labelByKey = new Map(EXERCISE_CATALOG.map((e) => [e.key, e.label]));

export function exerciseLabel(key: string): string {
  return labelByKey.get(key as ExerciseKey) ?? key;
}

export function exerciseLabels(keys: string[]): string[] {
  return keys.map(exerciseLabel);
}