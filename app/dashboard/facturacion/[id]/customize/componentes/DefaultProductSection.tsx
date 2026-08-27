"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "facturapi";
import { setDefaultProductAction } from "../actions";

interface Props {
  orgId: string;
  products: Product[];
  currentDefaultProductId: string | null;
}

const inputClass =
  "rounded-md border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#0051d5] dark:focus:ring-zinc-400";
const labelClass = "text-xs font-medium text-[#44474f] dark:text-zinc-400";

/**
 * Selector del producto de Facturapi usado como concepto único al facturar
 * cobros desde la pestaña Por facturar (spec 34). Mientras no se elija uno,
 * esa pestaña muestra un aviso y no permite timbrar.
 */
export default function DefaultProductSection({ orgId, products, currentDefaultProductId }: Props) {
  const router = useRouter();
  const [productId, setProductId] = useState(currentDefaultProductId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await setDefaultProductAction(orgId, { productId: productId || null });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Error inesperado al guardar el producto por defecto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-6 shadow-sm flex flex-col gap-6"
    >
      <div>
        <h3 className="text-sm font-bold text-[#0b1c30] dark:text-zinc-100">Producto por defecto</h3>
        <p className="mt-1 text-xs text-[#747780] dark:text-zinc-500">
          Concepto que se usa al facturar cobros de consultas y tratamientos desde la pestaña Por facturar.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {products.length === 0 ? (
        <p className="text-sm text-[#747780] dark:text-zinc-500">
          No hay productos en el catálogo. Da de alta uno en la pestaña Productos para poder elegirlo aquí.
        </p>
      ) : (
        <label className="flex max-w-sm flex-col gap-1">
          <span className={labelClass}>Producto</span>
          <select
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setSaved(false);
            }}
            className={inputClass}
          >
            <option value="">Sin configurar</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.description} — {product.product_key}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#c4c6d0] dark:border-zinc-700">
        {saved && !saving && (
          <span className="text-xs text-[#1a7f37] dark:text-green-400">Guardado</span>
        )}
        <button
          type="submit"
          disabled={saving || products.length === 0}
          className="rounded-lg bg-[#0051d5] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0051d5]/90 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
