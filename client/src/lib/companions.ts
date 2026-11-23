import type { CompanionForm } from "../types";

export const emptyCompanion = (): CompanionForm => ({
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  notes: "",
  gender: "",
  existing_member_id: null,
  price: "",
  payment_method: "cash",
});

export function companionsForApi(forms: CompanionForm[]) {
  return forms.map((c) => {
    const payment = {
      price: Number(c.price),
      payment_method: c.payment_method,
    };
    if (c.existing_member_id != null && c.existing_member_id > 0) {
      return { member_id: c.existing_member_id, ...payment };
    }
    return {
      first_name: c.first_name.trim(),
      last_name: c.last_name.trim(),
      phone: c.phone.trim(),
      email: c.email.trim(),
      notes: c.notes.trim(),
      gender: c.gender,
      ...payment,
    };
  });
}

export function validateCompanions(forms: CompanionForm[]): string | null {
  for (const c of forms) {
    if (c.existing_member_id == null) {
      if (!c.first_name.trim() || !c.last_name.trim()) {
        return "Cada acompañante necesita nombre y apellido.";
      }
      if (c.gender !== "male" && c.gender !== "female") {
        return "Selecciona el género de cada acompañante.";
      }
    }
    if (c.price.trim() === "") {
      return "Indica el precio de cada acompañante.";
    }
    const priceNum = Number(c.price);
    if (!Number.isFinite(priceNum) || priceNum < 0 || priceNum > 100000) {
      return "Precio de acompañante inválido.";
    }
    if (c.payment_method !== "cash" && c.payment_method !== "transfer") {
      return "Método de pago de acompañante inválido.";
    }
  }
  return null;
}

export function formatCompanionCell(count: number, names: string | null | undefined) {
  if (!count || count < 1) return "Solo";
  const label = count === 1 ? "1 persona" : `${count} personas`;
  if (names?.trim()) return `${label}: ${names}`;
  return label;
}