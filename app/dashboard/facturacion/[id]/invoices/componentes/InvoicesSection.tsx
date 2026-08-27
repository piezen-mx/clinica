"use client";

import { useState, useTransition } from "react";
import { Search, Plus } from "lucide-react";
import type { Customer, Invoice, Product } from "facturapi";
import { INVOICE_STATUS_OPTIONS } from "@/lib/billing/invoiceCatalogs";
import { listInvoicesAction } from "../actions";
import InvoiceRow from "./InvoiceRow";
import CreateInvoiceModal from "./CreateInvoiceModal";

interface Props {
  orgId: string;
  initialInvoices: Invoice[];
  initialMonth: string;
  customers: Customer[];
  products: Product[];
  isLive: boolean;
}

/**
 * Tabla + toolbar de facturas, ex `InvoicesSection.tsx` (175 líneas), siguiendo el
 * mismo criterio que `CustomersSection.tsx`: mes, estatus y buscador no filtran
 * localmente, delegan en `listInvoicesAction`, que manda los filtros a Facturapi.
 */
export default function InvoicesSection({
  orgId,
  initialInvoices,
  initialMonth,
  customers,
  products,
  isLive,
}: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [month, setMonth] = useState(initialMonth);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [isFiltering, startFiltering] = useTransition();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const runFilter = (overrides: Partial<{ month: string; status: string; q: string }> = {}) => {
    const nextMonth = overrides.month ?? month;
    const nextStatus = overrides.status ?? status;
    const nextQuery = overrides.q ?? search;

    startFiltering(async () => {
      const result = await listInvoicesAction(orgId, { month: nextMonth, status: nextStatus, q: nextQuery });
      if (result.ok) setInvoices(result.data);
    });
  };

  const handleMonthChange = (value: string) => {
    setMonth(value);
    runFilter({ month: value });
  };

  const handleStatusChange = (value: string) => {
    setStatus(value);
    runFilter({ status: value });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") runFilter();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-[#0051d5] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0051d5]/90"
        >
          <Plus size={18} />
          Nueva factura
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-4 flex flex-wrap items-stretch gap-4">
        <input
          type="month"
          value={month}
          onChange={(e) => handleMonthChange(e.target.value)}
          className="rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-[#eff4ff] dark:bg-zinc-800 px-3 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0051d5] focus:border-[#0051d5]"
        />
        <select
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-[#eff4ff] dark:bg-zinc-800 px-3 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0051d5] focus:border-[#0051d5]"
        >
          <option value="">Todos los estatus</option>
          {INVOICE_STATUS_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747780] dark:text-zinc-500"
          />
          <input
            type="text"
            placeholder="Buscar factura…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-[#eff4ff] dark:bg-zinc-800 pl-10 pr-4 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 placeholder-[#747780] dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#0051d5] focus:border-[#0051d5] transition-all"
          />
        </div>
        <button
          type="button"
          onClick={() => runFilter()}
          disabled={isFiltering}
          className="rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-[#0b1c30] dark:text-zinc-100 hover:bg-[#eff4ff] dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          {isFiltering ? "Buscando…" : "Buscar"}
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#eff4ff] dark:bg-zinc-800 border-b border-[#c4c6d0] dark:border-zinc-700 text-sm text-[#44474f] dark:text-zinc-400">
              <tr>
                <th className="px-6 py-4 font-semibold">Folio</th>
                <th className="px-6 py-4 font-semibold">Cliente</th>
                <th className="px-6 py-4 font-semibold">Fecha</th>
                <th className="px-6 py-4 font-semibold">Estatus</th>
                <th className="px-6 py-4 font-semibold text-right">Total</th>
                <th className="px-6 py-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c4c6d0]/50 dark:divide-zinc-700/50">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-6 text-center text-[#747780] dark:text-zinc-500">
                    {isFiltering ? "Buscando…" : "No hay facturas para los filtros seleccionados"}
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <InvoiceRow
                    key={invoice.id}
                    orgId={orgId}
                    invoice={invoice}
                    customers={customers}
                    onCanceled={(updated) =>
                      setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)))
                    }
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <CreateInvoiceModal
          orgId={orgId}
          customers={customers}
          products={products}
          isLive={isLive}
          onClose={() => setShowCreateModal(false)}
          onCreated={(created) => {
            setInvoices((prev) => [created, ...prev]);
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}
