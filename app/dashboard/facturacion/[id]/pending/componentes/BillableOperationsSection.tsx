"use client";

import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import type { Customer } from "facturapi";
import { useSucursal } from "@/contexts/SucursalContext";
import { IBillableOperation } from "@/interfaces/organization";
import { IUser } from "@/interfaces/user";
import { getPodologosBySucursal } from "@/app/dashboard/pacientes/[id]/expediente/actions";
import { addZeroToday } from "@/utils/date_helpper";
import { getBillableOperationsAction } from "../actions";
import BillableOperationRow from "./BillableOperationRow";

interface Props {
  orgId: string;
  customers: Customer[];
  hasDefaultProduct: boolean;
  isLive: boolean;
}

interface FiltersState {
  dateFrom: string;
  dateTo: string;
  idPodologo: string;
  search: string;
}

/** Filtros por defecto: la pestaña abre mostrando solo los cobros del día en curso. */
const getDefaultFilters = (): FiltersState => {
  const today = addZeroToday(new Date());
  return { dateFrom: today, dateTo: today, idPodologo: "", search: "" };
};

const selectClass =
  "rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-[#eff4ff] dark:bg-zinc-800 px-3 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0051d5] focus:border-[#0051d5]";
const filterLabelClass = "text-xs font-medium text-[#44474f] dark:text-zinc-400";

/**
 * Listado + filtros de la pestaña "Por facturar" (spec 34). Depende de
 * `SucursalContext` (estado de cliente), así que la lista se pide por server
 * action al montar y cada vez que cambian filtros o sucursal — no se puede
 * resolver en el Server Component (`page.tsx`), que no conoce la sucursal
 * activa hasta que el cliente hidrata.
 */
export default function BillableOperationsSection({
  orgId,
  customers,
  hasDefaultProduct,
  isLive,
}: Props) {
  const { selectedId: idSucursal } = useSucursal();
  const [operations, setOperations] = useState<IBillableOperation[]>([]);
  const [podologists, setPodologists] = useState<IUser[]>([]);
  const [filters, setFilters] = useState<FiltersState>(getDefaultFilters);
  const [isLoading, startLoading] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /** Solo la parte async — sin tocar `filters`, para poder llamarla desde el `useEffect` sin disparar `setState` síncrono en su cuerpo. */
  const fetchOperations = (activeFilters: FiltersState) => {
    startLoading(async () => {
      const result = await getBillableOperationsAction(orgId, {
        id_sucursal: idSucursal,
        date_from: activeFilters.dateFrom || null,
        date_to: activeFilters.dateTo || null,
        id_podologo: activeFilters.idPodologo ? Number(activeFilters.idPodologo) : null,
        search: activeFilters.search || null,
      });
      if (result.ok) {
        setOperations(result.data);
        setError(null);
      } else {
        setError(result.message);
      }
    });
  };

  const runFilter = (overrides: Partial<FiltersState> = {}) => {
    const next = { ...filters, ...overrides };
    setFilters(next);
    fetchOperations(next);
  };

  useEffect(() => {
    fetchOperations(filters);
    // Los podólogos del filtro son por sucursal (`getPodologosBySucursal`, rol
    // "Podologo" = id_role 2 — no confundir con "Especialista" = id_role 5,
    // que es quien atiende un tratamiento de onicomicosis), así que se vuelven
    // a pedir cada vez que cambia la sucursal activa, igual que el listado.
    getPodologosBySucursal(idSucursal).then(setPodologists);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSucursal]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") runFilter();
  };

  const removeOperation = (source: IBillableOperation["source"], sourceId: number) => {
    setOperations((prev) => prev.filter((op) => !(op.source === source && op.source_id === sourceId)));
  };

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className={filterLabelClass}>Desde</span>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => runFilter({ dateFrom: e.target.value })}
            className={selectClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={filterLabelClass}>Hasta</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => runFilter({ dateTo: e.target.value })}
            className={selectClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={filterLabelClass}>Podólogo</span>
          <select
            value={filters.idPodologo}
            onChange={(e) => runFilter({ idPodologo: e.target.value })}
            className={selectClass}
          >
            <option value="">Todos</option>
            {podologists.map((podologist) => (
              <option key={podologist.id_user} value={podologist.id_user}>
                {podologist.nombre}
              </option>
            ))}
          </select>
        </label>
        <div className="relative flex-1 min-w-[220px]">
          <span className={`${filterLabelClass} block mb-1`}>Paciente o WhatsApp</span>
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747780] dark:text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar…"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              onKeyDown={handleSearchKeyDown}
              className="w-full rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-[#eff4ff] dark:bg-zinc-800 pl-10 pr-4 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 placeholder-[#747780] dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#0051d5] focus:border-[#0051d5] transition-all"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => runFilter()}
          disabled={isLoading}
          className="rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-[#0b1c30] dark:text-zinc-100 hover:bg-[#eff4ff] dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          {isLoading ? "Buscando…" : "Buscar"}
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#eff4ff] dark:bg-zinc-800 border-b border-[#c4c6d0] dark:border-zinc-700 text-sm text-[#44474f] dark:text-zinc-400">
              <tr>
                <th className="px-6 py-4 font-semibold">Paciente</th>
                <th className="px-6 py-4 font-semibold">Origen</th>
                <th className="px-6 py-4 font-semibold">Podólogo</th>
                <th className="px-6 py-4 font-semibold">Último pago</th>
                <th className="px-6 py-4 font-semibold text-right">Total</th>
                <th className="px-6 py-4 font-semibold">Forma de pago</th>
                <th className="px-6 py-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c4c6d0]/50 dark:divide-zinc-700/50">
              {operations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-6 text-center text-[#747780] dark:text-zinc-500">
                    {isLoading ? "Buscando…" : "No hay cobros pendientes de facturar"}
                  </td>
                </tr>
              ) : (
                operations.map((operation) => (
                  <BillableOperationRow
                    key={`${operation.source}-${operation.source_id}`}
                    orgId={orgId}
                    operation={operation}
                    customers={customers}
                    hasDefaultProduct={hasDefaultProduct}
                    isLive={isLive}
                    idSucursal={idSucursal}
                    onInvoiced={() => removeOperation(operation.source, operation.source_id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
