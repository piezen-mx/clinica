"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Product } from "facturapi";
import ProductFormModal from "./ProductFormModal";

interface Props {
  orgId: string;
  initialProducts: Product[];
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(price);

/** Tabla + toolbar de productos, siguiendo `EmployeesTable.tsx`. Sin buscador propio (el original tampoco lo tiene). */
export default function ProductsSection({ orgId, initialProducts }: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const openNew = () => {
    setEditingProduct(null);
    setShowModal(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setShowModal(true);
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
          Nuevo producto
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#eff4ff] dark:bg-zinc-800 border-b border-[#c4c6d0] dark:border-zinc-700 text-sm text-[#44474f] dark:text-zinc-400">
              <tr>
                <th className="px-6 py-4 font-semibold">Descripción</th>
                <th className="px-6 py-4 font-semibold">Clave SAT</th>
                <th className="px-6 py-4 font-semibold">Precio</th>
                <th className="px-6 py-4 font-semibold">Unidad</th>
                <th className="px-6 py-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c4c6d0]/50 dark:divide-zinc-700/50">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-[#747780] dark:text-zinc-500">
                    No hay productos en el catálogo
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr
                    key={product.id}
                    className="hover:bg-[#eff4ff] dark:hover:bg-zinc-800/60 transition-colors group"
                  >
                    <td className="px-6 py-4 font-medium text-[#0b1c30] dark:text-zinc-100">
                      {product.description}
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-[#44474f] dark:text-zinc-400">
                      {product.product_key}
                    </td>
                    <td className="px-6 py-4 text-[#0b1c30] dark:text-zinc-100">{formatPrice(product.price)}</td>
                    <td className="px-6 py-4 text-[#44474f] dark:text-zinc-400">{product.unit_name}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(product)}
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
        <ProductFormModal
          orgId={orgId}
          product={editingProduct ?? undefined}
          onClose={() => setShowModal(false)}
          onSaved={(saved, wasEditing) => {
            setProducts((prev) =>
              wasEditing ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev]
            );
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}
