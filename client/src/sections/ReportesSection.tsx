import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, Users, Wallet } from "lucide-react";
import { Empty } from "../components/Empty";
import { Stat } from "../components/Stat";
import { apiErrorMessage, readJsonResponse } from "../lib/api";
import { isGymOpenOnDate } from "../lib/gymSchedule";
import { currentYearMonth, date, money, monthLabel } from "../lib/format";
import type { MonthReport } from "../types";

type ReportesSectionProps = {
  onError: (message: string) => void;
};

export function ReportesSection({ onError }: ReportesSectionProps) {
  const [month, setMonth] = useState(currentYearMonth);
  const [report, setReport] = useState<MonthReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    onError("");
    try {
      const response = await fetch(
        `/api/reports/monthly?month=${encodeURIComponent(month)}`
      );
      const json = await readJsonResponse<MonthReport & { error?: string }>(response);
      if (!response.ok) throw new Error(json.error || "No se pudo cargar el reporte.");
      setReport(json);
    } catch (err) {
      onError(apiErrorMessage(err, "No se pudo cargar el reporte."));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [month, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const incomeSplit = useMemo(() => {
    if (!report) return { membershipPct: 0, productPct: 0 };
    const total = report.income.total_cents;
    if (total <= 0) return { membershipPct: 0, productPct: 0 };
    return {
      membershipPct: Math.round((report.income.membership_cents / total) * 100),
      productPct: Math.round((report.income.product_cents / total) * 100),
    };
  }, [report]);

  const maxWeekday = useMemo(
    () =>
      Math.max(
        1,
        ...(report?.attendance.by_weekday
          .filter((w) => !w.closed)
          .map((w) => w.visit_count) ?? [1])
      ),
    [report]
  );

  const maxExercise = useMemo(
    () => Math.max(1, ...(report?.exercises.map((e) => e.count) ?? [1])),
    [report]
  );

  return (
    <section className="panel">
      <div className="panel-heading payments-panel-heading">
        <div>
          <h3>Reportes</h3>
          <p>
            Ingresos del mes sumando membresías/visitas y productos por separado. Más indicadores de
            asistencia, rutinas y socios activos.
          </p>
        </div>
        <label className="month-picker">
          <CalendarDays size={17} />
          <span>Mes</span>
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
        </label>
      </div>

      {loading && !report ? (
        <p className="workout-form-loading">Generando reporte…</p>
      ) : !report ? (
        <Empty text="No hay datos para mostrar." />
      ) : (
        (() => {
          const genderTotal = report.members.total_active;
          const malePct =
            genderTotal > 0 ? Math.round((report.members.male / genderTotal) * 100) : 0;
          const femalePct =
            genderTotal > 0 ? Math.round((report.members.female / genderTotal) * 100) : 0;

          return (
        <>
          <div className="stats-grid payments-summary">
            <Stat
              icon={<Wallet />}
              label="Recaudación total"
              value={money(report.income.total_cents)}
              tone="green"
            />
            <Stat
              icon={<Wallet />}
              label="Membresías y visitas"
              value={money(report.income.membership_cents)}
              tone="blue"
            />
            <Stat
              icon={<BarChart3 />}
              label="Productos"
              value={money(report.income.product_cents)}
              tone="purple"
            />
            <Stat
              icon={<Users />}
              label="Visitas (días abiertos)"
              value={String(report.attendance.total_visits)}
              tone="orange"
            />
          </div>

          {(report.attendance.visits_on_closed_days ?? 0) > 0 && (
            <p className="report-alert">
              Hay <strong>{report.attendance.visits_on_closed_days}</strong> asistencia(s) marcadas en
              domingo (día cerrado), probablemente de pruebas. No cuentan en el gráfico; quítalas en el
              calendario de actividad si no fueron reales.
            </p>
          )}

          <div className="report-block">
            <h4 className="subsection-title">Desglose de ingresos — {monthLabel(month)}</h4>
            <p className="report-split-summary">
              Las tablas de pagos y de productos siguen separadas; aquí solo se comparan montos del
              mes.
            </p>
            <p className="report-split-summary">
              <strong>{incomeSplit.membershipPct}%</strong> membresías / visitas ·{" "}
              <strong>{incomeSplit.productPct}%</strong> productos
            </p>
            <div className="report-bars">
              <div className="report-bar-row">
                <span>Membresías y pagos por día</span>
                <div className="report-bar-track">
                  <div
                    className="report-bar-fill report-bar-fill--membership"
                    style={{ width: `${incomeSplit.membershipPct}%` }}
                  />
                </div>
                <span className="report-bar-amount">{money(report.income.membership_cents)}</span>
              </div>
              <div className="report-bar-row">
                <span>Ventas de productos</span>
                <div className="report-bar-track">
                  <div
                    className="report-bar-fill report-bar-fill--products"
                    style={{ width: `${incomeSplit.productPct}%` }}
                  />
                </div>
                <span className="report-bar-amount">{money(report.income.product_cents)}</span>
              </div>
            </div>
          </div>

          <div className="report-grid">
            <div className="report-block">
              <h4 className="subsection-title">Asistencia por día de la semana</h4>
              <p className="workout-form-hint">
                Total de visitas en <strong>todos los lunes, todos los martes…</strong> del mes (no es un
                solo sábado). {report.attendance.unique_members} socios distintos en el mes. Domingo:
                cerrado.
              </p>
              {report.attendance.by_weekday.some((w) => !w.closed && w.visit_count > 0) ? (
                <ul className="report-rank-list report-rank-list--weekday">
                  {report.attendance.by_weekday.map((w) => (
                    <li key={w.weekday} className={w.closed ? "report-weekday-closed" : undefined}>
                      <div className="report-weekday-label">
                        <span>{w.label}</span>
                        {!w.closed && w.dates && w.dates.length > 0 && (
                          <small>
                            {w.dates
                              .filter((d) => d.visit_count > 0 && isGymOpenOnDate(d.date))
                              .map((d) => `${date(d.date)}: ${d.visit_count}`)
                              .join(" · ")}
                          </small>
                        )}
                      </div>
                      {!w.closed ? (
                        <>
                          <div className="report-bar-track report-bar-track--inline">
                            <div
                              className="report-bar-fill report-bar-fill--weekday"
                              style={{
                                width: `${Math.round((w.visit_count / maxWeekday) * 100)}%`,
                              }}
                            />
                          </div>
                          <strong>{w.visit_count}</strong>
                        </>
                      ) : (
                        <span className="workout-form-hint">—</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="workout-form-hint">Sin visitas en días abiertos este mes.</p>
              )}
            </div>

            <div className="report-block">
              <h4 className="subsection-title">Grupos musculares más trabajados</h4>
              {report.exercises.length ? (
                <ul className="report-rank-list">
                  {report.exercises.map((ex) => (
                    <li key={ex.key}>
                      <span>{ex.label}</span>
                      <div className="report-bar-track report-bar-track--inline">
                        <div
                          className="report-bar-fill report-bar-fill--exercise"
                          style={{ width: `${Math.round((ex.count / maxExercise) * 100)}%` }}
                        />
                      </div>
                      <strong>{ex.count}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="workout-form-hint">Aún no hay rutinas guardadas en este mes.</p>
              )}
            </div>
          </div>

          <div className="report-block">
            <h4 className="subsection-title">Socios activos por género</h4>
            <p className="workout-form-hint">
              Total con estado activo: <strong>{genderTotal}</strong> (global, no solo del mes).
            </p>
            <div className="report-bars">
              <div className="report-bar-row">
                <span>Hombres</span>
                <div className="report-bar-track">
                  <div
                    className="report-bar-fill report-bar-fill--male"
                    style={{ width: `${malePct}%` }}
                  />
                </div>
                <span className="report-bar-amount">
                  {report.members.male} ({malePct}%)
                </span>
              </div>
              <div className="report-bar-row">
                <span>Mujeres</span>
                <div className="report-bar-track">
                  <div
                    className="report-bar-fill report-bar-fill--female"
                    style={{ width: `${femalePct}%` }}
                  />
                </div>
                <span className="report-bar-amount">
                  {report.members.female} ({femalePct}%)
                </span>
              </div>
            </div>
          </div>

          <div className="report-block">
            <h4 className="subsection-title">Visitas por fecha</h4>
            {report.attendance.by_date.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th className="right">Asistencias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.attendance.by_date.map((row) => (
                      <tr key={row.date}>
                        <td>{date(row.date)}</td>
                        <td className="right">{row.visit_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="workout-form-hint">No hay días con asistencia marcada en este mes.</p>
            )}
          </div>
        </>
          );
        })()
      )}
    </section>
  );
}