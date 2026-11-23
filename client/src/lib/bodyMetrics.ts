export type BodyMetricInputs = {
  height_cm: number | null;
  weight_kg: number | null;
  birth_date: string | null;
  neck_cm: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  gender: "male" | "female";
};

export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function computeBmi(heightCm: number, weightKg: number): number {
  const h = heightCm / 100;
  return weightKg / (h * h);
}

export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return "Bajo peso";
  if (bmi < 25) return "Peso normal";
  if (bmi < 30) return "Sobrepeso";
  if (bmi < 35) return "Obesidad grado I";
  if (bmi < 40) return "Obesidad grado II";
  return "Obesidad grado III";
}

function ageFromBirthDate(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const born = new Date(y, m - 1, d);
  if (Number.isNaN(born.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const md = today.getMonth() - born.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < born.getDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

function log10(n: number): number {
  return Math.log10(n);
}

/** Método Marina EE.UU. (circunferencias en cm). */
function bodyFatNavy(
  gender: "male" | "female",
  heightCm: number,
  neckCm: number,
  waistCm: number,
  hipCm: number | null
): number | null {
  const h = heightCm / 2.54;
  const neck = neckCm / 2.54;
  const waist = waistCm / 2.54;
  if (h <= 0 || neck <= 0 || waist <= 0) return null;
  if (gender === "male") {
    const diff = waist - neck;
    if (diff <= 0) return null;
    const bf =
      495 / (1.0324 - 0.19077 * log10(diff) + 0.15456 * log10(h)) - 450;
    return Number.isFinite(bf) ? bf : null;
  }
  const hip = (hipCm ?? 0) / 2.54;
  if (hip <= 0) return null;
  const sum = waist + hip - neck;
  if (sum <= 0) return null;
  const bf =
    495 / (1.29579 - 0.35004 * log10(sum) + 0.221 * log10(h)) - 450;
  return Number.isFinite(bf) ? bf : null;
}

/** Fórmula Deurenberg (requiere edad y IMC). */
function bodyFatDeurenberg(
  bmi: number,
  age: number,
  gender: "male" | "female"
): number {
  const sex = gender === "male" ? 1 : 0;
  return 1.2 * bmi + 0.23 * age - 10.8 * sex - 5.4;
}

export type BodyMetricResult = {
  bmi: number | null;
  bmiLabel: string | null;
  bodyFatPercent: number | null;
  bodyFatMethod: "navy" | "deurenberg" | null;
  age: number | null;
};

export function computeBodyMetrics(input: BodyMetricInputs): BodyMetricResult {
  const height = numOrNull(input.height_cm);
  const weight = numOrNull(input.weight_kg);
  const age =
    input.birth_date != null && input.birth_date !== ""
      ? ageFromBirthDate(input.birth_date)
      : null;

  let bmi: number | null = null;
  let bmiLabel: string | null = null;
  if (height != null && height > 0 && weight != null && weight > 0) {
    bmi = computeBmi(height, weight);
    bmiLabel = bmiCategory(bmi);
  }

  const neck = numOrNull(input.neck_cm);
  const waist = numOrNull(input.waist_cm);
  const hip = numOrNull(input.hip_cm);

  let bodyFatPercent: number | null = null;
  let bodyFatMethod: "navy" | "deurenberg" | null = null;

  if (height != null && neck != null && waist != null) {
    const navy =
      input.gender === "female"
        ? bodyFatNavy(input.gender, height, neck, waist, hip)
        : bodyFatNavy(input.gender, height, neck, waist, null);
    if (navy != null && navy >= 3 && navy <= 65) {
      bodyFatPercent = navy;
      bodyFatMethod = "navy";
    }
  }

  if (bodyFatPercent == null && bmi != null && age != null) {
    const d = bodyFatDeurenberg(bmi, age, input.gender);
    if (Number.isFinite(d) && d >= 3 && d <= 65) {
      bodyFatPercent = d;
      bodyFatMethod = "deurenberg";
    }
  }

  return { bmi, bmiLabel, bodyFatPercent, bodyFatMethod, age };
}

export function formatMetric(value: number | null, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}