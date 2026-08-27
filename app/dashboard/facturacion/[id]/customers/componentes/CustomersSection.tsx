"use client";

import { useState, useTransition } from "react";
import { Search, Plus } from "lucide-react";
import type { Customer } from "facturapi";
import { taxSystemLabel } from "@/lib/billing/taxSystemCatalog";
import { listCustomersAction, searchCustomersAction } from "../actions";
import CustomerModal from "./CustomerModal";

interface Props {
  orgId: string;
  initialCustomers: Customer[];
}

/**
 * Tabla + toolbar de clientes, siguiendo `EmployeesTable.tsx` (búsqueda, botón "Nuevo",
 * tabla con acciones a la derecha). A diferencia de `EmployeesTable`, la búsqueda no es
 * un filtro local: delega en `searchCustomersAction`, que manda `q` a Facturapi.
 */
export default function CustomersSection({ orgId, initialCustomers }: Props) {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [search, setSearch] = useState("");
  const [isSearching, startSearch] = useTransition();

  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const openNew = () => {
    setEditingCustomer(null);
    setShowModal(true);
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setShowModal(true);
  };

  const runSearch = () => {
    startSearch(async () => {
      const query = search.trim();
      const result = query
        ? await searchCustomersAction(orgId, query)
        : await listCustomersAction(orgId);
      if (result.ok) setCustomers(result.data);
    });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") runSearch();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-2 rounded-lg bg-[#0051d5] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0051d5]/90"
        >
          <Plus size={18} />
          Nuevo cliente
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-4 flex items-stretch gap-4">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747780] dark:text-zinc-500"
          />
          <input
            type="text"
            placeholder="Buscar por nombre o RFC…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-[#eff4ff] dark:bg-zinc-800 pl-10 pr-4 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 placeholder-[#747780] dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#0051d5] focus:border-[#0051d5] transition-all"
          />
        </div>
        <button
          type="button"
          onClick={runSearch}
          disabled={isSearching}
          className="rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-[#0b1c30] dark:text-zinc-100 hover:bg-[#eff4ff] dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          {isSearching ? "Buscando…" : "Buscar"}
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#eff4ff] dark:bg-zinc-800 border-b border-[#c4c6d0] dark:border-zinc-700 text-sm text-[#44474f] dark:text-zinc-400">
              <tr>
                <th className="px-6 py-4 font-semibold">Razón social</th>
                <th className="px-6 py-4 font-semibold">RFC</th>
                <th className="px-6 py-4 font-semibold">Régimen fiscal</th>
                <th className="px-6 py-4 font-semibold">Correo</th>
                <th className="px-6 py-4 font-semibold">CP</th>
                <th className="px-6 py-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c4c6d0]/50 dark:divide-zinc-700/50">
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-6 text-center text-[#747780] dark:text-zinc-500">
                    {isSearching ? "Buscando…" : "No hay clientes registrados"}
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="hover:bg-[#eff4ff] dark:hover:bg-zinc-800/60 transition-colors group"
                  >
                    <td className="px-6 py-4 font-medium text-[#0b1c30] dark:text-zinc-100">
                      {customer.legal_name}
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-[#44474f] dark:text-zinc-400">
                      {customer.tax_id}
                    </td>
                    <td className="px-6 py-4 text-[#44474f] dark:text-zinc-400">
                      {taxSystemLabel(customer.tax_system)}
                    </td>
                    <td className="px-6 py-4 text-[#44474f] dark:text-zinc-400">{customer.email}</td>
                    <td className="px-6 py-4 text-[#44474f] dark:text-zinc-400">{customer.address.zip}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(customer)}
                        title="Editar"
                        className="text-[#44474f] dark:text-zinc-400 hover:text-[#0051d5] dark:hover:text-blue-400 p-1.5 rounded-md hover:bg-[#eff4ff] dark:hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <CustomerModal
          orgId={orgId}
          customer={editingCustomer ?? undefined}
          onClose={() => setShowModal(false)}
          onSaved={(saved, wasEditing) => {
            setCustomers((prev) =>
              wasEditing ? prev.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...prev]
            );
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}
