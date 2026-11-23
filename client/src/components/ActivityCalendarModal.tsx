import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { buildMonthGrid, monthStats, shiftYearMonth, weekdayHeaders } from "../lib/calendar";
import { apiErrorMessage, readJsonResponse } from "../lib/api";
import { currentYearMonth, date, monthLabel } from "../lib/format";
import { WorkoutDayForm } from "./WorkoutDayForm";
import type { AttendanceCalendar } from "../types";

type ActivityCalendarModalProps = {
  memberId: number;
  memberName: string;
  onClose: () => void;
  onError: (message: string) => void;
  onWorkoutsChanged?: () => void;
};

export function ActivityCalendarModal({
  memberId,
  memberName,
  onClose,
  onError,
  onWorkoutsChanged,
}: ActivityCalendarModalProps) {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [data, setData] = useState<AttendanceCalendar | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    onError("");
    try {
      const response = await fetch(
        `/api/members/${memberId}/attendance-calendar?month=${encodeURIComponent(yearMonth)}`
      );
      const json = await readJsonResponse<AttendanceCalendar & { error?: string }>(response);
      if (!response.ok) throw new Error(json.error || "No se pudo cargar el calendario.");
      setData(json);
      setSelectedDate((prev) =>
        prev && json.visited_dates?.includes(prev) ? prev : null
      );
    } catch (err) {
      onError(apiErrorMessage(err, "No se pudo cargar el calendario."));
    } finally {
      setLoading(false);
    }
  }, [memberId, yearMonth, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const cells = useMemo(
    () => buildMonthGrid(yearMonth, data?.visited_dates ?? [], data?.eligible_dates ?? []),
    [yearMonth, data?.visited_dates, data?.eligible_dates]
  );
  const stats = useMemo(() => monthStats(cells), [cells]);

  async function toggleDay(date: string, visited: boolean, clearSelection = true) {
    setToggling(date);
    onError("");
    try {
      const response = await fetch(`/api/members/${memberId}/attendance-day`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, visited: !visited }),
      });
      const json = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(json.error || "No se pudo actualizar el día.");
      if (visited && clearSelection) {
        setSelectedDate((s) => (s === date ? null : s));
      }
      setData((prev) => {
        if (!prev) return prev;
        const set = new Set(prev.visited_dates);
        if (!visited) set.add(date);
        else {
          set.delete(date);
          const nextWorkouts = { ...(prev.workouts_by_date ?? {}) };
          delete nextWorkouts[date];
          const visited_dates = [...set].sort();
          return {
            ...prev,
            visited_dates,
            visit_count: visited_dates.length,
            workouts_by_date: nextWorkouts,
          };
        }
        const visited_dates = [...set].sort();
        return { ...prev, visited_dates, visit_count: visited_dates.length };
      });
      if (!visited) onWorkoutsChanged?.();
    } catch (err) {
      onError(apiErrorMessage(err, "No se pudo actualizar el día."));
    } finally {
      setToggling(null);
    }
  }

  function handleDayClick(cellDate: string, visited: boolean, canToggle: boolean) {
    if (!canToggle) return;
    if (visited) {
      setSelectedDate(cellDate);
      return;
    }
    setSelectedDate(null);
    void toggleDay(cellDate, false);
  }

  function hasWorkout(date: string) {
    const list = data?.workouts_by_date?.[date];
    return Boolean(list?.length);
  }

  async function reloadAfterWorkout() {
    await load();
    onWorkoutsChanged?.();
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel modal-panel-wide"
        role="dialog"
        aria-labelledby="activity-cal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h3 id="activity-cal-title">
              <CalendarDays size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />
              Días de actividad — {memberName}
            </h3>
            <p>
              Clic en día sin visita: marcar asistencia. Clic en día <strong>con visita</strong>: registrar
              ejercicios abajo. Los futuros se habilitan cuando llegue la fecha.
            </p>
          </div>
          <button type="button" className="icon-button" title="Cerrar" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="activity-cal-toolbar">
          <button
            type="button"
            className="icon-button"
            title="Mes anterior"
            onClick={() => setYearMonth((ym) => shiftYearMonth(ym, -1))}
          >
            <ChevronLeft size={20} />
          </button>
          <strong className="activity-cal-month">{monthLabel(yearMonth)}</strong>
          <button
            type="button"
            className="icon-button"
            title="Mes siguiente"
            onClick={() => setYearMonth((ym) => shiftYearMonth(ym, +1))}
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {data?.coverage?.length ? (
          <ul className="activity-cal-coverage">
            {data.coverage.map((c, i) => (
              <li key={`${c.kind}-${c.start}-${i}`}>
                <span className="pill">{c.label}</span>
                {c.end
                  ? `${date(c.start)} – ${date(c.end)}`
                  : date(c.start)}
              </li>
            ))}
          </ul>
        ) : (
          !loading && (
            <p className="activity-cal-no-coverage">
              Sin membresía ni pago por día en este mes calendario.
            </p>
          )
        )}

        <div className="activity-cal-legend">
          <span>
            <i className="cal-legend-dot visited" /> Vino
          </span>
          <span>
            <i className="cal-legend-dot workout" /> Con rutina
          </span>
          <span>
            <i className="cal-legend-dot missed" /> No vino (día activo)
          </span>
          <span>
            <i className="cal-legend-dot inactive" /> Sin cobertura
          </span>
          <span>
            <i className="cal-legend-dot future" /> Futuro
          </span>
        </div>

        <div className="activity-cal-summary">
          <span>
            <strong>{stats.visited}</strong> días con visita
          </span>
          <span>
            <strong>{stats.missed}</strong> sin visita (días activos hasta hoy)
          </span>
          <span>
            <strong>{stats.elapsed}</strong> días activos en el mes
          </span>
        </div>

        {loading && !data ? (
          <p className="activity-cal-loading">Cargando…</p>
        ) : (
          <div className={`activity-calendar${loading ? " is-loading" : ""}`}>
            <div className="activity-cal-weekdays">
              {weekdayHeaders().map((wd) => (
                <span key={wd}>{wd}</span>
              ))}
            </div>
            <div className="activity-cal-grid">
              {cells.map((cell, i) =>
                !cell.inMonth ? (
                  <span key={`pad-${i}`} className="cal-day cal-day--pad" />
                ) : (
                  <button
                    key={cell.date}
                    type="button"
                    disabled={!cell.canToggle || toggling === cell.date}
                    className={[
                      "cal-day",
                      !cell.isEligible ? "cal-day--inactive" : cell.visited ? "cal-day--visited" : "cal-day--missed",
                      cell.isToday ? "cal-day--today" : "",
                      cell.isFuture ? "cal-day--future" : "",
                      cell.visited && selectedDate === cell.date ? "cal-day--selected" : "",
                      cell.visited && hasWorkout(cell.date) ? "cal-day--workout" : "",
                      toggling === cell.date ? "cal-day--loading" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    title={
                      !cell.isEligible
                        ? "Sin membresía ni pago por visita ese día"
                        : cell.isFuture
                          ? "Día futuro"
                          : cell.visited
                            ? "Vino — clic para rutina de ejercicios"
                            : "Sin visita — clic para marcar"
                    }
                    onClick={() => handleDayClick(cell.date, cell.visited, cell.canToggle)}
                  >
                    {cell.day}
                    {cell.visited && hasWorkout(cell.date) ? (
                      <i className="cal-day-workout-dot" aria-hidden />
                    ) : null}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {selectedDate && data?.visited_dates.includes(selectedDate) ? (
          <div className="activity-cal-workout">
            <WorkoutDayForm
              memberId={memberId}
              visitDate={selectedDate}
              onError={onError}
              onSaved={() => void reloadAfterWorkout()}
            />
            <button
              type="button"
              className="text-button activity-cal-remove-visit"
              onClick={() => void toggleDay(selectedDate, true)}
            >
              Quitar asistencia de este día
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}