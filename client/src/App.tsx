import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { AsistenciaSection } from "./sections/AsistenciaSection";
import { DashboardSection } from "./sections/DashboardSection";
import { MembresiasSection } from "./sections/MembresiasSection";
import { PagosSection } from "./sections/PagosSection";
import { VentasSection } from "./sections/VentasSection";
import { ReportesSection } from "./sections/ReportesSection";
import { UsuariosSection } from "./sections/UsuariosSection";
import { companionsForApi, validateCompanions } from "./lib/companions";
import type {
  AttendanceSummaryRow,
  Dashboard,
  Member,
  MemberForm,
  MembershipRow,
  Payment,
  Product,
  ProductSale,
  TabId,
} from "./types";

const emptyMemberForm = (): MemberForm => ({
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  notes: "",
  gender: "",
  with_membership: true,
  price: "",
  payment_method: "cash",
  comes_with_companions: false,
  companions: [],
  height_cm: "",
  weight_kg: "",
  birth_date: "",
  neck_cm: "",
  waist_cm: "",
  hip_cm: "",
});

export default function App() {
  const [tab, setTab] = useState<TabId>("Dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSales, setProductSales] = useState<ProductSale[]>([]);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummaryRow[]>([]);
  const [search, setSearch] = useState("");
  const [membershipSearch, setMembershipSearch] = useState("");
  const [asistenciaSearch, setAsistenciaSearch] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<MemberForm>(emptyMemberForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    try {
      const [d, m, p, ms, attendance, prod, prodSales] = await Promise.all([
        fetch("/api/dashboard").then((r) => r.json()),
        fetch("/api/members").then((r) => r.json()),
        fetch("/api/payments").then((r) => r.json()),
        fetch("/api/memberships").then((r) => r.json()),
        fetch("/api/attendance/summary").then((r) => r.json()),
        fetch("/api/products").then((r) => r.json()),
        fetch("/api/product-sales").then((r) => r.json()),
      ]);
      setDashboard(d);
      setMembers(m);
      setPayments(p);
      setMemberships(ms);
      setAttendanceSummary(attendance);
      setProducts(prod);
      setProductSales(prodSales);
    } catch {
      setError("No se pudo conectar con la aplicación local. Comprueba que el servidor siga ejecutándose.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const {
        price,
        gender,
        with_membership,
        comes_with_companions,
        companions,
        height_cm,
        weight_kg,
        birth_date,
        neck_cm,
        waist_cm,
        hip_cm,
        ...rest
      } = form;
      if (gender !== "male" && gender !== "female") {
        setError("Selecciona el género.");
        setBusy(false);
        return;
      }
      if (price.trim() === "") {
        setError("Indica el precio.");
        setBusy(false);
        return;
      }
      if (with_membership && comes_with_companions) {
        if (!companions.length) {
          setError("Agrega al menos un acompañante o desactiva la opción.");
          setBusy(false);
          return;
        }
        const companionErr = validateCompanions(companions);
        if (companionErr) {
          setError(companionErr);
          setBusy(false);
          return;
        }
      }
      const optionalMeasure = (s: string) => (s.trim() === "" ? undefined : Number(s));
      const payload = {
        ...rest,
        gender,
        with_membership,
        price: Number(price),
        height_cm: optionalMeasure(height_cm),
        weight_kg: optionalMeasure(weight_kg),
        birth_date: birth_date.trim() === "" ? undefined : birth_date.trim(),
        neck_cm: optionalMeasure(neck_cm),
        waist_cm: optionalMeasure(waist_cm),
        hip_cm: optionalMeasure(hip_cm),
        companions:
          with_membership && comes_with_companions
            ? companionsForApi(companions)
            : undefined,
      };
      const response = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar el socio.");
      setForm(emptyMemberForm());
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  function selectTab(next: TabId) {
    setTab(next);
    setShowForm(false);
  }

  return (
    <div className="app-shell">
      <Sidebar tab={tab} onSelectTab={selectTab} />

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">ADMINISTRACIÓN DEL GIMNASIO</div>
            <h1>{tab}</h1>
          </div>
          <button className="icon-button" title="Actualizar" onClick={() => void load()}>
            <RefreshCw size={18} />
          </button>
        </header>

        {error && <div className="alert">{error}</div>}

        {tab === "Dashboard" && (
          <DashboardSection
            dashboard={dashboard}
            memberCount={members.length}
            onOpenPagos={() => setTab("Pagos")}
          />
        )}

        {tab === "Usuarios" && (
          <UsuariosSection
            members={members}
            search={search}
            onSearchChange={setSearch}
            showForm={showForm}
            onToggleForm={() => setShowForm((v) => !v)}
            form={form}
            onFormChange={setForm}
            onSubmit={addMember}
            busy={busy}
            onRefresh={load}
            onError={setError}
          />
        )}

        {tab === "Pagos" && <PagosSection payments={payments} />}

        {tab === "Ventas" && (
          <VentasSection
            products={products}
            sales={productSales}
            members={members}
            onRefresh={load}
            onError={setError}
          />
        )}

        {tab === "Membresías" && (
          <MembresiasSection
            memberships={memberships}
            members={members}
            search={membershipSearch}
            onSearchChange={setMembershipSearch}
            onRefresh={load}
            onError={setError}
          />
        )}

        {tab === "Asistencia" && (
          <AsistenciaSection
            summary={attendanceSummary}
            search={asistenciaSearch}
            onSearchChange={setAsistenciaSearch}
            onError={setError}
          />
        )}

        {tab === "Reportes" && <ReportesSection onError={setError} />}

        <footer>
          GymAdmin Local <span>•</span> Prototipo inicial <span>•</span> Datos almacenados localmente
        </footer>
      </main>
    </div>
  );
}