import { Activity, CreditCard, Dumbbell, MessageCircle, Users, Wallet } from "lucide-react";
import { Empty } from "../components/Empty";
import { Stat } from "../components/Stat";
import { date, money, paymentMethodLabel } from "../lib/format";
import { buildWhatsAppHref, membershipExpiryWhatsAppMessage } from "../lib/whatsapp";
import type { Dashboard } from "../types";

type DashboardSectionProps = {
  dashboard: Dashboard | null;
  memberCount: number;
  onOpenPagos: () => void;
};

export function DashboardSection({ dashboard, memberCount, onOpenPagos }: DashboardSectionProps) {
  return (
    <section>
      <div className="welcome">
        <div>
          <span className="welcome-tag">PANEL DE CONTROL</span>
          <h2>Tu gimnasio, bajo control.</h2>
          <p>Resumen de la actividad registrada en tu sistema local.</p>
        </div>
        <Dumbbell className="welcome-icon" size={76} />
      </div>

      <div className="stats-grid">
        <Stat
          icon={<Users />}
          label="Socios activos"
          value={String(dashboard?.activeMembers ?? "—")}
          tone="purple"
        />
        <Stat
          icon={<Wallet />}
          label="Ingresos del mes"
          value={dashboard ? money(dashboard.incomeCents) : "—"}
          tone="green"
        />
        <Stat
          icon={<CreditCard />}
          label="Por vencer (7 días)"
          value={String(dashboard?.expiringMemberships ?? "—")}
          tone="orange"
        />
        <Stat
          icon={<Activity />}
          label="Socios registrados"
          value={String(memberCount)}
          tone="blue"
        />
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <h3>Membresías por vencer</h3>
            <p>
              Socios con membresía activa que vence en los próximos 7 días (no incluye pago por día).
            </p>
          </div>
        </div>

        {dashboard?.expiringSoon?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Socio</th>
                  <th>Teléfono</th>
                  <th>Vence</th>
                  <th className="right">Días</th>
                  <th className="right">WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.expiringSoon.map((row) => {
                  const wa = buildWhatsAppHref(
                    row.phone,
                    membershipExpiryWhatsAppMessage(
                      row.member_name,
                      date(row.end_date),
                      row.days_left
                    )
                  );
                  return (
                    <tr key={row.membership_id}>
                      <td className="member-name">{row.member_name}</td>
                      <td>{row.phone.trim() ? row.phone : "—"}</td>
                      <td>{date(row.end_date)}</td>
                      <td className="right">{row.days_left}</td>
                      <td className="right">
                        {wa ? (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="secondary-button table-action-btn"
                            title="Abrir chat en WhatsApp"
                          >
                            <MessageCircle size={15} />
                            Enviar
                          </a>
                        ) : (
                          <span className="workout-form-hint">Sin teléfono</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Nadie con membresía activa vence en los próximos 7 días." />
        )}
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <h3>Pagos recientes</h3>
            <p>Últimos pagos registrados</p>
          </div>
          <button type="button" className="text-button" onClick={onOpenPagos}>
            Ver todos
          </button>
        </div>

        {dashboard?.recentPayments?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Socio</th>
                  <th>Tipo</th>
                  <th>Fecha</th>
                  <th>Método</th>
                  <th className="right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.member_name}</td>
                    <td>
                      <span className="pill">{p.concept ?? "—"}</span>
                    </td>
                    <td>{date(p.payment_date)}</td>
                    <td>
                      <span className="pill">{paymentMethodLabel(p.method)}</span>
                    </td>
                    <td className="right amount">{money(p.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Aún no hay pagos registrados." />
        )}
      </div>
    </section>
  );
}