import { useState } from "react";
import { BodyMetricsModal } from "../components/BodyMetricsModal";
import { TablePagination } from "../components/TablePagination";
import { usePagination } from "../hooks/usePagination";
import { Pencil, Plus, Scale, Search } from "lucide-react";
import { CompanionFields } from "../components/CompanionFields";
import { Empty } from "../components/Empty";
import { emptyCompanion } from "../lib/companions";
import { date, genderLabel, membershipVigente } from "../lib/format";
import type { Member, MemberEditForm, MemberForm } from "../types";

type UsuariosSectionProps = {
  members: Member[];
  search: string;
  onSearchChange: (value: string) => void;
  showForm: boolean;
  onToggleForm: () => void;
  form: MemberForm;
  onFormChange: (form: MemberForm) => void;
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
};

const toEditForm = (m: Member): MemberEditForm => ({
  first_name: m.first_name,
  last_name: m.last_name,
  phone: m.phone,
  email: m.email,
  notes: m.notes,
  gender: m.gender,
});

export function UsuariosSection({
  members,
  search,
  onSearchChange,
  showForm,
  onToggleForm,
  form,
  onFormChange,
  onSubmit,
  busy,
  onRefresh,
  onError,
}: UsuariosSectionProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<MemberEditForm | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [metricsMember, setMetricsMember] = useState<Member | null>(null);

  const filtered = members.filter((m) =>
    `${m.first_name} ${m.last_name} ${m.phone}`.toLowerCase().includes(search.toLowerCase())
  );
  const usersPage = usePagination(filtered, 15, search);

  function startEdit(m: Member) {
    setEditingId(m.id);
    setEditForm(toEditForm(m));
    if (showForm) onToggleForm();
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm || editingId == null) return;
    setEditBusy(true);
    onError("");
    try {
      const response = await fetch(`/api/members/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar.");
      cancelEdit();
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>Panel de usuarios</h3>
          <p>Datos de contacto e identificación. La membresía se gestiona en su sección.</p>
        </div>
        <button type="button" className="primary-button" onClick={onToggleForm}>
          <Plus size={17} /> Nuevo usuario
        </button>
      </div>

      {showForm && (
        <form className="member-form" onSubmit={onSubmit}>
          <label>
            Nombre *
            <input
              required
              value={form.first_name}
              onChange={(e) => onFormChange({ ...form, first_name: e.target.value })}
            />
          </label>
          <label>
            Apellido *
            <input
              required
              value={form.last_name}
              onChange={(e) => onFormChange({ ...form, last_name: e.target.value })}
            />
          </label>
          <label>
            Género *
            <select
              required
              value={form.gender}
              onChange={(e) =>
                onFormChange({ ...form, gender: e.target.value as MemberForm["gender"] })
              }
            >
              <option value="">Seleccionar…</option>
              <option value="male">Hombre</option>
              <option value="female">Mujer</option>
            </select>
          </label>
          <label>
            Teléfono
            <input
              value={form.phone}
              onChange={(e) => onFormChange({ ...form, phone: e.target.value })}
            />
          </label>
          <label>
            Correo
            <input
              type="text"
              inputMode="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => onFormChange({ ...form, email: e.target.value })}
            />
          </label>

          <label>
            Notas
            <input
              value={form.notes}
              onChange={(e) => onFormChange({ ...form, notes: e.target.value })}
            />
          </label>

          <fieldset className="form-fieldset">
            <legend>Medidas corporales (opcional)</legend>
            <p className="form-hint">
              Solo para calcular IMC y grasa en esta sección. Puedes omitirlas y completarlas después.
            </p>
            <div className="form-fieldset-grid">
              <label>
                Altura (cm)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.height_cm}
                  onChange={(e) => onFormChange({ ...form, height_cm: e.target.value })}
                />
              </label>
              <label>
                Peso (kg)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.weight_kg}
                  onChange={(e) => onFormChange({ ...form, weight_kg: e.target.value })}
                />
              </label>
              <label>
                Fecha de nacimiento
                <input
                  type="date"
                  value={form.birth_date}
                  onChange={(e) => onFormChange({ ...form, birth_date: e.target.value })}
                />
              </label>
              <label>
                Cuello (cm)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.neck_cm}
                  onChange={(e) => onFormChange({ ...form, neck_cm: e.target.value })}
                />
              </label>
              <label>
                Cintura (cm)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.waist_cm}
                  onChange={(e) => onFormChange({ ...form, waist_cm: e.target.value })}
                />
              </label>
              {form.gender === "female" && (
                <label>
                  Cadera (cm)
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.hip_cm}
                    onChange={(e) => onFormChange({ ...form, hip_cm: e.target.value })}
                  />
                </label>
              )}
            </div>
          </fieldset>

          <label className="form-toggle">
            <input
              type="checkbox"
              checked={form.with_membership}
              onChange={(e) => {
                const with_membership = e.target.checked;
                onFormChange({
                  ...form,
                  with_membership,
                  comes_with_companions: with_membership ? form.comes_with_companions : false,
                  companions: with_membership ? form.companions : [],
                });
              }}
            />
            <span>
              <strong>Activar membresía mensual</strong>
              <small>Desactiva si la persona solo pagará por visita (día).</small>
            </span>
          </label>

          {form.with_membership && (
            <label className="form-toggle">
              <input
                type="checkbox"
                checked={form.comes_with_companions}
                onChange={(e) => {
                  const comes_with_companions = e.target.checked;
                  onFormChange({
                    ...form,
                    comes_with_companions,
                    companions:
                      comes_with_companions && form.companions.length === 0
                        ? [emptyCompanion()]
                        : comes_with_companions
                          ? form.companions
                          : [],
                  });
                }}
              />
              <span>
                <strong>Viene acompañado</strong>
                <small>
                  Cada acompañante se guarda como usuario con su propia membresía y pago; solo se
                  registra que vinieron juntos en este mes.
                </small>
              </span>
            </label>
          )}

          {form.with_membership && form.comes_with_companions && (
            <CompanionFields
              companions={form.companions}
              members={members}
              onChange={(companions) => onFormChange({ ...form, companions })}
            />
          )}

          <label>
            Precio (USD) *
            <input
              required
              type="number"
              min="0"
              step="0.01"
              placeholder={form.with_membership ? "Ej. 25.00 mensual" : "Ej. 5.00 por visita"}
              value={form.price}
              onChange={(e) => onFormChange({ ...form, price: e.target.value })}
            />
          </label>
          <label>
            Método de pago *
            <select
              required
              value={form.payment_method}
              onChange={(e) =>
                onFormChange({
                  ...form,
                  payment_method: e.target.value as MemberForm["payment_method"],
                })
              }
            >
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
            </select>
          </label>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={onToggleForm}>
              Cancelar
            </button>
            <button disabled={busy} className="primary-button">
              {busy ? "Guardando…" : "Guardar usuario"}
            </button>
          </div>
        </form>
      )}

      {editingId != null && editForm && (
        <form className="member-form" onSubmit={saveEdit}>
          <p className="form-banner">Editar usuario</p>
          <label>
            Nombre *
            <input
              required
              value={editForm.first_name}
              onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
            />
          </label>
          <label>
            Apellido *
            <input
              required
              value={editForm.last_name}
              onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
            />
          </label>
          <label>
            Género *
            <select
              required
              value={editForm.gender}
              onChange={(e) =>
                setEditForm({ ...editForm, gender: e.target.value as MemberEditForm["gender"] })
              }
            >
              <option value="male">Hombre</option>
              <option value="female">Mujer</option>
            </select>
          </label>
          <label>
            Teléfono
            <input
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
            />
          </label>
          <label>
            Correo
            <input
              type="text"
              inputMode="email"
              autoComplete="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
          </label>
          <label>
            Notas
            <input
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
            />
          </label>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={cancelEdit}>
              Cancelar
            </button>
            <button disabled={editBusy} className="primary-button">
              {editBusy ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      )}

      <div className="search-box">
        <Search size={17} />
        <input
          placeholder="Buscar por nombre, apellido o teléfono..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {filtered.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Género</th>
                <th>Teléfono</th>
                <th>Correo</th>
                <th>Fecha de registro</th>
                <th>Estado</th>
                <th className="right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usersPage.slice.map((m) => (
                <tr key={m.id}>
                  <td className="member-name">
                    {m.first_name} {m.last_name}
                  </td>
                  <td>{genderLabel(m.gender)}</td>
                  <td>{m.phone || "—"}</td>
                  <td>{m.email || "—"}</td>
                  <td>{date(m.joined_on)}</td>
                  <td>
                    <span className={`status-pill ${membershipVigente(m) ? "active" : "inactive"}`}>
                      {membershipVigente(m) ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="right table-actions">
                    <button
                      type="button"
                      className="text-button"
                      title="IMC y grasa corporal"
                      onClick={() => setMetricsMember(m)}
                    >
                      <Scale size={16} />
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      title="Editar"
                      onClick={() => startEdit(m)}
                    >
                      <Pencil size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePagination
            page={usersPage.page}
            totalPages={usersPage.totalPages}
            total={usersPage.total}
            from={usersPage.from}
            to={usersPage.to}
            onPageChange={usersPage.setPage}
          />
        </div>
      ) : (
        <Empty
          text={
            search
              ? "No se encontraron usuarios."
              : "Todavía no hay usuarios. Registra el primero con “Nuevo usuario”."
          }
        />
      )}

      {metricsMember && (
        <BodyMetricsModal
          member={members.find((x) => x.id === metricsMember.id) ?? metricsMember}
          onClose={() => setMetricsMember(null)}
          onSaved={onRefresh}
          onError={onError}
        />
      )}
    </section>
  );
}