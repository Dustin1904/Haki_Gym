import { useCallback, useEffect, useState } from "react";
import { Dumbbell } from "lucide-react";
import { apiErrorMessage, readJsonResponse } from "../lib/api";
import { exerciseLabels } from "../lib/exercises";
import { date } from "../lib/format";
import type { TodayVisitWorkoutRow } from "../types";

type TodayWorkoutsPanelProps = {
  onOpenMember: (memberId: number, memberName: string, visitDate?: string) => void;
  onError: (message: string) => void;
  refreshKey?: number;
};

type TodayPayload = {
  date: string;
  rows: TodayVisitWorkoutRow[];
};

export function TodayWorkoutsPanel({
  onOpenMember,
  onError,
  refreshKey = 0,
}: TodayWorkoutsPanelProps) {
  const [data, setData] = useState<TodayPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/attendance/today-workouts");
      const json = await readJsonResponse<TodayPayload & { error?: string }>(response);
      if (!response.ok) throw new Error(json.error || "No se pudo cargar el resumen de hoy.");
      setData(json);
    } catch (err) {
      onError(apiErrorMessage(err, "No se pudo cargar el resumen de hoy."));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div className="today-workouts-panel">
      <header className="today-workouts-heading">
        <span className="today-workouts-icon" aria-hidden>
          <Dumbbell size={18} />
        </span>
        <div>
          <h4>Rutinas de hoy</h4>
          <p>
            {data
              ? `Asistencia del ${date(data.date)}. Marca ejercicios para quien ya vino.`
              : "Quienes tienen visita registrada hoy."}
          </p>
        </div>
      </header>

      {loading && !data ? (
        <p className="workout-form-loading">Cargando…</p>
      ) : !data?.rows.length ? (
        <p className="workout-form-hint">
          Nadie con visita marcada hoy. Usa «Días de actividad» en la tabla o el lector de huellas
          cuando lo tengas.
        </p>
      ) : (
        <ul className="today-workouts-list">
          {data.rows.map((row) => (
            <li key={row.member_id}>
              <div className="today-workout-main">
                <span className="member-name">{row.member_name}</span>
                {row.exercises.length ? (
                  <span className="today-workout-tags">
                    {exerciseLabels(row.exercises).join(" · ")}
                  </span>
                ) : (
                  <span className="today-workout-empty">Sin rutina registrada</span>
                )}
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onOpenMember(row.member_id, row.member_name, data?.date)}
              >
                {row.exercises.length ? "Editar" : "Registrar"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}