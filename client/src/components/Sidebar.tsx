import {
  Activity,
  BarChart3,
  CreditCard,
  Dumbbell,
  LayoutDashboard,
  ShoppingBag,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { TabId } from "../types";

const NAV_ITEMS: [TabId, LucideIcon][] = [
  ["Dashboard", LayoutDashboard],
  ["Usuarios", Users],
  ["Membresías", CreditCard],
  ["Pagos", Wallet],
  ["Ventas", ShoppingBag],
  ["Asistencia", Activity],
  ["Reportes", BarChart3],
];

type SidebarProps = {
  tab: TabId;
  onSelectTab: (tab: TabId) => void;
};

export function Sidebar({ tab, onSelectTab }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-icon">
          <Dumbbell size={22} />
        </span>
        <span>
          GymAdmin
          <small>GESTIÓN LOCAL</small>
        </span>
      </div>

      <div className="nav-label">MENÚ PRINCIPAL</div>

      {NAV_ITEMS.map(([label, Icon]) => (
        <button
          key={label}
          className={`nav-item ${tab === label ? "selected" : ""}`}
          onClick={() => onSelectTab(label)}
        >
          <Icon size={18} />
          <span>{label}</span>
        </button>
      ))}

      <div className="sidebar-bottom">
        <span className="status-dot" /> Funcionamiento local{" "}
        <small>Uusario administrador</small>
      </div>
    </aside>
  );
}