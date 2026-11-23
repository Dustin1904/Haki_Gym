import { useMemo, useState } from "react";
import { Banknote, CalendarDays, ListOrdered, Package, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Empty } from "../components/Empty";
import { Stat } from "../components/Stat";
import { productCategoryLabel } from "../lib/products";
import {
  currentYearMonth,
  date,
  money,
  monthLabel,
  paymentInMonth,
  paymentMethodLabel,
} from "../lib/format";
import type { Member, Product, ProductCategory, ProductSale } from "../types";

type VentasSectionProps = {
  products: Product[];
  sales: ProductSale[];
  members: Member[];
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
};

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function VentasSection({
  products,
  sales,
  members,
  onRefresh,
  onError,
}: VentasSectionProps) {
  const [month, setMonth] = useState(currentYearMonth);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [saleBusy, setSaleBusy] = useState(false);
  const [catalogBusy, setCatalogBusy] = useState(false);

  const activeProducts = products.filter((p) => p.active && p.price_cents > 0);

  const [saleForm, setSaleForm] = useState({
    product_id: "",
    quantity: "1",
    sale_date: todayIso(),
    method: "cash" as "cash" | "transfer",
    member_id: "",
    notes: "",
  });

  const [productForm, setProductForm] = useState({
    name: "",
    category: "bebidas" as ProductCategory,
    price: "",
    active: false,
  });

  const monthSales = useMemo(
    () =>
      sales
        .filter((s) => paymentInMonth(s.sale_date, month))
        .sort((a, b) => b.sale_date.localeCompare(a.sale_date) || b.id - a.id),
    [sales, month]
  );

  const summary = useMemo(() => {
    let totalCents = 0;
    let cashCents = 0;
    let transferCents = 0;
    let units = 0;
    for (const s of monthSales) {
      totalCents += s.amount_cents;
      units += s.quantity;
      if (s.method === "cash") cashCents += s.amount_cents;
      else transferCents += s.amount_cents;
    }
    return { count: monthSales.length, totalCents, cashCents, transferCents, units };
  }, [monthSales]);

  async function submitSale(e: React.FormEvent) {
    e.preventDefault();
    if (!saleForm.product_id) {
      onError("Selecciona un producto.");
      return;
    }
    setSaleBusy(true);
    onError("");
    try {
      const response = await fetch("/api/product-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: Number(saleForm.product_id),
          quantity: Number(saleForm.quantity),
          sale_date: saleForm.sale_date,
          method: saleForm.method,
          member_id: saleForm.member_id === "" ? null : Number(saleForm.member_id),
          notes: saleForm.notes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo registrar la venta.");
      setSaleForm({
        product_id: "",
        quantity: "1",
        sale_date: todayIso(),
        method: "cash",
        member_id: "",
        notes: "",
      });
      setShowSaleForm(false);
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSaleBusy(false);
    }
  }

  async function submitProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!productForm.name.trim() || productForm.price.trim() === "") {
      onError("Nombre y precio son obligatorios.");
      return;
    }
    setCatalogBusy(true);
    onError("");
    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: productForm.name.trim(),
          category: productForm.category,
          price: Number(productForm.price),
          active: productForm.active,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo crear el producto.");
      setProductForm({ name: "", category: "bebidas", price: "", active: false });
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCatalogBusy(false);
    }
  }

  async function toggleProductActive(p: Product) {
    onError("");
    try {
      const response = await fetch(`/api/products/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !p.active }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar.");
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error inesperado.");
    }
  }

  async function updateProductPrice(p: Product, priceDollars: string) {
    const num = Number(priceDollars);
    if (!Number.isFinite(num) || num < 0) {
      onError("Precio inválido.");
      return;
    }
    onError("");
    try {
      const response = await fetch(`/api/products/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: num }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar el precio.");
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error inesperado.");
    }
  }

  async function deleteSale(id: number) {
    if (!window.confirm("¿Eliminar esta venta del registro?")) return;
    onError("");
    try {
      const response = await fetch(`/api/product-sales/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo eliminar.");
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error inesperado.");
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading payments-panel-heading">
        <div>
          <h3>Ventas de productos</h3>
          <p>
            Define precios en el catálogo (sin valores por defecto). Los ingresos se suman con
            membresías solo en Reportes ({monthLabel(month)}).
          </p>
        </div>
        <div className="panel-heading-actions">
          <button type="button" className="secondary-button" onClick={() => setShowCatalog((v) => !v)}>
            <Package size={16} /> Catálogo
          </button>
          <button type="button" className="primary-button" onClick={() => setShowSaleForm((v) => !v)}>
            <Plus size={16} /> Registrar venta
          </button>
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
      </div>

      <div className="stats-grid payments-summary">
        <Stat
          icon={<ShoppingBag />}
          label="Ventas del mes"
          value={money(summary.totalCents)}
          tone="green"
        />
        <Stat
          icon={<ListOrdered />}
          label="Operaciones"
          value={String(summary.count)}
          tone="blue"
        />
        <Stat
          icon={<Banknote />}
          label="Efectivo"
          value={money(summary.cashCents)}
          tone="orange"
        />
        <Stat
          icon={<ShoppingBag />}
          label="Unidades vendidas"
          value={String(summary.units)}
          tone="purple"
        />
      </div>

      {showSaleForm && (
        <form className="member-form sales-form" onSubmit={submitSale}>
          <p className="form-banner">Nueva venta</p>
          <label>
            Producto *
            <select
              required
              value={saleForm.product_id}
              onChange={(e) => setSaleForm({ ...saleForm, product_id: e.target.value })}
            >
              <option value="">Seleccionar…</option>
              {activeProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {money(p.price_cents)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cantidad *
            <input
              type="number"
              min={1}
              max={999}
              required
              value={saleForm.quantity}
              onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })}
            />
          </label>
          <label>
            Fecha *
            <input
              type="date"
              required
              value={saleForm.sale_date}
              max={todayIso()}
              onChange={(e) => setSaleForm({ ...saleForm, sale_date: e.target.value })}
            />
          </label>
          <label>
            Método de pago *
            <select
              value={saleForm.method}
              onChange={(e) =>
                setSaleForm({ ...saleForm, method: e.target.value as "cash" | "transfer" })
              }
            >
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
            </select>
          </label>
          <label>
            Cliente (opcional)
            <select
              value={saleForm.member_id}
              onChange={(e) => setSaleForm({ ...saleForm, member_id: e.target.value })}
            >
              <option value="">Mostrador / visitante</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.first_name} {m.last_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Notas
            <input
              value={saleForm.notes}
              onChange={(e) => setSaleForm({ ...saleForm, notes: e.target.value })}
            />
          </label>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={() => setShowSaleForm(false)}>
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={saleBusy || !activeProducts.length}>
              {saleBusy ? "Guardando…" : "Guardar venta"}
            </button>
          </div>
        </form>
      )}

      {!activeProducts.length && !showCatalog && (
        <p className="workout-form-hint">
          No hay productos activos. Abre «Catálogo» para activar artículos o agregar nuevos (p. ej. proteínas).
        </p>
      )}

      {showCatalog && (
        <div className="sales-catalog">
          <h4 className="subsection-title">Catálogo</h4>
          <form className="member-form sales-catalog-form" onSubmit={submitProduct}>
            <label>
              Nombre *
              <input
                required
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                placeholder="Ej. Proteína vainilla 2 lb"
              />
            </label>
            <label>
              Categoría *
              <select
                value={productForm.category}
                onChange={(e) =>
                  setProductForm({
                    ...productForm,
                    category: e.target.value as ProductCategory,
                  })
                }
              >
                <option value="bebidas">Bebidas</option>
                <option value="suplementos">Suplementos</option>
                <option value="otros">Otros</option>
              </select>
            </label>
            <label>
              Precio (USD) *
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={productForm.price}
                onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
              />
            </label>
            <label className="form-toggle">
              <input
                type="checkbox"
                checked={productForm.active}
                onChange={(e) => setProductForm({ ...productForm, active: e.target.checked })}
              />
              <span>
                <strong>Disponible para venta</strong>
              </span>
            </label>
            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={catalogBusy}>
                {catalogBusy ? "Guardando…" : "Agregar producto"}
              </button>
            </div>
          </form>

          {products.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th className="right">Precio</th>
                    <th>Estado</th>
                    <th className="right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <ProductRow
                      key={p.id}
                      product={p}
                      onToggleActive={() => void toggleProductActive(p)}
                      onSavePrice={(price) => void updateProductPrice(p, price)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text="Sin productos en el catálogo." />
          )}
        </div>
      )}

      <h4 className="subsection-title">Detalle de {monthLabel(month)}</h4>

      {monthSales.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th className="right">Cant.</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Método</th>
                <th className="right">Total</th>
                <th className="right"> </th>
              </tr>
            </thead>
            <tbody>
              {monthSales.map((s) => (
                <tr key={s.id}>
                  <td>{s.product_name}</td>
                  <td>
                    <span className="pill">{productCategoryLabel(s.product_category)}</span>
                  </td>
                  <td className="right">{s.quantity}</td>
                  <td>{date(s.sale_date)}</td>
                  <td>{s.member_name ?? "Mostrador"}</td>
                  <td>
                    <span className="pill">{paymentMethodLabel(s.method)}</span>
                  </td>
                  <td className="right amount">{money(s.amount_cents)}</td>
                  <td className="right">
                    <button
                      type="button"
                      className="text-button"
                      title="Eliminar venta"
                      onClick={() => void deleteSale(s.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          text={
            sales.length
              ? `No hay ventas de productos en ${monthLabel(month)}.`
              : "Registra la primera venta con «Registrar venta»."
          }
        />
      )}
    </section>
  );
}

function ProductRow({
  product,
  onToggleActive,
  onSavePrice,
}: {
  product: Product;
  onToggleActive: () => void;
  onSavePrice: (price: string) => void;
}) {
  const [priceEdit, setPriceEdit] = useState((product.price_cents / 100).toFixed(2));

  return (
    <tr>
      <td className="member-name">{product.name}</td>
      <td>{productCategoryLabel(product.category)}</td>
      <td className="right">
        <input
          className="inline-price-input"
          type="number"
          min="0"
          step="0.01"
          value={priceEdit}
          onChange={(e) => setPriceEdit(e.target.value)}
          onBlur={() => onSavePrice(priceEdit)}
        />
      </td>
      <td>
        <span className={`status-pill ${product.active ? "active" : "inactive"}`}>
          {product.active ? "Activo" : "Inactivo"}
        </span>
      </td>
      <td className="right">
        <button type="button" className="secondary-button" onClick={onToggleActive}>
          {product.active ? "Desactivar" : "Activar"}
        </button>
      </td>
    </tr>
  );
}