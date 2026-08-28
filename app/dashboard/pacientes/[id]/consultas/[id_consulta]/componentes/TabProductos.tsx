"use client";

import { useEffect, useState } from "react";
import {
  getConsultaProductos,
  getProductosCatalogo,
  ConsultaProductoExtended,
} from "../actions";
import { ISaleProduct } from "@/app/dashboard/ventas/actions";
import AddProductoForm from "./AddProductoForm";
import ProductoRow from "./ProductoRow";

interface Props {
  id_consulta:   number;
  locked?:       boolean;
  onContinuar?:  () => void;
  onTotalChange?: (total: number) => void;
}

const HEADERS = ["Producto", "Cantidad", "Precio unit.", "Subtotal", ""];

export default function TabProductos({ id_consulta, locked, onContinuar, onTotalChange }: Props) {
  const [productos, setProductos] = useState<ConsultaProductoExtended[]>([]);
  const [catalogo,  setCatalogo ] = useState<ISaleProduct[]>([]);
  const [loading,   setLoading  ] = useState(true);
  const [error,     setError    ] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getConsultaProductos(id_consulta),
      getProductosCatalogo(id_consulta),
    ]).then(([cp, cat]) => {
      if (cancelled) return;
      setProductos(cp);
      setCatalogo(cat);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setError("Error al cargar los productos");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id_consulta]);

  const total = productos.reduce((s, p) => s + Number(p.precio) * Number(p.cantidad), 0);

  // Report products total to parent whenever the list changes
  useEffect(() => {
    onTotalChange?.(total);
  }, [productos]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <p className="text-zinc-400 text-sm">Cargando productos…</p>;
  if (error)   return <p className="text-sm text-red-500">{error}</p>;

  if (catalogo.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Debe agregar productos al stock</p>;
  }

  return (
    <div className="space-y-4">
      {!locked && (
        <AddProductoForm
          id_consulta={id_consulta}
          catalogo={catalogo}
          onAdd={(p) => setProductos((prev) => [...prev, p])}
        />
      )}

      {productos.length === 0 ? (
        <p className="text-zinc-400 text-sm">Sin productos registrados.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">
              <thead className="bg-zinc-100 dark:bg-zinc-800">
                <tr>
                  {HEADERS.map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700 bg-white dark:bg-zinc-900">
                {productos.map((p) => (
                  <ProductoRow
                    key={p.id_consulta_producto}
                    producto={p}
                    onUpdate={(updated) =>
                      setProductos((prev) =>
                        prev.map((x) => x.id_consulta_producto === updated.id_consulta_producto ? updated : x)
                      )
                    }
                    onDelete={(id) =>
                      setProductos((prev) => prev.filter((x) => x.id_consulta_producto !== id))
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-right text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Total productos: ${total.toFixed(2)}
          </p>
        </>
      )}

      {!locked && onContinuar && (
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onContinuar}
            className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors dark:bg-zinc-600 dark:hover:bg-zinc-500"
          >
            Continuar
          </button>
        </div>
      )}
    </div>
  );
}
