import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage, readJsonResponse } from "../lib/api";
import { EXERCISE_CATALOG } from "../lib/exercises";
import { date } from "../lib/format";

type WorkoutDayFormProps = {
  memberId: number;
  visitDate: string;
  compact?: boolean;
  onError: (message: string) => void;
  onSaved?: () => void;
};

export function WorkoutDayForm({
  memberId,
  visitDate,
  compact,
  onError,
  onSaved,
}: WorkoutDayFormProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [noAttendance, setNoAttendance] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    onError("");
    setNoAttendance(false);
    try {
      const response = await fetch(
        `/api/members/${memberId}/visit-exercises?date=${encodeURIComponent(visitDate)}`
      );
      const json = await readJsonResponse<{
        exercises?: string[];
        attended?: boolean;
        error?: string;
      }>(response);
      if (!response.ok) throw new Error(json.error || "No se pudo cargar la rutina.");
      if (json.attended === false) {
        setNoAttendance(true);
        setSelected(new Set());
        return;
      }
      setSelected(new Set(json.exercises ?? []));
    } catch (err) {
      onError(apiErrorMessage(err, "No se pudo cargar la rutina."));
    } finally {
      setLoading(false);
    }
  }, [memberId, visitDate, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    onError("");
    try {
      const response = await fetch(`/api/members/${memberId}/visit-exercises`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: visitDate, exercises: [...selected] }),
      });
      const json = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(json.error || "No se pudo guardar.");
      onSaved?.();
    } catch (err) {
      onError(apiErrorMessage(err, "No se pudo guardar la rutina."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="workout-form-loading">Cargando rutina…</p>;
  }

  if (noAttendance) {
    return (
      <p className="workout-form-hint">
        No hay asistencia marcada para el <strong>{date(visitDate)}</strong>. Márcala primero en el
        calendario de actividad.
      </p>
    );
  }

  return (
    <div className={`workout-day-form${compact ? " workout-day-form--compact" : ""}`}>
      {!compact && (
        <p className="workout-form-date">
          Rutina del <strong>{date(visitDate)}</strong>
        </p>
      )}
      <div className="exercise-chips" role="group" aria-label="Grupos musculares">
        {EXERCISE_CATALOG.map((ex) => {
          const on = selected.has(ex.key);
          return (
            <button
              key={ex.key}
              type="button"
              className={`exercise-chip${on ? " exercise-chip--on" : ""}`}
              aria-pressed={on}
              onClick={() => toggle(ex.key)}
            >
              {ex.label}
            </button>
          );
        })}
      </div>
      <div className="workout-form-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={() => void save()}>
          {busy ? "Guardando…" : "Guardar rutina"}
        </button>
      </div>
    </div>
  );
}