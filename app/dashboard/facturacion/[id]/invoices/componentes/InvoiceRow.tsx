"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Customer, Invoice } from "facturapi";
import { invoiceStatusLabel, CANCELLATION_MOTIVE_OPTIONS } from "@/lib/billing/invoiceCatalogs";
import ConfirmModal from "@/app/dashboard/componentes/ConfirmModal";
import SendEmailModal from "./SendEmailModal";
import { cancelInvoiceAction } from "../actions";

interface Props {
  orgId: string;
  invoice: Invoice;
  customers: Customer[];
  onCanceled: (invoice: Invoice) => void;
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  valid: "bg-[#009c6b]/10 text-[#009c6b] dark:bg-emerald-900/30 dark:text-emerald-400",
  pending: "bg-[#0051d5]/10 text-[#0051d5] dark:bg-blue-900/30 dark:text-blue-400",
  canceled: "bg-[#ba1a1a]/10 text-[#ba1a1a] dark:bg-red-900/30 dark:text-red-400",
  failed: "bg-[#ba1a1a]/10 text-[#ba1a1a] dark:bg-red-900/30 dark:text-red-400",
  draft: "bg-[#44474f]/10 text-[#44474f] dark:bg-zinc-700/50 dark:text-zinc-400",
};

/** `invoice.date` llega como cadena ISO en runtime (el tipo `Date` del SDK no lo es realmente). */
const formatInvoiceDate = (isoDate: unknown) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" }).format(
    new Date(String(isoDate))
  );

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);

/**
 * Un renglón del listado de facturas, ex `InvoiceRow.tsx` (125 líneas). La
 * cancelación reemplaza al `CancelInvoiceModal.tsx` original (107 líneas) por
 * `ConfirmModal` más un selector de motivo inline: se elige el motivo del
 * catálogo del SAT antes de abrir la confirmación, en vez de un modal propio.
 */
export default function InvoiceRow({ orgId, invoice, customers, onCanceled }: Props) {
  const router = useRouter();

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showMotivePicker, setShowMotivePicker] = useState(false);
  const [motive, setMotive] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const isCancelable = invoice.status === "valid" || invoice.status === "pending";
  const badgeClass = STATUS_BADGE_CLASS[invoice.status] ?? STATUS_BADGE_CLASS.draft;
  const pdfUrl = `/api/facturacion/organizations/${orgId}/invoices/${invoice.id}/pdf`;

  const motiveLabel = CANCELLATION_MOTIVE_OPTIONS.find((option) => option.code === motive)?.label ?? motive;

  const handleCancel = async () => {
    setCanceling(true);
    setCancelError(null);
    try {
      const result = await cancelInvoiceAction(orgId, invoice.id, motive);
      if (!result.ok) {
        setCancelError(result.message);
        return;
      }
      router.refresh();
      onCanceled(result.data);
      setShowCancelConfirm(false);
      setShowMotivePicker(false);
      setMotive("");
    } catch {
      setCancelError("Error inesperado al cancelar la factura");
    } finally {
      setCanceling(false);
    }
  };

  return (
    <>
      <tr className="hover:bg-[#eff4ff] dark:hover:bg-zinc-800/60 transition-colors">
        <td className="px-6 py-4 font-mono text-sm text-[#0b1c30] dark:text-zinc-100">
          {invoice.series ? `${invoice.series}-` : ""}
          {invoice.folio_number}
        </td>
        <td className="px-6 py-4 font-medium text-[#0b1c30] dark:text-zinc-100">{invoice.customer.legal_name}</td>
        <td className="px-6 py-4 text-[#44474f] dark:text-zinc-400">{formatInvoiceDate(invoice.date)}</td>
        <td className="px-6 py-4">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
            {invoiceStatusLabel(invoice.status)}
          </span>
        </td>
        <td className="px-6 py-4 text-right font-medium text-[#0b1c30] dark:text-zinc-100">
          {formatCurrency(invoice.total)}
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center justify-end gap-3 text-sm">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#0051d5] dark:text-blue-400 hover:underline"
            >
              PDF
            </a>
            <button
              type="button"
              onClick={() => setShowEmailModal(true)}
              className="font-medium text-[#0051d5] dark:text-blue-400 hover:underline"
            >
              Enviar
            </button>
            {isCancelable && (
              <button
                type="button"
                onClick={() => setShowMotivePicker(true)}
                className="font-medium text-[#ba1a1a] dark:text-red-400 hover:underline"
              >
                Cancelar
              </button>
            )}
          </div>

          {showMotivePicker && (
            <div className="mt-2 flex items-center justify-end gap-2">
              <select
                value={motive}
                onChange={(e) => setMotive(e.target.value)}
                className="rounded-md border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-[#0b1c30] dark:text-zinc-100"
              >
                <option value="" disabled>
                  Motivo de cancelación…
                </option>
                {CANCELLATION_MOTIVE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!motive}
                onClick={() => setShowCancelConfirm(true)}
                className="rounded-md border border-[#ba1a1a]/40 bg-[#ba1a1a]/10 px-2 py-1 text-xs font-semibold text-[#ba1a1a] hover:bg-[#ba1a1a]/20 disabled:opacity-40 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
              >
                Continuar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMotivePicker(false);
                  setMotive("");
                }}
                className="text-xs text-[#747780] dark:text-zinc-500 hover:underline"
              >
                Cancelar selección
              </button>
            </div>
          )}
        </td>
      </tr>

      {showEmailModal && (
        <SendEmailModal
          orgId={orgId}
          invoice={invoice}
          customers={customers}
          onClose={() => setShowEmailModal(false)}
          onSent={() => setShowEmailModal(false)}
        />
      )}

      {showCancelConfirm && (
        <ConfirmModal
          message={`¿Cancelar el comprobante folio ${invoice.folio_number} con motivo "${motiveLabel}"? Esta acción se reporta al SAT y no se puede deshacer.`}
          confirmLabel="Cancelar factura"
          loading={canceling}
          error={cancelError}
          onConfirm={handleCancel}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
    </>
  );
}
