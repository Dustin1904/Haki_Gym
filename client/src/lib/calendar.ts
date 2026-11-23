import { isGymOpenOnDate } from "./gymSchedule";
import { todayIso } from "./format";

export type CalendarCell = {
  date: string;
  day: number;
  inMonth: boolean;
  visited: boolean;
  isToday: boolean;
  isFuture: boolean;
  /** Día cubierto por membresía o pago por visita en este mes */
  isEligible: boolean;
  canToggle: boolean;
};

const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

export function weekdayHeaders() {
  return WEEKDAYS;
}

export function shiftYearMonth(yearMonth: string, delta: number) {
  const match = yearMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) return yearMonth;
  const d = new Date(Number(match[1]), Number(match[2]) - 1 + delta, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function buildMonthGrid(
  yearMonth: string,
  visitedDates: string[],
  eligibleDates: string[] = []
): CalendarCell[] {
  const match = yearMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) return [];
  const year = Number(match[1]);
  const month = Number(match[2]);
  const visited = new Set(visitedDates.map((d) => d.slice(0, 10)));
  const eligible = new Set(eligibleDates.map((d) => d.slice(0, 10)));
  const today = todayIso();

  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startPad = (first.getDay() + 6) % 7;

  const cells: CalendarCell[] = [];

  for (let i = 0; i < startPad; i++) {
    cells.push({
      date: "",
      day: 0,
      inMonth: false,
      visited: false,
      isToday: false,
      isFuture: false,
      isEligible: false,
      canToggle: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isFuture = date > today;
    const isToday = date === today;
    const gymOpen = isGymOpenOnDate(date);
    const isEligible = eligible.has(date) && gymOpen;
    cells.push({
      date,
      day,
      inMonth: true,
      visited: visited.has(date),
      isToday,
      isFuture,
      isEligible,
      canToggle: isEligible && !isFuture && gymOpen,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      date: "",
      day: 0,
      inMonth: false,
      visited: false,
      isToday: false,
      isFuture: false,
      isEligible: false,
      canToggle: false,
    });
  }

  return cells;
}

export function monthStats(cells: CalendarCell[]) {
  const eligibleInMonth = cells.filter((c) => c.inMonth && c.isEligible);
  const visited = eligibleInMonth.filter((c) => c.visited).length;
  const elapsed = eligibleInMonth.filter((c) => !c.isFuture).length;
  const missed = eligibleInMonth.filter((c) => !c.isFuture && !c.visited).length;
  return { visited, missed, elapsed, total: eligibleInMonth.length };
}