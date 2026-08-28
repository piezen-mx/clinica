"use client";

import { IVenta } from "@/interfaces/venta";
import { deleteVenta } from "../actions";
import { useState } from "react";
import ConfirmModal from "@/app/dashboard/componentes/ConfirmModal";

interface Props {
  venta:     IVenta;
  onEdit:    (v: IVenta) => void;
  onDeleted: () => void;
}

export default function VentaFila({ venta: v, onEdit, onDeleted }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setErrorMsg(null);
    const res = await deleteVenta(v.id_venta);
    if (res.ok) {
      setShowConfirm(false);
      onDeleted();
    } else {
      setErrorMsg(res.message ?? "Error al eliminar");
      setDeleting(false);
    }
  };

  const fmtCurrency = (val: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);

  const fmtDatetime = (val: string) => {
    if (!val) return "—";
    return new Date(val.replace(" ", "T")).toLocaleString("es-MX", {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  // Resumen compacto de las líneas del ticket, ej. "Curitas x2, Alcohol x1".
  const resumenProductos = v.lineas
    .map((linea) => `${linea.nombre_producto ?? `#${linea.id_producto}`} x${linea.cantidad}`)
    .join(", ");

  return (
    <>
      <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 text-sm whitespace-nowrap">
          {fmtDatetime(v.created_at)}
        </td>
        <td className="px-4 py-3 text-zinc-800 dark:text-zinc-100 text-sm">
          {resumenProductos || "—"}
        </td>
        <td className="px-4 py-3 text-zinc-800 dark:text-zinc-100 text-sm">
          {v.descripcion_metodo ?? "—"}
        </td>
        <td className="px-4 py-3 text-zinc-800 dark:text-zinc-100 text-sm font-medium">
          {fmtCurrency(v.total)}
        </td>
        <td className="px-4 py-3 text-sm ">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              v.facturado
                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400"
            }`}
          >
            {v.facturado ? "Sí" : "No"}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => onEdit(v)}
              className="rounded-md bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600 transition-colors"
            >
              Editar
            </button>
            <button
              onClick={() => { setErrorMsg(null); setShowConfirm(true); }}
              className="rounded-md bg-red-100 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/70 transition-colors"
            >
              Eliminar
            </button>
          </div>
        </td>
      </tr>

      {showConfirm && (
        <ConfirmModal
          message={`¿Deseas eliminar el ticket "${resumenProductos || `#${v.id_venta}`}" por ${fmtCurrency(v.total)}? Se marcará como inactivo.`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowConfirm(false)}
          loading={deleting}
          error={errorMsg}
        />
      )}
    </>
  );
}
