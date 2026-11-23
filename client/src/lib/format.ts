import type { Member } from "../types";

export const genderLabel = (gender: "male" | "female" | null | undefined) => {
  if (gender === "female") return "Mujer";
  if (gender === "male") return "Hombre";
  return "—";
};

export const paymentMethodLabel = (method: string) =>
  method === "transfer" ? "Transferencia" : "Efectivo";

export const money = (cents: number) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(cents / 100);

export const dateOnly = (value: string | null | undefined): string | null => {
  if (value == null || value === "") return null;
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
};

export const date = (value: string | null | undefined) => {
  const iso = dateOnly(value);
  if (!iso) return "—";
  const parsed = new Date(`${iso}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("es-EC");
};

export const todayIso = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** +1 mes calendario (misma regla que el servidor al crear/renovar). */
export const addOneCalendarMonth = (iso: string) => {
  const parsed = dateOnly(iso);
  if (!parsed) return iso;
  const [y, m, d] = parsed.split("-").map(Number);
  const next = new Date(y, m - 1, d);
  next.setMonth(next.getMonth() + 1);
  const yy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

export const membershipPeriodFromToday = () => {
  const start = todayIso();
  return { start, end: addOneCalendarMonth(start) };
};

/** Mes actual en formato YYYY-MM (zona local). */
export const currentYearMonth = () => todayIso().slice(0, 7);

export const monthLabel = (yearMonth: string) => {
  const match = yearMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) return yearMonth;
  const y = Number(match[1]);
  const m = Number(match[2]);
  return new Date(y, m - 1, 1).toLocaleDateString("es-EC", { month: "long", year: "numeric" });
};

export const paymentInMonth = (paymentDate: string, yearMonth: string) =>
  dateOnly(paymentDate)?.slice(0, 7) === yearMonth;

export const membershipDatesVigente = (
  start: string | null | undefined,
  end: string | null | undefined
) => {
  const s = dateOnly(start);
  const e = dateOnly(end);
  if (!s || !e) return false;
  const today = todayIso();
  return s <= today && e >= today;
};

export const membershipVigente = (m: Member) =>
  membershipDatesVigente(m.membership_start, m.membership_end);

/** Sin fila de membresía (p. ej. solo pago por visita) */
export const memberHasMembership = (m: Member) =>
  dateOnly(m.membership_start) != null && dateOnly(m.membership_end) != null;