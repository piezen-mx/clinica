"use client";

import { ISucursal } from "@/interfaces/sucursal";
import { deleteSucursal } from "../actions";
import { useState } from "react";
import ConfirmModal from "@/app/dashboard/servicios/componentes/ConfirmModal";
import SucursalCalendariosModal from "./SucursalCalendariosModal";
import SucursalCheckadoresModal from "./SucursalCheckadoresModal";

interface Props {
  sucursal: ISucursal;
  onEdit: (s: ISucursal) => void;
  onDeleted: () => void;
  readOnly?: boolean;
}

export default function SucursalFila({ sucursal: s, onEdit, onDeleted, readOnly }: Props) {
  const [showConfirm, setShowConfirm]         = useState(false);
  const [deleting, setDeleting]               = useState(false);
  const [errorMsg, setErrorMsg]               = useState<string | null>(null);
  const [showCalendariosModal, setShowCalendariosModal] = useState(false);
  const [showChecadoresModal, setShowChecadoresModal]   = useState(false);

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setErrorMsg(null);
    const res = await deleteSucursal(s.id_sucursal);
    if (res.ok) {
      setShowConfirm(false);
      onDeleted();
    } else {
      setErrorMsg(res.message ?? "Error al eliminar");
      setDeleting(false);
    }
  };

  return (
    <>
      <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
        <td className="px-4 py-3 text-zinc-800 dark:text-zinc-100">{s.id_sucursal}</td>
        <td className="px-4 py-3 text-zinc-800 dark:text-zinc-100">{s.nombre}</td>
        <td className="px-4 py-3 text-zinc-800 dark:text-zinc-100">{s.estado ?? "—"}</td>
        <td className="px-4 py-3 text-zinc-800 dark:text-zinc-100">{s.ciudad ?? "—"}</td>
        <td className="px-4 py-3 text-zinc-800 dark:text-zinc-100">{s.direccion ?? "—"}</td>
        <td className="px-4 py-3 text-zinc-800 dark:text-zinc-100">{s.telefono ?? "—"}</td>
        <td className="px-4 py-3 text-zinc-800 dark:text-zinc-100">{s.seats ?? "—"}</td>
        <td className="px-4 py-3 flex gap-2 justify-end">
          {!readOnly && (
            <button
              onClick={() => setShowCalendariosModal(true)}
              className="rounded-md bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600 transition-colors"
            >
              Calendarios
            </button>
          )}
          {!readOnly && (
            <button
              onClick={() => setShowChecadoresModal(true)}
              className="rounded-md bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600 transition-colors"
            >
              Checadores
            </button>
          )}
          {!readOnly && (
            <button
              onClick={() => onEdit(s)}
              className="rounded-md bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600 transition-colors"
            >
              Editar
            </button>
          )}
          {!readOnly && (
            <button
              onClick={() => { setErrorMsg(null); setShowConfirm(true); }}
              className="rounded-md bg-red-100 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/70 transition-colors"
            >
              Eliminar
            </button>
          )}
        </td>
      </tr>

      {showConfirm && (
        <ConfirmModal
          message={`¿Deseas eliminar la sucursal "${s.nombre}"? Esta acción no se puede deshacer.`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowConfirm(false)}
          loading={deleting}
          error={errorMsg}
        />
      )}

      {showCalendariosModal && (
        <SucursalCalendariosModal
          id_sucursal={s.id_sucursal}
          nombreSucursal={s.nombre}
          onClose={() => setShowCalendariosModal(false)}
        />
      )}

      {showChecadoresModal && (
        <SucursalCheckadoresModal
          id_sucursal={s.id_sucursal}
          nombreSucursal={s.nombre}
          onClose={() => setShowChecadoresModal(false)}
        />
      )}
    </>
  );
}
