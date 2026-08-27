"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { Customer, Invoice, Product } from "facturapi";
import { PAYMENT_FORM_OPTIONS, PAYMENT_METHOD_OPTIONS, CFDI_USE_OPTIONS } from "@/lib/billing/invoiceCatalogs";
import ConfirmModal from "@/app/dashboard/componentes/ConfirmModal";
import { createInvoiceAction } from "../actions";

interface Props {
  orgId: string;
  customers: Customer[];
  products: Product[];
  /** En Live, el submit pasa por una confirmación adicional antes de timbrar. */
  isLive: boolean;
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
}

/**
 * Renglón editable: `quantity` viaja como string mientras se escribe (`money()` la
 * valida en el servidor). `key` es solo para React (renglones agregados/quitados
 * dinámicamente no pueden usar el índice del arreglo como `key`) y nunca se manda
 * al servidor.
 */
interface InvoiceLineFormState {
  key: string;
  product_id: string;
  quantity: string;
}

interface InvoiceFormState {
  customer_id: string;
  lines: InvoiceLineFormState[];
  payment_form: string;
  payment_method: string;
  use: string;
  series: string;
  folio_number: string;
}

const inputClass =
  "rounded-md border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#0051d5] dark:focus:ring-zinc-400";
const labelClass = "text-xs font-medium text-[#44474f] dark:text-zinc-400";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);

function buildEmptyLine(products: Product[]): InvoiceLineFormState {
  return { key: crypto.randomUUID(), product_id: products[0]?.id ?? "", quantity: "1" };
}

function buildEmptyForm(products: Product[]): InvoiceFormState {
  return {
    customer_id: "",
    lines: [buildEmptyLine(products)],
    payment_form: "01",
    payment_method: "PUE",
    use: "G03",
    series: "",
    folio_number: "",
  };
}

/**
 * Alta de factura de ingreso, ex `CreateInvoiceModal.tsx` (465 líneas, el
 * componente más grande del módulo original). Comportamiento nuevo respecto al
 * original: **en modo Live, el submit pasa por una confirmación** que muestra
 * cliente, RFC receptor y total antes de timbrar — el original dispara
 * `createInvoiceAction` directamente en `handleSubmit` (`:186-198`), sin ningún
 * paso intermedio.
 */
export default function CreateInvoiceModal({ orgId, customers, products, isLive, onClose, onCreated }: Props) {
  const router = useRouter();

  const [form, setForm] = useState<InvoiceFormState>(buildEmptyForm(products));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLiveConfirm, setShowLiveConfirm] = useState(false);

  const updateLine = (key: string, field: "product_id" | "quantity", value: string) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.key === key ? { ...line, [field]: value } : line)),
    }));
  };

  const addLine = () => {
    setForm((prev) => ({ ...prev, lines: [...prev.lines, buildEmptyLine(products)] }));
  };

  const removeLine = (key: string) => {
    setForm((prev) => ({ ...prev, lines: prev.lines.filter((line) => line.key !== key) }));
  };

  const selectedCustomer = customers.find((customer) => customer.id === form.customer_id);

  /** Estimado en pantalla, sin impuestos: el total real lo calcula Facturapi al timbrar. */
  const estimatedTotal = form.lines.reduce((sum, line) => {
    const product = products.find((p) => p.id === line.product_id);
    const quantity = Number(line.quantity);
    if (!product || !Number.isFinite(quantity)) return sum;
    return sum + product.price * quantity;
  }, 0);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await createInvoiceAction(orgId, {
        customer_id: form.customer_id,
        lines: form.lines.map((line) => ({ product_id: line.product_id, quantity: line.quantity })),
        payment_form: form.payment_form,
        payment_method: form.payment_method,
        use: form.use,
        series: form.series.trim() || null,
        folio_number: form.folio_number.trim() || null,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
      onCreated(result.data);
    } catch {
      setError("Error inesperado al crear la factura");
    } finally {
      setSaving(false);
      setShowLiveConfirm(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isLive) {
      setShowLiveConfirm(true);
      return;
    }
    void submit();
  };

  const canSubmit = customers.length > 0 && products.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-zinc-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#c4c6d0] dark:border-zinc-700 px-6 py-4 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <h3 className="text-lg font-semibold text-[#0b1c30] dark:text-zinc-50">Nueva factura</h3>
          <button
            onClick={onClose}
            className="text-[#747780] hover:text-[#0b1c30] dark:text-zinc-400 dark:hover:text-zinc-200 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-6">
          {error && (
            <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {!canSubmit && (
            <p className="rounded-md bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
              Se necesita al menos un cliente y un producto registrados para poder facturar.
            </p>
          )}

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Cliente *</span>
            <select
              value={form.customer_id}
              onChange={(e) => setForm((prev) => ({ ...prev, customer_id: e.target.value }))}
              required
              className={inputClass}
            >
              <option value="" disabled>
                Selecciona un cliente…
              </option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.legal_name} — {customer.tax_id}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className={labelClass}>Renglones *</span>
              <button
                type="button"
                onClick={addLine}
                className="flex items-center gap-1 text-xs font-semibold text-[#0051d5] dark:text-blue-400 hover:underline"
              >
                <Plus size={14} />
                Agregar renglón
              </button>
            </div>

            {form.lines.map((line) => (
              <div key={line.key} className="flex items-end gap-2">
                <label className="flex flex-1 flex-col gap-1">
                  <span className={labelClass}>Producto</span>
                  <select
                    value={line.product_id}
                    onChange={(e) => updateLine(line.key, "product_id", e.target.value)}
                    required
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Selecciona un producto…
                    </option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.description} — {formatCurrency(product.price)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex w-24 flex-col gap-1">
                  <span className={labelClass}>Cantidad</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, "quantity", e.target.value)}
                    required
                    className={inputClass}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  disabled={form.lines.length === 1}
                  title="Quitar renglón"
                  className="rounded-md p-2 text-[#ba1a1a] hover:bg-[#ba1a1a]/10 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Forma de pago *</span>
              <select
                value={form.payment_form}
                onChange={(e) => setForm((prev) => ({ ...prev, payment_form: e.target.value }))}
                required
                className={inputClass}
              >
                {PAYMENT_FORM_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Método de pago *</span>
              <select
                value={form.payment_method}
                onChange={(e) => setForm((prev) => ({ ...prev, payment_method: e.target.value }))}
                required
                className={inputClass}
              >
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={labelClass}>Uso del CFDI *</span>
              <select
                value={form.use}
                onChange={(e) => setForm((prev) => ({ ...prev, use: e.target.value }))}
                required
                className={inputClass}
              >
                {CFDI_USE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Serie</span>
              <input
                type="text"
                value={form.series}
                onChange={(e) => setForm((prev) => ({ ...prev, series: e.target.value }))}
                placeholder="Opcional"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Folio</span>
              <input
                type="number"
                min="1"
                step="1"
                value={form.folio_number}
                onChange={(e) => setForm((prev) => ({ ...prev, folio_number: e.target.value }))}
                placeholder="Opcional, lo asigna Facturapi si se deja vacío"
                className={inputClass}
              />
            </label>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-[#eff4ff] dark:bg-zinc-800 px-4 py-3">
            <span className="text-sm font-medium text-[#44474f] dark:text-zinc-400">Total estimado (sin impuestos)</span>
            <span className="text-lg font-bold text-[#0b1c30] dark:text-zinc-50">{formatCurrency(estimatedTotal)}</span>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-[#c4c6d0] dark:border-zinc-700">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-[#c4c6d0] dark:border-zinc-600 px-4 py-2 text-sm font-medium text-[#44474f] dark:text-zinc-300 hover:bg-[#eff4ff] dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !canSubmit}
              className="rounded-lg bg-[#0051d5] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0051d5]/90 disabled:opacity-50"
            >
              {saving ? "Timbrando…" : "Crear factura"}
            </button>
          </div>
        </form>
      </div>

      {showLiveConfirm && (
        <ConfirmModal
          message={
            selectedCustomer
              ? `Modo Live: se timbrará un comprobante fiscal real ante el SAT para "${selectedCustomer.legal_name}" (RFC ${selectedCustomer.tax_id}) por un total estimado de ${formatCurrency(estimatedTotal)}. No se puede deshacer, solo cancelar con motivo. ¿Continuar?`
              : "Modo Live: se timbrará un comprobante fiscal real ante el SAT. No se puede deshacer, solo cancelar con motivo. ¿Continuar?"
          }
          confirmLabel="Timbrar en Live"
          loading={saving}
          error={error}
          onConfirm={submit}
          onCancel={() => setShowLiveConfirm(false)}
        />
      )}
    </div>
  );
}
