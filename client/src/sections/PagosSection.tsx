import { useMemo, useState } from "react";
import { Banknote, CalendarDays, ListOrdered, Wallet } from "lucide-react";
import { Empty } from "../components/Empty";
import { Stat } from "../components/Stat";
import { TablePagination } from "../components/TablePagination";
import { usePagination } from "../hooks/usePagination";
import {
  currentYearMonth,
  date,
  money,
  monthLabel,
  paymentInMonth,
  paymentMethodLabel,
} from "../lib/format";
import type { Payment } from "../types";

type PagosSectionProps = {
  payments: Payment[];
};

export function PagosSection({ payments }: PagosSectionProps) {
  const [month, setMonth] = useState(currentYearMonth);

  const monthPayments = useMemo(
    () =>
      payments
        .filter((p) => paymentInMonth(p.payment_date, month))
        .sort((a, b) => {
          const da = dateOnlySortKey(a.payment_date);
          const db = dateOnlySortKey(b.payment_date);
          return db.localeCompare(da) || b.id - a.id;
        }),
    [payments, month]
  );

  const summary = useMemo(() => {
    let totalCents = 0;
    let cashCents = 0;
    let transferCents = 0;
    for (const p of monthPayments) {
      totalCents += p.amount_cents;
      if (p.method === "cash") cashCents += p.amount_cents;
      else transferCents += p.amount_cents;
    }
    return {
      count: monthPayments.length,
      totalCents,
      cashCents,
      transferCents,
    };
  }, [monthPayments]);

  const paymentsPage = usePagination(monthPayments, 15, month);

  return (
    <section className="panel">
      <div className="panel-heading payments-panel-heading">
        <div>
          <h3>Pagos del mes</h3>
          <p>
            Ingresos por membresías y pagos por visita al registrar usuarios ({monthLabel(month)}).
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

      <div className="stats-grid payments-summary">
        <Stat
          icon={<Wallet />}
          label="Total del mes"
          value={money(summary.totalCents)}
          tone="green"
        />
        <Stat
          icon={<ListOrdered />}
          label="Pagos registrados"
          value={String(summary.count)}
          tone="blue"
        />
        <Stat
          icon={<Banknote />}
          label="En efectivo"
          value={money(summary.cashCents)}
          tone="orange"
        />
        <Stat
          icon={<Wallet />}
          label="Transferencias"
          value={money(summary.transferCents)}
          tone="purple"
        />
      </div>

      <h4 className="subsection-title">Detalle de {monthLabel(month)}</h4>

      {monthPayments.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Tipo</th>
                <th>Fecha</th>
                <th>Método</th>
                <th className="right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {paymentsPage.slice.map((p) => (
                <tr key={p.id}>
                  <td>{p.member_name}</td>
                  <td>
                    <span className="pill">{p.concept}</span>
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
          <TablePagination
            page={paymentsPage.page}
            totalPages={paymentsPage.totalPages}
            total={paymentsPage.total}
            from={paymentsPage.from}
            to={paymentsPage.to}
            onPageChange={paymentsPage.setPage}
          />
        </div>
      ) : (
        <Empty
          text={
            payments.length
              ? `No hay ingresos en ${monthLabel(month)}.`
              : "Aún no hay ingresos. Se generan al registrar usuarios con precio (membresía o visita)."
          }
        />
      )}
    </section>
  );
}

function dateOnlySortKey(value: string) {
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}