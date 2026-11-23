import { useMemo, useState } from "react";
import { Scale, X } from "lucide-react";
import { computeBodyMetrics, formatMetric, type BodyMetricInputs } from "../lib/bodyMetrics";
import type { Member } from "../types";

type BodyMetricsModalProps = {
  member: Member;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
};

type FormState = {
  height_cm: string;
  weight_kg: string;
  birth_date: string;
  neck_cm: string;
  waist_cm: string;
  hip_cm: string;
};

function toForm(m: Member): FormState {
  return {
    height_cm: m.height_cm != null ? String(m.height_cm) : "",
    weight_kg: m.weight_kg != null ? String(m.weight_kg) : "",
    birth_date: m.birth_date ?? "",
    neck_cm: m.neck_cm != null ? String(m.neck_cm) : "",
    waist_cm: m.waist_cm != null ? String(m.waist_cm) : "",
    hip_cm: m.hip_cm != null ? String(m.hip_cm) : "",
  };
}

function payloadFromForm(form: FormState) {
  const emptyToNull = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    height_cm: form.height_cm.trim() === "" ? null : Number(form.height_cm),
    weight_kg: form.weight_kg.trim() === "" ? null : Number(form.weight_kg),
    birth_date: emptyToNull(form.birth_date),
    neck_cm: form.neck_cm.trim() === "" ? null : Number(form.neck_cm),
    waist_cm: form.waist_cm.trim() === "" ? null : Number(form.waist_cm),
    hip_cm: form.hip_cm.trim() === "" ? null : Number(form.hip_cm),
  };
}

export function BodyMetricsModal({
  member,
  onClose,
  onSaved,
  onError,
}: BodyMetricsModalProps) {
  const [form, setForm] = useState<FormState>(() => toForm(member));
  const [busy, setBusy] = useState(false);

  const preview = useMemo((): BodyMetricInputs => {
    const p = payloadFromForm(form);
    return {
      gender: member.gender,
      height_cm: p.height_cm != null && Number.isFinite(p.height_cm) ? p.height_cm : null,
      weight_kg: p.weight_kg != null && Number.isFinite(p.weight_kg) ? p.weight_kg : null,
      birth_date: p.birth_date,
      neck_cm: p.neck_cm != null && Number.isFinite(p.neck_cm) ? p.neck_cm : null,
      waist_cm: p.waist_cm != null && Number.isFinite(p.waist_cm) ? p.waist_cm : null,
      hip_cm: p.hip_cm != null && Number.isFinite(p.hip_cm) ? p.hip_cm : null,
    };
  }, [form, member.gender]);

  const metrics = useMemo(() => computeBodyMetrics(preview), [preview]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = payloadFromForm(form);
    for (const [key, val] of Object.entries(body)) {
      if (key === "birth_date") continue;
      if (val != null && (typeof val !== "number" || !Number.isFinite(val) || val <= 0)) {
        onError(`Valor inválido en ${key.replace("_", " ")}.`);
        return;
      }
    }
    if (body.birth_date != null && !/^\d{4}-\d{2}-\d{2}$/.test(body.birth_date)) {
      onError("Fecha de nacimiento inválida.");
      return;
    }
    setBusy(true);
    onError("");
    try {
      const response = await fetch(`/api/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudieron guardar las medidas.");
      await onSaved();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  const hasAny =
    preview.height_cm != null ||
    preview.weight_kg != null ||
    preview.birth_date != null ||
    preview.neck_cm != null ||
    preview.waist_cm != null ||
    preview.hip_cm != null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-labelledby="body-metrics-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h3 id="body-metrics-title">
              <Scale size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />
              IMC y grasa corporal — {member.first_name} {member.last_name}
            </h3>
            <p>
              Datos opcionales solo para esta sección. IMC con altura y peso; grasa con circunferencias
              (método Marina) o, si no hay medidas, estimación Deurenberg (edad + IMC).
            </p>
          </div>
          <button type="button" className="icon-button" title="Cerrar" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="body-metrics-summary">
          <SummaryBlock metrics={metrics} hasAny={hasAny} />
        </div>

        <form className="member-form body-metrics-form" onSubmit={save}>
          <label>
            Altura (cm)
            <input
              type="number"
              min="0"
              step="0.1"
              placeholder="Ej. 170"
              value={form.height_cm}
              onChange={(e) => setForm({ ...form, height_cm: e.target.value })}
            />
          </label>
          <label>
            Peso (kg)
            <input
              type="number"
              min="0"
              step="0.1"
              placeholder="Ej. 72.5"
              value={form.weight_kg}
              onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
            />
          </label>
          <label>
            Fecha de nacimiento
            <input
              type="date"
              value={form.birth_date}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
            />
          </label>
          <label>
            Cuello (cm)
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.neck_cm}
              onChange={(e) => setForm({ ...form, neck_cm: e.target.value })}
            />
          </label>
          <label>
            Cintura (cm)
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.waist_cm}
              onChange={(e) => setForm({ ...form, waist_cm: e.target.value })}
            />
          </label>
          {member.gender === "female" && (
            <label>
              Cadera (cm)
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.hip_cm}
                onChange={(e) => setForm({ ...form, hip_cm: e.target.value })}
              />
            </label>
          )}
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cerrar
            </button>
            <button type="submit" disabled={busy} className="primary-button">
              {busy ? "Guardando…" : "Guardar medidas"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SummaryBlock({
  metrics,
  hasAny,
}: {
  metrics: ReturnType<typeof computeBodyMetrics>;
  hasAny: boolean;
}) {
  if (!hasAny) {
    return (
      <p className="body-metrics-empty">
        Todavía no hay medidas registradas. Complétalas abajo o al crear el usuario.
      </p>
    );
  }

  const methodLabel =
    metrics.bodyFatMethod === "navy"
      ? "Método Marina (circunferencias)"
      : metrics.bodyFatMethod === "deurenberg"
        ? "Estimación Deurenberg (edad e IMC)"
        : null;

  return (
    <dl className="body-metrics-dl">
      <div>
        <dt>Índice de masa corporal (IMC)</dt>
        <dd>
          {metrics.bmi != null ? (
            <>
              <strong>{formatMetric(metrics.bmi, 2)}</strong>
              <span className="muted"> — {metrics.bmiLabel}</span>
            </>
          ) : (
            <span className="muted">Indica altura y peso</span>
          )}
        </dd>
      </div>
      <div>
        <dt>Grasa corporal (%)</dt>
        <dd>
          {metrics.bodyFatPercent != null ? (
            <>
              <strong>{formatMetric(metrics.bodyFatPercent, 1)} %</strong>
              {methodLabel ? <span className="muted"> — {methodLabel}</span> : null}
            </>
          ) : (
            <span className="muted">
              Añade cuello/cintura
              {metrics.age == null ? " y fecha de nacimiento" : ""} o solo edad con IMC
            </span>
          )}
        </dd>
      </div>
      {metrics.age != null && (
        <div>
          <dt>Edad</dt>
          <dd>{metrics.age} años</dd>
        </div>
      )}
    </dl>
  );
}
