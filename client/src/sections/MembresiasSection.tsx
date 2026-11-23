import { useMemo, useState } from "react";
import { Pencil, RefreshCw, Search } from "lucide-react";
import { CompanionFields } from "../components/CompanionFields";
import { Empty } from "../components/Empty";
import { TablePagination } from "../components/TablePagination";
import { usePagination } from "../hooks/usePagination";
import {
  companionsForApi,
  emptyCompanion,
  formatCompanionCell,
  validateCompanions,
} from "../lib/companions";
import {
  date,
  dateOnly,
  genderLabel,
  membershipDatesVigente,
  membershipPeriodFromToday,
  money,
  todayIso,
} from "../lib/format";
import type { Member, MembershipEditForm, MembershipRow, RenewMembershipForm } from "../types";

type MembresiasSectionProps = {
  memberships: MembershipRow[];
  members: Member[];
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
};

const toMembershipEdit = (row: MembershipRow): MembershipEditForm => ({
  start_date: dateOnly(row.start_date) ?? "",
  end_date: dateOnly(row.end_date) ?? "",
  price: (row.price_cents / 100).toFixed(2),
  status: row.status,
});

const emptyRenew = (): RenewMembershipForm => ({
  price: "",
  payment_method: "cash",
  activate_membership: false,
  comes_with_companions: false,
  companions: [],
});

export function MembresiasSection({
  memberships,
  members,
  search,
  onSearchChange,
  onRefresh,
  onError,
}: MembresiasSectionProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<MembershipEditForm | null>(null);
  const [renewMember, setRenewMember] = useState<{
    id: number;
    name: string;
    mode: "renew" | "visit";
  } | null>(null);
  const [renewForm, setRenewForm] = useState<RenewMembershipForm>(emptyRenew());
  const [busy, setBusy] = useState(false);

  const q = search.toLowerCase();

  const activeMemberships = useMemo(
    () => memberships.filter((row) => row.status === "active"),
    [memberships]
  );

  const latestActiveIdByMember = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of [...activeMemberships].sort((a, b) =>
      dateOnlySort(b.end_date).localeCompare(dateOnlySort(a.end_date))
    )) {
      if (!map.has(row.member_id)) map.set(row.member_id, row.id);
    }
    return map;
  }, [activeMemberships]);

  const activeMemberIds = useMemo(
    () => new Set(activeMemberships.map((row) => row.member_id)),
    [activeMemberships]
  );

  const filteredMemberships = memberships.filter((row) =>
    `${row.member_name} ${row.plan_name} ${row.member_notes}`.toLowerCase().includes(q)
  );

  /** Solo membresías con estado activo (una fila reciente por usuario). */
  const currentMemberships = useMemo(
    () =>
      filteredMemberships.filter(
        (row) => row.status === "active" && latestActiveIdByMember.get(row.member_id) === row.id
      ),
    [filteredMemberships, latestActiveIdByMember]
  );

  const visitOnlyMembers = useMemo(
    () =>
      members
        .filter((m) => !activeMemberIds.has(m.id))
        .filter((m) =>
          `${m.first_name} ${m.last_name} ${m.phone} ${m.email} ${m.notes}`.toLowerCase().includes(q)
        ),
    [members, activeMemberIds, q]
  );

  const membershipsPage = usePagination(currentMemberships, 15, search);
  const visitPage = usePagination(visitOnlyMembers, 15, search);

  function startEdit(row: MembershipRow) {
    setRenewMember(null);
    setEditingId(row.id);
    setEditForm(toMembershipEdit(row));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  function startRenew(
    memberId: number,
    name: string,
    hintCents: number | undefined,
    mode: "renew" | "visit"
  ) {
    cancelEdit();
    setRenewMember({ id: memberId, name, mode });
    setRenewForm({
      price: hintCents != null ? (hintCents / 100).toFixed(2) : "",
      payment_method: "cash",
      activate_membership: mode === "renew",
      comes_with_companions: false,
      companions: [],
    });
  }

  function cancelRenew() {
    setRenewMember(null);
    setRenewForm(emptyRenew());
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm || editingId == null) return;
    setBusy(true);
    onError("");
    try {
      const response = await fetch(`/api/memberships/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_date: editForm.start_date,
          end_date: editForm.end_date,
          price: Number(editForm.price),
          status: editForm.status,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar.");
      cancelEdit();
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRenew(e: React.FormEvent) {
    e.preventDefault();
    if (!renewMember) return;
    if (renewForm.price.trim() === "") {
      onError("Indica el precio del pago.");
      return;
    }
    if (renewForm.activate_membership && renewForm.comes_with_companions) {
      if (!renewForm.companions.length) {
        onError("Agrega al menos un acompañante o desactiva la opción.");
        return;
      }
      const companionErr = validateCompanions(renewForm.companions);
      if (companionErr) {
        onError(companionErr);
        return;
      }
    }
    setBusy(true);
    onError("");
    try {
      const isDayVisit = !renewForm.activate_membership;
      const response = isDayVisit
        ? await fetch(`/api/members/${renewMember.id}/day-visit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              price: Number(renewForm.price),
              payment_method: renewForm.payment_method,
              payment_date: todayIso(),
            }),
          })
        : await fetch("/api/memberships/renew", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              member_id: renewMember.id,
              price: Number(renewForm.price),
              payment_method: renewForm.payment_method,
              start_date: todayIso(),
              companions:
                renewForm.comes_with_companions && renewForm.companions.length
                  ? companionsForApi(renewForm.companions)
                  : undefined,
            }),
          });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error ||
            (isDayVisit ? "No se pudo registrar el pago por visita." : "No se pudo renovar.")
        );
      }
      cancelRenew();
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  const renewPeriod = membershipPeriodFromToday();

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>Panel de membresías</h3>
          <p>Membresías mensuales y clientes que pagan solo por visita.</p>
        </div>
      </div>

      {renewMember && (
        <form className="member-form renew-confirm-form" onSubmit={submitRenew}>
          <p className="form-banner">
            {renewMember.mode === "visit"
              ? `Registrar pago — ${renewMember.name}`
              : `Renovar — ${renewMember.name}`}
            <small>
              {renewMember.mode === "visit"
                ? "Elige si paga solo el día de hoy o si activa membresía mensual."
                : "Elige si renueva otro mes o si solo paga la visita de hoy."}
            </small>
          </p>

          <label className="form-toggle">
            <input
              type="checkbox"
              checked={renewForm.activate_membership}
              onChange={(e) => {
                const activate = e.target.checked;
                const next = {
                  ...renewForm,
                  activate_membership: activate,
                  comes_with_companions: activate ? renewForm.comes_with_companions : false,
                  companions: activate ? renewForm.companions : [],
                };
                if (!activate) {
                  const m = members.find((x) => x.id === renewMember.id);
                  if (m?.price_cents != null) {
                    next.price = (m.price_cents / 100).toFixed(2);
                  }
                }
                setRenewForm(next);
              }}
            />
            <span>
              <strong>Activar membresía mensual</strong>
              <small>
                {renewMember.mode === "visit"
                  ? "Desactivado: otro pago por visita. Activado: pasa a membresía mensual."
                  : "Desactivado: solo pago por día, sin nuevo mes. Activado: nuevo período desde hoy."}
              </small>
            </span>
          </label>

          {renewForm.activate_membership && (
            <label className="form-toggle">
              <input
                type="checkbox"
                checked={renewForm.comes_with_companions}
                onChange={(e) => {
                  const comes_with_companions = e.target.checked;
                  setRenewForm({
                    ...renewForm,
                    comes_with_companions,
                    companions:
                      comes_with_companions && renewForm.companions.length === 0
                        ? [emptyCompanion()]
                        : comes_with_companions
                          ? renewForm.companions
                          : [],
                  });
                }}
              />
              <span>
                <strong>Viene acompañado este mes</strong>
                <small>
                  Añade quién entrena con el titular en este período (pareja, amigos, etc.).
                </small>
              </span>
            </label>
          )}

          {renewForm.activate_membership && renewForm.comes_with_companions && (
            <CompanionFields
              companions={renewForm.companions}
              members={members}
              excludeMemberId={renewMember.id}
              onChange={(companions) => setRenewForm({ ...renewForm, companions })}
            />
          )}

          {renewForm.activate_membership ? (
            <div className="renew-preview">
              <div>
                <span className="renew-preview-label">Inicio (hoy)</span>
                <strong>{date(renewPeriod.start)}</strong>
              </div>
              <div>
                <span className="renew-preview-label">Fin (+1 mes)</span>
                <strong>{date(renewPeriod.end)}</strong>
              </div>
            </div>
          ) : (
            <div className="renew-preview renew-preview--day">
              <div>
                <span className="renew-preview-label">Pago por visita</span>
                <strong>{date(todayIso())}</strong>
              </div>
              <p className="renew-preview-hint">
                Sin nuevo mes: se registra solo el día de hoy y la membresía activa se da de baja.
              </p>
            </div>
          )}

          <label>
            Precio (USD) *
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={renewForm.price}
              onChange={(e) => setRenewForm({ ...renewForm, price: e.target.value })}
            />
          </label>
          <label>
            Método de pago *
            <select
              value={renewForm.payment_method}
              onChange={(e) =>
                setRenewForm({
                  ...renewForm,
                  payment_method: e.target.value as RenewMembershipForm["payment_method"],
                })
              }
            >
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
            </select>
          </label>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={cancelRenew}>
              Cancelar
            </button>
            <button disabled={busy} className="primary-button">
              {busy
                ? "Procesando…"
                : renewForm.activate_membership
                  ? renewMember.mode === "visit"
                    ? "Confirmar membresía"
                    : "Confirmar renovación"
                  : "Registrar pago del día"}
            </button>
          </div>
        </form>
      )}

      {editingId != null && editForm && (
        <form className="member-form" onSubmit={saveEdit}>
          <p className="form-banner">Editar membresía</p>
          <label>
            Inicio *
            <input
              type="date"
              required
              value={editForm.start_date}
              onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
            />
          </label>
          <label>
            Fin *
            <input
              type="date"
              required
              value={editForm.end_date}
              onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
            />
          </label>
          <label>
            Precio (USD) *
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={editForm.price}
              onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
            />
          </label>
          <label>
            Estado en sistema
            <select
              value={editForm.status}
              onChange={(e) =>
                setEditForm({
                  ...editForm,
                  status: e.target.value as MembershipEditForm["status"],
                })
              }
            >
              <option value="active">Activa</option>
              <option value="expired">Vencida</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </label>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={cancelEdit}>
              Cancelar
            </button>
            <button disabled={busy} className="primary-button">
              {busy ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      )}

      <div className="search-box">
        <Search size={17} />
        <input
          placeholder="Buscar por usuario, plan o notas..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <h4 className="subsection-title">Membresías mensuales</h4>

      {currentMemberships.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Plan</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th>Estado</th>
                <th className="right">Precio</th>
                <th>Acompañantes</th>
                <th>Notas</th>
                <th className="right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {membershipsPage.slice.map((row) => {
                const vigente = membershipDatesVigente(row.start_date, row.end_date);
                return (
                  <tr key={row.id}>
                    <td className="member-name">{row.member_name}</td>
                    <td>{row.plan_name}</td>
                    <td>{date(row.start_date)}</td>
                    <td>{date(row.end_date)}</td>
                    <td>
                      <span className={`status-pill ${vigente ? "active" : "inactive"}`}>
                        {vigente ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="right amount">{money(row.price_cents)}</td>
                    <td className="companions-cell">
                      {formatCompanionCell(row.companion_count ?? 0, row.companion_names)}
                    </td>
                    <td>{row.member_notes?.trim() ? row.member_notes : "—"}</td>
                    <td className="right table-actions">
                      <button
                        type="button"
                        className="text-button icon-action"
                        title="Editar fechas o precio"
                        onClick={() => startEdit(row)}
                      >
                        <Pencil size={16} />
                        <span className="sr-only">Editar</span>
                      </button>
                      <button
                        type="button"
                        className="secondary-button table-action-btn"
                        onClick={() =>
                          startRenew(row.member_id, row.member_name, row.price_cents, "renew")
                        }
                      >
                        <RefreshCw size={15} />
                        Renovar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <TablePagination
            page={membershipsPage.page}
            totalPages={membershipsPage.totalPages}
            total={membershipsPage.total}
            from={membershipsPage.from}
            to={membershipsPage.to}
            onPageChange={membershipsPage.setPage}
          />
        </div>
      ) : (
        <Empty
          text={
            search
              ? "No se encontraron membresías con ese criterio."
              : "No hay membresías mensuales. Activa la opción al registrar un usuario."
          }
        />
      )}

      <h4 className="subsection-title">Pago por visita (sin membresía)</h4>

      {visitOnlyMembers.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Género</th>
                <th>Teléfono</th>
                <th>Correo</th>
                <th>Registro</th>
                <th className="right">Precio</th>
                <th>Notas</th>
                <th className="right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visitPage.slice.map((m) => (
                <tr key={m.id}>
                  <td className="member-name">
                    {m.first_name} {m.last_name}
                  </td>
                  <td>{genderLabel(m.gender)}</td>
                  <td>{m.phone || "—"}</td>
                  <td>{m.email || "—"}</td>
                  <td>{date(m.joined_on)}</td>
                  <td className="right amount">{money(m.price_cents ?? 0)}</td>
                  <td>{m.notes?.trim() ? m.notes : "—"}</td>
                  <td className="right table-actions">
                    <button
                      type="button"
                      className="secondary-button table-action-btn"
                      onClick={() =>
                        startRenew(
                          m.id,
                          `${m.first_name} ${m.last_name}`,
                          m.price_cents,
                          "visit"
                        )
                      }
                    >
                      <RefreshCw size={15} />
                      Registrar pago
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePagination
            page={visitPage.page}
            totalPages={visitPage.totalPages}
            total={visitPage.total}
            from={visitPage.from}
            to={visitPage.to}
            onPageChange={visitPage.setPage}
          />
        </div>
      ) : (
        <Empty
          text={
            search
              ? "No hay usuarios sin membresía con ese criterio."
              : "No hay usuarios registrados solo para pago por visita."
          }
        />
      )}
    </section>
  );
}

function dateOnlySort(value: string) {
  return dateOnly(value) ?? "";
}