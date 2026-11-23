import { useMemo, useState } from "react";
import { Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import { emptyCompanion } from "../lib/companions";
import type { CompanionForm, Member } from "../types";

type CompanionFieldsProps = {
  companions: CompanionForm[];
  onChange: (companions: CompanionForm[]) => void;
  members?: Member[];
  excludeMemberId?: number;
};

function applyMemberToCompanion(
  member: Member,
  patch: Partial<CompanionForm>
): Partial<CompanionForm> {
  if (member.price_cents != null && member.price_cents > 0) {
    patch.price = (member.price_cents / 100).toFixed(2);
  }
  if (member.payment_method === "cash" || member.payment_method === "transfer") {
    patch.payment_method = member.payment_method;
  }
  return patch;
}

function CompanionCard({
  companion,
  index,
  members,
  onChange,
  onRemove,
}: {
  companion: CompanionForm;
  index: number;
  members: Member[];
  onChange: (patch: Partial<CompanionForm>) => void;
  onRemove: () => void;
}) {
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const selected = companion.existing_member_id
    ? members.find((m) => m.id === companion.existing_member_id)
    : null;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return members.slice(0, 12);
    return members
      .filter((m) =>
        `${m.first_name} ${m.last_name} ${m.phone} ${m.email}`.toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [members, search]);

  function pickMember(m: Member) {
    const patch = applyMemberToCompanion(m, { existing_member_id: m.id });
    onChange(patch);
    setSearch("");
    setPickerOpen(false);
  }

  function useNewMember() {
    onChange({
      existing_member_id: null,
      first_name: "",
      last_name: "",
      phone: "",
      email: "",
      gender: "",
      notes: "",
    });
    setSearch("");
    setPickerOpen(false);
  }

  return (
    <div className="companion-card">
      <div className="companion-card-head">
        <strong>Acompañante {index + 1}</strong>
        <button type="button" className="text-button icon-action" title="Quitar" onClick={onRemove}>
          <Trash2 size={16} />
        </button>
      </div>

      {members.length > 0 && (
        <div className="companion-existing-row">
          <span className="companion-inline-label">En el sistema</span>
          <div className="companion-picker">
            {selected ? (
              <div className="companion-selected">
                <span>
                  {selected.first_name} {selected.last_name}
                  {selected.phone ? ` · ${selected.phone}` : ""}
                </span>
                <button type="button" className="text-button" onClick={useNewMember}>
                  <UserPlus size={15} />
                  Registrar como nuevo
                </button>
              </div>
            ) : (
              <>
                <div className="companion-search-box">
                  <Search size={16} aria-hidden />
                  <input
                    type="search"
                    placeholder="Buscar socio por nombre, teléfono o correo…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPickerOpen(true);
                    }}
                    onFocus={() => setPickerOpen(true)}
                    onBlur={() => {
                      window.setTimeout(() => setPickerOpen(false), 150);
                    }}
                    autoComplete="off"
                  />
                  {search && (
                    <button
                      type="button"
                      className="icon-button companion-search-clear"
                      title="Limpiar búsqueda"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSearch("");
                        setPickerOpen(true);
                      }}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
                {pickerOpen && (
                  <ul className="companion-search-results" role="listbox">
                    {filtered.length ? (
                      filtered.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            role="option"
                            className="companion-search-option"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickMember(m)}
                          >
                            <span className="companion-search-name">
                              {m.first_name} {m.last_name}
                            </span>
                            <span className="companion-search-meta">
                              {[m.phone, m.email].filter(Boolean).join(" · ") || "Sin contacto"}
                            </span>
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="companion-search-empty">
                        No hay coincidencias. Completa los datos como usuario nuevo abajo.
                      </li>
                    )}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {companion.existing_member_id == null && (
        <div className="companion-identity-grid">
          <label>
            Nombre *
            <input
              required
              value={companion.first_name}
              onChange={(e) => onChange({ first_name: e.target.value })}
            />
          </label>
          <label>
            Apellido *
            <input
              required
              value={companion.last_name}
              onChange={(e) => onChange({ last_name: e.target.value })}
            />
          </label>
          <label>
            Género *
            <select
              required
              value={companion.gender}
              onChange={(e) => onChange({ gender: e.target.value as CompanionForm["gender"] })}
            >
              <option value="">Seleccionar…</option>
              <option value="male">Hombre</option>
              <option value="female">Mujer</option>
            </select>
          </label>
          <label>
            Teléfono
            <input value={companion.phone} onChange={(e) => onChange({ phone: e.target.value })} />
          </label>
          <label className="companion-span-2">
            Correo
            <input
              type="text"
              inputMode="email"
              autoComplete="email"
              value={companion.email}
              onChange={(e) => onChange({ email: e.target.value })}
            />
          </label>
        </div>
      )}

      <div className="companion-pay-row">
        <label>
          Precio (USD) *
          <input
            required
            type="number"
            min="0"
            step="0.01"
            placeholder="Mensualidad del acompañante"
            value={companion.price}
            onChange={(e) => onChange({ price: e.target.value })}
          />
        </label>
        <label>
          Método de pago *
          <select
            required
            value={companion.payment_method}
            onChange={(e) =>
              onChange({
                payment_method: e.target.value as CompanionForm["payment_method"],
              })
            }
          >
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
          </select>
        </label>
      </div>
    </div>
  );
}

export function CompanionFields({
  companions,
  onChange,
  members = [],
  excludeMemberId,
}: CompanionFieldsProps) {
  const existingOptions = members.filter((m) => m.id !== excludeMemberId);

  function updateAt(index: number, patch: Partial<CompanionForm>) {
    const next = companions.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange(next);
  }

  function addCompanion() {
    onChange([...companions, emptyCompanion()]);
  }

  function removeAt(index: number) {
    onChange(companions.filter((_, i) => i !== index));
  }

  return (
    <div className="companions-block">
      {companions.map((c, index) => (
        <CompanionCard
          key={index}
          companion={c}
          index={index}
          members={existingOptions}
          onChange={(patch) => updateAt(index, patch)}
          onRemove={() => removeAt(index)}
        />
      ))}

      {companions.length < 8 && (
        <button type="button" className="secondary-button add-companion-btn" onClick={addCompanion}>
          <Plus size={16} /> Agregar otra persona
        </button>
      )}
    </div>
  );
}