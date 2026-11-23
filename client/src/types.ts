export type TabId =
  | "Dashboard"
  | "Usuarios"
  | "Membresías"
  | "Pagos"
  | "Ventas"
  | "Asistencia"
  | "Reportes";

export type ProductCategory = "bebidas" | "suplementos" | "otros";

export type Product = {
  id: number;
  name: string;
  category: ProductCategory;
  price_cents: number;
  active: boolean;
};

export type MonthReport = {
  year_month: string;
  income: {
    total_cents: number;
    membership_cents: number;
    product_cents: number;
  };
  attendance: {
    total_visits: number;
    total_visits_raw?: number;
    visits_on_closed_days?: number;
    unique_members: number;
    by_date: { date: string; visit_count: number }[];
    by_weekday: {
      weekday: number;
      label: string;
      visit_count: number;
      raw_visit_count?: number;
      closed?: boolean;
      dates?: { date: string; visit_count: number }[];
    }[];
  };
  exercises: { key: string; label: string; count: number }[];
  members: {
    total_active: number;
    male: number;
    female: number;
  };
};

export type ProductSale = {
  id: number;
  product_id: number;
  product_name: string;
  product_category: ProductCategory;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  sale_date: string;
  method: "cash" | "transfer";
  member_id: number | null;
  member_name: string | null;
  notes: string;
};

export type Member = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  joined_on: string;
  gender: "male" | "female";
  /** Precio de referencia (mensual o por visita según el caso) */
  price_cents?: number;
  payment_method?: "cash" | "transfer";
  status: "active" | "inactive";
  notes: string;
  height_cm?: number | null;
  weight_kg?: number | null;
  birth_date?: string | null;
  neck_cm?: number | null;
  waist_cm?: number | null;
  hip_cm?: number | null;
  membership_start?: string | null;
  membership_end?: string | null;
  membership_price_cents?: number | null;
};

export type Payment = {
  id: number;
  member_name: string;
  payment_date: string;
  amount_cents: number;
  method: string;
  concept: string;
};

export type ExpiringMembershipRow = {
  membership_id: number;
  member_id: number;
  member_name: string;
  phone: string;
  end_date: string;
  days_left: number;
};

export type Dashboard = {
  activeMembers: number;
  incomeCents: number;
  expiringMemberships: number;
  expiringSoon: ExpiringMembershipRow[];
  recentPayments: Payment[];
};

export type MemberEditForm = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  notes: string;
  gender: "male" | "female";
};

export type MembershipEditForm = {
  start_date: string;
  end_date: string;
  price: string;
  status: "active" | "expired" | "cancelled";
};

export type RenewMembershipForm = {
  price: string;
  payment_method: "cash" | "transfer";
  /** En clientes solo visita: false = otro día, true = pasar a membresía mensual */
  activate_membership: boolean;
  comes_with_companions: boolean;
  companions: CompanionForm[];
};

export type CompanionForm = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  notes: string;
  gender: "" | "male" | "female";
  existing_member_id: number | null;
  price: string;
  payment_method: "cash" | "transfer";
};

export type MemberForm = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  notes: string;
  gender: "" | "male" | "female";
  /** Si es true, se crea membresía mensual al guardar */
  with_membership: boolean;
  /** Precio en dólares (mensual o por visita) */
  price: string;
  payment_method: "cash" | "transfer";
  comes_with_companions: boolean;
  companions: CompanionForm[];
  /** Medidas corporales opcionales (solo usuarios) */
  height_cm: string;
  weight_kg: string;
  birth_date: string;
  neck_cm: string;
  waist_cm: string;
  hip_cm: string;
};

export type AttendanceSummaryRow = {
  member_id: number;
  member_name: string;
  current_start: string | null;
  current_end: string | null;
  current_price_cents: number | null;
  current_method: string | null;
  current_kind: "membership" | "day_visit";
  history_count: number;
  companion_count: number;
  companion_names: string | null;
};

export type AttendanceHistoryEvent = {
  kind: "membership" | "day_visit";
  start_date: string;
  end_date: string | null;
  price_cents: number;
  method: string;
  label: string;
  companion_count?: number;
  companion_names?: string | null;
};

export type AttendanceHistory = {
  member_id: number;
  member_name: string;
  events: AttendanceHistoryEvent[];
};

export type AttendanceCoveragePeriod = {
  kind: "membership" | "day_visit";
  start: string;
  end: string | null;
  label: string;
};

export type AttendanceCalendar = {
  member_id: number;
  member_name: string;
  year_month: string;
  visited_dates: string[];
  visit_count: number;
  eligible_dates: string[];
  coverage: AttendanceCoveragePeriod[];
  workouts_by_date?: Record<string, string[]>;
};

export type TodayVisitWorkoutRow = {
  member_id: number;
  member_name: string;
  exercises: string[];
};

export type MembershipRow = {
  id: number;
  member_id: number;
  member_name: string;
  plan_name: string;
  start_date: string;
  end_date: string;
  status: "active" | "expired" | "cancelled";
  price_cents: number;
  member_notes: string;
  companion_count: number;
  companion_names: string | null;
};