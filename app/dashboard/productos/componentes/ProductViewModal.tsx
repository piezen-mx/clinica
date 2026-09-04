"use client";

import { IProduct } from "@/interfaces/product";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  product:      IProduct;
  categoryName: string;
  supplierName: string;
  /** Nombre legible de la unidad de medida (resuelto fuera del modal, no viene en IProduct). */
  unitName:     string;
  onClose:      () => void;
}

const labelClass = "block text-xs font-semibold text-[#44474f] dark:text-zinc-400 mb-1";
const valueClass = "text-sm text-[#0b1c30] dark:text-zinc-100";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className={labelClass}>{label}</span>
      <p className={valueClass}>{value ?? "—"}</p>
    </div>
  );
}

export default function ProductViewModal({ product, categoryName, supplierName, unitName, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const fmtPrice = (val: number | null) =>
    val === null || val === undefined
      ? "—"
      : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);

  const isVenta = product.id_category === 4;

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-zinc-900 shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-[#c4c6d0] dark:border-zinc-700 px-6 py-4 shrink-0">
          <h3 className="text-lg font-semibold text-[#0b1c30] dark:text-zinc-50">Detalle del producto</h3>
          <button onClick={onClose} className="text-[#747780] hover:text-[#0b1c30] dark:text-zinc-400 dark:hover:text-zinc-200 text-xl leading-none">
            &times;
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4 overflow-y-auto">
          <div className="flex items-center gap-4">
            {product.url_product ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.url_product}
                alt={product.name}
                className="h-32 w-32 rounded-lg object-cover border border-[#c4c6d0] dark:border-zinc-600"
              />
            ) : (
              <div className="h-32 w-32 rounded-lg border border-dashed border-[#c4c6d0] dark:border-zinc-600 flex items-center justify-center text-xs text-[#747780] dark:text-zinc-500 text-center px-1">
                Sin imagen
              </div>
            )}
            <div>
              <p className="text-lg font-semibold text-[#0b1c30] dark:text-zinc-100">{product.name}</p>
              {(product.brand || product.presentation) && (
                <p className="text-sm text-[#44474f] dark:text-zinc-400">
                  {[product.brand, product.presentation].filter(Boolean).join(" / ")}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Categoría" value={categoryName || "—"} />
            <Field label="Marca" value={product.brand || "—"} />
            <Field label="Presentación" value={product.presentation || "—"} />
            <Field label="Unidad de Medida" value={unitName || "—"} />
            <Field label="Talla/Tamaño" value={product.size || "—"} />
            <Field
              label={product.split ? "Precio de Compra (paquete/caja)" : "Precio Unitario"}
              value={fmtPrice(product.price)}
            />
            {isVenta && <Field label="Precio de Venta (pieza)" value={fmtPrice(product.sale_price)} />}
            {isVenta && <Field label="Bono de Venta" value={fmtPrice(product.bono_venta)} />}
            <Field label="No. Producto/Código de Barras" value={product.product_code || "—"} />
            <Field label="Proveedor" value={supplierName || "—"} />
            <Field label={product.split ? "Piezas por Paquete/Caja" : "Piezas por Producto"} value={product.pieces ?? "—"} />
            <Field label="Stock Mínimo" value={product.min_stock ?? "—"} />
            <Field
              label="Consumo automático por consulta"
              value={product.auto_consume ? (product.consumption_per_consultation ?? "—") : "No"}
            />
            <Field label="Activo" value={product.activo ? "Sí" : "No"} />
            <Field label="Dividir Unidad" value={product.split ? "Sí" : "No"} />
            <div className="md:col-span-2">
              <Field label="Descripción" value={product.description || "—"} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#c4c6d0] dark:border-zinc-700 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#c4c6d0] dark:border-zinc-600 px-4 py-2 text-sm font-medium text-[#44474f] dark:text-zinc-300 hover:bg-[#eff4ff] dark:hover:bg-zinc-800 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
