import { useEffect, useState } from "react";
import { Dumbbell, X } from "lucide-react";
import { readJsonResponse } from "../lib/api";
import { currentYearMonth } from "../lib/format";
import { WorkoutDayForm } from "./WorkoutDayForm";

type WorkoutLogModalProps = {
  memberId: number;
  memberName: string;
  initialDate?: string;
  onClose: () => void;
  onError: (message: string) => void;
  onSaved?: () => void;
};

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function WorkoutLogModal({
  memberId,
  memberName,
  initialDate,
  onClose,
  onError,
  onSaved,
}: WorkoutLogModalProps) {
  const [visitDate, setVisitDate] = useState(initialDate ?? todayIso());
  const [visitedOptions, setVisitedOptions] = useState<string[]>([]);

  useEffect(() => {
    const ym = visitDate.slice(0, 7) || currentYearMonth();
    void (async () => {
      try {
        const response = await fetch(
          `/api/members/${memberId}/attendance-calendar?month=${encodeURIComponent(ym)}`
        );
        const json = await readJsonResponse<{ visited_dates?: string[]; error?: string }>(response);
        if (response.ok) setVisitedOptions(json.visited_dates ?? []);
      } catch {
        setVisitedOptions([]);
      }
    })();
  }, [memberId, visitDate]);

  useEffect(() => {
    if (!visitedOptions.length) return;
    if (initialDate && visitedOptions.includes(initialDate)) {
      setVisitDate(initialDate);
      return;
    }
    if (!visitedOptions.includes(visitDate)) {
      const fallback = visitedOptions.includes(todayIso())
        ? todayIso()
        : visitedOptions[visitedOptions.length - 1];
      if (fallback) setVisitDate(fallback);
    }
  }, [visitedOptions, visitDate, initialDate]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-labelledby="workout-log-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h3 id="workout-log-title">
              <Dumbbell size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />
              Ejercicios — {memberName}
            </h3>
            <p>Registra qué trabajó en un día en que asistió al gym.</p>
          </div>
          <button type="button" className="icon-button" title="Cerrar" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <label className="workout-date-picker">
          Día de asistencia
          <select
            value={visitedOptions.includes(visitDate) ? visitDate : ""}
            onChange={(e) => setVisitDate(e.target.value)}
          >
            {visitedOptions.length === 0 && <option value="">Sin visitas este mes</option>}
            {visitedOptions.map((d) => (
              <option key={d} value={d}>
                {d.split("-").reverse().join("/")}
              </option>
            ))}
          </select>
        </label>

        {visitedOptions.length > 0 ? (
          <WorkoutDayForm
            memberId={memberId}
            visitDate={visitDate}
            onError={onError}
            onSaved={onSaved}
          />
        ) : (
          <p className="workout-form-hint">
            Este usuario no tiene días marcados en el mes actual. Abre «Días de actividad» y marca la
            visita primero.
          </p>
        )}
      </div>
    </div>
  );
}