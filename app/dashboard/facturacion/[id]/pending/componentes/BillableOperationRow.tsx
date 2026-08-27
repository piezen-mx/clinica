"use client";

import { useState } from "react";
import type { Customer } from "facturapi";
import { IBillableOperation } from "@/interfaces/organization";
import BillableInvoiceModal from "./BillableInvoiceModal";

interface Props {
  orgId: string;
  operation: IBillableOperation;
  customers: Customer[];
  hasDefaultProduct: boolean;
  isLive: boolean;
  idSucursal: number;
  onInvoiced: () => void;
}

const SOURCE_LABEL: Record<IBillableOperation["source"], string> = {
  consulta: "Consulta",
  tratamiento_revision: "Revisión",
  tratamiento: "Tratamiento",
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);

/** `last_payment_date` es un string de BD ("YYYY-MM-DD HH:mm:ss"); se normaliza antes de parsear, nunca `new Date(dbValue)` directo. */
function formatPaymentDate(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(normalized));
}

export default function BillableOperationRow({
  orgId,
  operation,
  customers,
  hasDefaultProduct,
  isLive,
  idSucursal,
  onInvoiced,
}: Props) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <tr className="hover:bg-[#eff4ff] dark:hover:bg-zinc-800/60 transition-colors">
        <td className="px-6 py-4">
          <div className="font-medium text-[#0b1c30] dark:text-zinc-100">{operation.patient_name}</div>
          {operation.patient_whatsapp && (
            <div className="text-xs text-[#747780] dark:text-zinc-500">{operation.patient_whatsapp}</div>
          )}
        </td>
        <td className="px-6 py-4 text-[#44474f] dark:text-zinc-400">{SOURCE_LABEL[operation.source]}</td>
        <td className="px-6 py-4 text-[#44474f] dark:text-zinc-400">{operation.podologist_name ?? "—"}</td>
        <td className="px-6 py-4 text-[#44474f] dark:text-zinc-400">{formatPaymentDate(operation.last_payment_date)}</td>
        <td className="px-6 py-4 text-right text-[#0b1c30] dark:text-zinc-100">{formatCurrency(operation.total)}</td>
        <td className="px-6 py-4 text-[#44474f] dark:text-zinc-400">{operation.payment_form_label}</td>
        <td className="px-6 py-4 text-right">
          <button
            type="button"
            onClick={() => setShowModal(true)}
            disabled={!hasDefaultProduct}
            title={hasDefaultProduct ? undefined : "Configura un producto por defecto en Personalizar"}
            className="rounded-lg bg-[#0051d5] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0051d5]/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Facturar
          </button>
        </td>
      </tr>

      {showModal && (
        <BillableInvoiceModal
          orgId={orgId}
          operation={operation}
          customers={customers}
          isLive={isLive}
          idSucursal={idSucursal}
          onClose={() => setShowModal(false)}
          onInvoiced={() => {
            setShowModal(false);
            onInvoiced();
          }}
        />
      )}
    </>
  );
}
