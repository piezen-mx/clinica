"use client";

import { IProduct } from "@/interfaces/product";
import { deleteProduct } from "../actions";
import { useState } from "react";
import { Eye, Pencil, Trash2 } from "lucide-react";
import ConfirmModal from "@/app/dashboard/componentes/ConfirmModal";
import ProductViewModal from "./ProductViewModal";

interface Props {
  product: IProduct;
  categoryName: string;
  supplierName: string;
  unitName: string;
  onEdit: (product: IProduct) => void;
  onDeleted: () => void;
}

export default function ProductRow({ product, categoryName, supplierName, unitName, onEdit, onDeleted }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showView, setShowView]       = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setErrorMsg(null);
    const res = await deleteProduct(product.id_product);
    if (res.ok) {
      setShowConfirm(false);
      onDeleted();
    } else {
      setErrorMsg(res.message ?? "Error al eliminar");
      setDeleting(false);
    }
  };

  const fmtPrice = (val: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val ?? 0);

  return (
    <>
      <tr className="border-b border-[#c4c6d0] dark:border-zinc-700 hover:bg-[#eff4ff]/50 dark:hover:bg-zinc-800/50 transition-colors">
        <td className="px-6 py-4 text-[#44474f] dark:text-zinc-400">{product.product_code || "—"}</td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#0b1c30] dark:text-zinc-100">{product.name}</span>
          </div>
          {(product.brand || product.presentation) && (
            <div className="text-xs text-[#44474f] dark:text-zinc-400">
              {[product.brand, product.presentation].filter(Boolean).join(" / ")}
            </div>
          )}
        </td>
        <td className="px-6 py-4">
          {categoryName ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#dce9ff] text-[#44474f] border border-[#c4c6d0] dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700">
              {categoryName}
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="px-6 py-4 text-[#44474f] dark:text-zinc-400">{supplierName || "—"}</td>
        <td className="px-6 py-4 text-right font-medium text-[#0b1c30] dark:text-zinc-100">
          {fmtPrice(product.price)}
        </td>
        <td className="px-6 py-4 text-[#44474f] dark:text-zinc-400">{product.size || "—"}</td>
        <td className="px-6 py-4 text-[#44474f] dark:text-zinc-400">{product.min_stock ?? "—"}</td>
        {/* <td className="px-6 py-4 text-[#44474f] dark:text-zinc-400">
          {product.auto_consume ? product.consumption_per_consultation : "—"}
        </td> */}
        <td className="px-6 py-4">
          {product.activo ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#009c6b]/10 text-[#009c6b] border border-[#009c6b]/20 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
              Activo
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#d3e4fe] text-[#44474f] border border-[#c4c6d0] dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700">
              Inactivo
            </span>
          )}
        </td>
        <td className="px-6 py-4 text-right">
          <div className="flex justify-end gap-1">
            <button
              onClick={() => setShowView(true)}
              title="Ver"
              className="p-2 rounded-full hover:bg-[#dce9ff] dark:hover:bg-zinc-700 text-[#44474f] dark:text-zinc-400 transition-colors"
            >
              <Eye size={18} />
            </button>
            <button
              onClick={() => onEdit(product)}
              title="Editar"
              className="p-2 rounded-full hover:bg-[#dce9ff] dark:hover:bg-zinc-700 text-[#44474f] dark:text-zinc-400 transition-colors"
            >
              <Pencil size={18} />
            </button>
            <button
              onClick={() => { setErrorMsg(null); setShowConfirm(true); }}
              title="Eliminar"
              className="p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/40 text-[#44474f] dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </td>
      </tr>

      {showConfirm && (
        <ConfirmModal
          message={`¿Deseas eliminar el producto "${product.name}"? Esta acción no se puede deshacer.`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowConfirm(false)}
          loading={deleting}
          error={errorMsg}
        />
      )}

      {showView && (
        <ProductViewModal
          product={product}
          categoryName={categoryName}
          supplierName={supplierName}
          unitName={unitName}
          onClose={() => setShowView(false)}
        />
      )}
    </>
  );
}
