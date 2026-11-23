/** Días ISO (1=lunes … 7=domingo) en que el gimnasio no abre. */
export const GYM_CLOSED_ISO_DOW = new Set<number>([7]);

export function isoDowFromIsoDate(isoDate: string): number | null {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  const js = dt.getDay();
  return js === 0 ? 7 : js;
}

export function isGymOpenOnDate(isoDate: string): boolean {
  const dow = isoDowFromIsoDate(isoDate);
  if (dow == null) return false;
  return !GYM_CLOSED_ISO_DOW.has(dow);
}