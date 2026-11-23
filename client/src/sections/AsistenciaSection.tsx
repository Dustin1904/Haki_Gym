import { useState } from "react";
import { CalendarDays, Dumbbell, History, Search, X } from "lucide-react";
import { ActivityCalendarModal } from "../components/ActivityCalendarModal";
import { TodayWorkoutsPanel } from "../components/TodayWorkoutsPanel";
import { WorkoutLogModal } from "../components/WorkoutLogModal";
import { Empty } from "../components/Empty";
import { formatCompanionCell } from "../lib/companions";
import {
  date,
  membershipDatesVigente,
  money,
  paymentMethodLabel,
} from "../lib/format";
import type { AttendanceHistory, AttendanceSummaryRow } from "../types";

type AsistenciaSectionProps = {
  summary: AttendanceSummaryRow[];
  search: string;
  onSearchChange: (value: string) => void;
  onError: (message: string) => void;
};

export function AsistenciaSection({
  summary,
  search,
  onSearchChange,
  onError,
}: AsistenciaSectionProps) {
  const [historyOpen, setHistoryOpen] = useState<AttendanceHistory | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [activityFor, setActivityFor] = useState<{ id: number; name: string } | null>(null);
  const [workoutFor, setWorkoutFor] = useState<{ id: number; name: string; date?: string } | null>(
    null
  );
  const [workoutRefresh, setWorkoutRefresh] = useState(0);

  function bumpWorkoutRefresh() {
    setWorkoutRefresh((n) => n + 1);
  }

  function openWorkout(memberId: number, memberName: string, visitDate?: string) {
    setWorkoutFor({ id: memberId, name: memberName, date: visitDate });
  }


  const q = search.toLowerCase().trim();
  const filtered = summary.filter((row) => row.member_name.toLowerCase().includes(q));

  async function openHistory(memberId: number) {
    setHistoryBusy(true);
    onError("");
    try {
      const response = await fetch(`/api/members/${memberId}/attendance-history`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo cargar el historial.");
      setHistoryOpen(data as AttendanceHistory);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setHistoryBusy(false);
    }
  }

  function currentPeriodLabel(row: AttendanceSummaryRow) {
    if (row.current_kind === "membership" && row.current_start && row.current_end) {
      return `${date(row.current_start)} – ${date(row.current_end)}`;
    }
    if (row.current_start) {
      return `Visita: ${date(row.current_start)}`;
    }
    return "—";
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>Asistencia e historial</h3>
          <p>
            Período actual por usuario. «Rutinas de hoy» para ejercicios del día; calendario para marcar
            visitas.
          </p>
        </div>
      </div>

      <TodayWorkoutsPanel
        refreshKey={workoutRefresh}
        onError={onError}
        onOpenMember={(id, name, date) => openWorkout(id, name, date)}
      />

      <div className="search-box">
        <Search size={17} />
        <input
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {filtered.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Tipo actual</th>
                <th>Período actual</th>
                <th className="right">Precio actual</th>
                <th>Acompañantes</th>
                <th>Registros</th>
                <th className="right">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const vigente =
                  row.current_kind === "membership" &&
                  membershipDatesVigente(row.current_start, row.current_end);
                return (
                  <tr key={row.member_id}>
                    <td className="member-name">{row.member_name}</td>
                    <td>
                      <span className="pill">
                        {row.current_kind === "membership" ? "Membresía" : "Pago por día"}
                      </span>
                    </td>
                    <td>
                      {currentPeriodLabel(row)}
                      {row.current_kind === "membership" && (
                        <span
                          className={`status-pill ${vigente ? "active" : "inactive"}`}
                          style={{ marginLeft: 8 }}
                        >
                          {vigente ? "Vigente" : "Vencida"}
                        </span>
                      )}
                    </td>
                    <td className="right amount">
                      {row.current_price_cents != null
                        ? money(row.current_price_cents)
                        : "—"}
                    </td>
                    <td className="companions-cell">
                      {row.current_kind === "membership"
                        ? formatCompanionCell(row.companion_count ?? 0, row.companion_names)
                        : "—"}
                    </td>
                    <td>{row.history_count}</td>
                    <td className="right table-actions table-actions-stack">
                      <button
                        type="button"
                        className="secondary-button table-action-btn"
                        disabled={historyBusy}
                        onClick={() => void openHistory(row.member_id)}
                      >
                        <History size={15} />
                        Ver historial
                      </button>
                      <button
                        type="button"
                        className="secondary-button table-action-btn"
                        onClick={() => openWorkout(row.member_id, row.member_name)}
                      >
                        <Dumbbell size={15} />
                        Ejercicios
                      </button>
                      <button
                        type="button"
                        className="secondary-button table-action-btn"
                        onClick={() =>
                          setActivityFor({ id: row.member_id, name: row.member_name })
                        }
                      >
                        <CalendarDays size={15} />
                        Días de actividad
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          text={
            search
              ? "No hay usuarios con ese criterio."
              : "Aún no hay registros de membresía o visitas."
          }
        />
      )}

      {activityFor && (
        <ActivityCalendarModal
          memberId={activityFor.id}
          memberName={activityFor.name}
          onClose={() => setActivityFor(null)}
          onError={onError}
          onWorkoutsChanged={bumpWorkoutRefresh}
        />
      )}

      {workoutFor && (
        <WorkoutLogModal
          memberId={workoutFor.id}
          memberName={workoutFor.name}
          initialDate={workoutFor.date}
          onClose={() => setWorkoutFor(null)}
          onError={onError}
          onSaved={() => {
            bumpWorkoutRefresh();
            setWorkoutFor(null);
          }}
        />
      )}

      {historyOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setHistoryOpen(null)}>
          <div
            className="modal-panel"
            role="dialog"
            aria-labelledby="history-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <h3 id="history-title">Historial — {historyOpen.member_name}</h3>
                <p>Todos los períodos y pagos por día, del más antiguo al más reciente.</p>
              </div>
              <button
                type="button"
                className="icon-button"
                title="Cerrar"
                onClick={() => setHistoryOpen(null)}
              >
                <X size={18} />
              </button>
            </header>

            {historyOpen.events.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Período / fecha</th>
                      <th>Acompañantes</th>
                      <th>Método</th>
                      <th className="right">Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyOpen.events.map((ev, idx) => (
                      <tr key={`${ev.kind}-${ev.start_date}-${idx}`}>
                        <td>
                          <span className="pill">{ev.label}</span>
                        </td>
                        <td>
                          {ev.kind === "membership" && ev.end_date
                            ? `${date(ev.start_date)} – ${date(ev.end_date)}`
                            : date(ev.start_date)}
                        </td>
                        <td className="companions-cell">
                          {ev.kind === "membership"
                            ? formatCompanionCell(ev.companion_count ?? 0, ev.companion_names)
                            : "—"}
                        </td>
                        <td>{paymentMethodLabel(ev.method)}</td>
                        <td className="right amount">{money(ev.price_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty text="Sin eventos en el historial." />
            )}
          </div>
        </div>
      )}
    </section>
  );
}