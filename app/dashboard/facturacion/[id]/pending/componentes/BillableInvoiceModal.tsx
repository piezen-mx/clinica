"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { Customer } from "facturapi";
import { CFDI_USE_OPTIONS } from "@/lib/billing/invoiceCatalogs";
import ConfirmModal from "@/app/dashboard/componentes/ConfirmModal";
import { BillableSource, IBillableOperation } from "@/interfaces/organization";
import CustomerFormModal from "../../componentes/CustomerFormModal";
import { createBillableInvoiceAction } from "../actions";

interface Props {
  orgId: string;
  operation: IBillableOperation;
  customers: Customer[];
  /** En Live, el submit pasa por una confirmación adicional antes de timbrar (mismo patrón que `CreateInvoiceModal`, spec 30). */
  isLive: boolean;
  idSucursal: number;
  onClose: () => void;
  onInvoiced: () => void;
}

/** Concepto precargado y editable según el origen de la operación. */
const DEFAULT_DESCRIPTION: Record<BillableSource, string> = {
  consulta: "Consulta podológica",
  tratamiento_revision: "Revisión de especialista",
  tratamiento: "Tratamiento de onicomicosis",
};

const inputClass =
  "rounded-md border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#0051d5] dark:focus:ring-zinc-400";
const labelClass = "text-xs font-medium text-[#44474f] dark:text-zinc-400";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);

/**
 * Modal de timbrado de un cobro (spec 34). Importe y forma de pago se muestran
 * de solo lectura, tomados de `IBillableOperation` (ya calculados por
 * `listBillableOperations` para pintar el renglón) — pero **nunca son lo que se
 * manda a `createBillableInvoiceAction`**: la action los vuelve a recalcular
 * contra la base de datos (`resolveBillableOperation`) antes de timbrar, así
 * que lo que aquí se ve es una vista previa, no el dato que decide el importe.
 *
 * Se abre desde `BillableOperationRow`, que vive dentro de un `<tbody>` — sin
 * portal, el `<div>` de este modal quedaría anidado ahí, HTML inválido que
 * React marca como error de hidratación. `createPortal` a `document.body` lo
 * saca del árbol de la tabla.
 *
 * A diferencia de `ConfirmModal.tsx`, no espera a un `useEffect` de montaje
 * antes de invocar `createPortal`: este componente solo existe en el árbol
 * tras un clic del usuario (`showModal` arranca en `false` en
 * `BillableOperationRow`), nunca durante el render de servidor ni la
 * hidratación inicial, así que `document` ya está disponible la primera vez
 * que se monta.
 */
export default function BillableInvoiceModal({
  orgId,
  operation,
  customers,
  isLive,
  idSucursal,
  onClose,
  onInvoiced,
}: Props) {
  const router = useRouter();

  const [customerList, setCustomerList] = useState<Customer[]>(customers);
  const [customerId, setCustomerId] = useState("");
  const [description, setDescription] = useState(DEFAULT_DESCRIPTION[operation.source]);
  const [use, setUse] = useState("D01");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLiveConfirm, setShowLiveConfirm] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);

  const selectedCustomer = customerList.find((customer) => customer.id === customerId);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await createBillableInvoiceAction(orgId, idSucursal, {
        source: operation.source,
        source_id: operation.source_id,
        customer_id: customerId,
        description,
        use,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
      onInvoiced();
    } catch {
      setError("Error inesperado al timbrar la factura");
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-zinc-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#c4c6d0] dark:border-zinc-700 px-6 py-4 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <h3 className="text-lg font-semibold text-[#0b1c30] dark:text-zinc-50">Facturar cobro</h3>
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

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className={labelClass}>Receptor *</span>
              <button
                type="button"
                onClick={() => setShowNewCustomer(true)}
                className="flex items-center gap-1 text-xs font-semibold text-[#0051d5] dark:text-blue-400 hover:underline"
              >
                <Plus size={14} />
                Nuevo cliente
              </button>
            </div>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
              className={inputClass}
            >
              <option value="" disabled>
                Selecciona un cliente…
              </option>
              {customerList.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.legal_name} — {customer.tax_id}
                </option>
              ))}
            </select>
          </div>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Concepto *</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              maxLength={255}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Uso del CFDI *</span>
            <select value={use} onChange={(e) => setUse(e.target.value)} required className={inputClass}>
              {CFDI_USE_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-2 rounded-lg bg-[#eff4ff] dark:bg-zinc-800 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#44474f] dark:text-zinc-400">Total</span>
              <span className="text-lg font-bold text-[#0b1c30] dark:text-zinc-50">
                {formatCurrency(operation.total)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#44474f] dark:text-zinc-400">Forma de pago</span>
              <span className="text-sm text-[#0b1c30] dark:text-zinc-100">{operation.payment_form_label}</span>
            </div>
            <p className="text-xs text-[#747780] dark:text-zinc-500">
              Pago en una sola exhibición (PUE). El importe y la forma de pago se recalculan al timbrar.
            </p>
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
              disabled={saving || !customerId}
              className="rounded-lg bg-[#0051d5] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0051d5]/90 disabled:opacity-50"
            >
              {saving ? "Timbrando…" : "Facturar"}
            </button>
          </div>
        </form>
      </div>

      {showLiveConfirm && (
        <ConfirmModal
          message={
            selectedCustomer
              ? `Modo Live: se timbrará un comprobante fiscal real ante el SAT para "${selectedCustomer.legal_name}" (RFC ${selectedCustomer.tax_id}) por un total de ${formatCurrency(operation.total)}. No se puede deshacer, solo cancelar con motivo. ¿Continuar?`
              : `Modo Live: se timbrará un comprobante fiscal real ante el SAT por un total de ${formatCurrency(operation.total)}. No se puede deshacer, solo cancelar con motivo. ¿Continuar?`
          }
          confirmLabel="Timbrar en Live"
          loading={saving}
          error={error}
          onConfirm={submit}
          onCancel={() => setShowLiveConfirm(false)}
        />
      )}

      {showNewCustomer && (
        <CustomerFormModal
          orgId={orgId}
          onClose={() => setShowNewCustomer(false)}
          onSaved={(saved) => {
            setCustomerList((prev) => [saved, ...prev]);
            setCustomerId(saved.id);
            setShowNewCustomer(false);
          }}
        />
      )}
    </div>,
    document.body
  );
}
