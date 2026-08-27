"use client";

import { useMemo, useState } from "react";
import { Search, Plus } from "lucide-react";
import type { Organization } from "facturapi";
import OrganizationRow from "./OrganizationRow";
import CreateOrganizationModal from "./CreateOrganizationModal";

interface Props {
  organizations: Organization[];
}

export default function OrganizationsTable({ organizations }: Props) {
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filteredOrganizations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return organizations;

    return organizations.filter((org) => {
      const { legal } = org;
      return (
        legal.name?.toLowerCase().includes(query) ||
        legal.legal_name?.toLowerCase().includes(query) ||
        legal.tax_id?.toLowerCase().includes(query)
      );
    });
  }, [organizations, search]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-[#0051d5] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0051d5]/90"
        >
          <Plus size={18} />
          Nueva organización
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-4">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747780] dark:text-zinc-500"
          />
          <input
            type="text"
            placeholder="Buscar por nombre, razón social o RFC…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-[#eff4ff] dark:bg-zinc-800 pl-10 pr-4 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 placeholder-[#747780] dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#0051d5] focus:border-[#0051d5] transition-all"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#eff4ff] dark:bg-zinc-800 border-b border-[#c4c6d0] dark:border-zinc-700 text-sm text-[#44474f] dark:text-zinc-400">
              <tr>
                <th className="px-6 py-4 font-semibold">Nombre comercial</th>
                <th className="px-6 py-4 font-semibold">Razón social</th>
                <th className="px-6 py-4 font-semibold">RFC</th>
                <th className="px-6 py-4 font-semibold">Régimen fiscal</th>
                <th className="px-6 py-4 font-semibold">Ubicación</th>
                <th className="px-6 py-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c4c6d0]/50 dark:divide-zinc-700/50">
              {filteredOrganizations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-6 text-center text-[#747780] dark:text-zinc-500">
                    {organizations.length === 0
                      ? "Aún no hay organizaciones dadas de alta."
                      : "Sin organizaciones que coincidan con la búsqueda"}
                  </td>
                </tr>
              ) : (
                filteredOrganizations.map((org) => <OrganizationRow key={org.id} organization={org} />)
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && <CreateOrganizationModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}
