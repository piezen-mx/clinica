"use client";

import { ISuggestedProduct } from "@/interfaces/suggested_product";
import { usePurchaseCart } from "@/contexts/PurchaseCartContext";
import PendingOrderBadge from "./PendingOrderBadge";

interface Props {
  products:          ISuggestedProduct[];
  categoryNameById:  Map<number, string>;
  unitNameById:      Map<number, string>;
}

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export default function SuggestedProductsTable({
  products,
  categoryNameById,
  unitNameById,
}: Props) {
  const {
    lines,
    isProductInCart,
    toggleProduct,
    setLineQuantity,
    setLineUnitPrice,
    setLineAppliesIva,
  } = usePurchaseCart();

  const lineByProduct = new Map(lines.map((line) => [line.id_product, line]));

  return (
    <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead className="bg-[#eff4ff] dark:bg-zinc-800 border-b border-[#c4c6d0] dark:border-zinc-700 text-sm text-[#44474f] dark:text-zinc-400">
            <tr>
              <th className="px-4 py-4 w-12" />
              <th className="px-6 py-4 font-semibold min-w-55">Producto</th>
              <th className="px-6 py-4 font-semibold">Categoría</th>
              <th className="px-4 py-4 font-semibold text-right">Stock</th>
              <th className="px-4 py-4 font-semibold text-right">Stock mín.</th>
              <th className="px-4 py-4 font-semibold text-center">Cantidad a pedir</th>
              <th className="px-4 py-4 font-semibold">Unidad</th>
              <th className="px-4 py-4 font-semibold text-right">Precio unit.</th>
              <th className="px-3 py-4 font-semibold text-center">IVA</th>
              <th className="px-6 py-4 font-semibold text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-6 py-6 text-center text-[#747780] dark:text-zinc-500">
                  Sin productos que coincidan con los filtros
                </td>
              </tr>
            ) : (
              products.map((product) => {
                const checked = isProductInCart(product.id_product);
                const line = lineByProduct.get(product.id_product);
                const quantity = line?.quantity ?? product.suggested_quantity;
                const unitPrice = line?.unit_price ?? product.price;
                const appliesIva = line?.applies_iva ?? true;
                const subtotal = quantity * unitPrice;

                return (
                  <tr
                    key={product.id_product}
                    className="border-b border-[#c4c6d0] dark:border-zinc-700 hover:bg-[#eff4ff]/50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggleProduct(product, e.target.checked)}
                        className="w-4 h-4 accent-[#0051d5]"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-[#0b1c30] dark:text-zinc-100">{product.name}</p>
                      <p className="text-xs text-[#44474f] dark:text-zinc-400">
                        {product.product_code || "—"}
                      </p>
                      {product.has_pending_order && (
                        <div className="mt-1">
                          <PendingOrderBadge folios={product.pending_order_folios} />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {product.id_category && categoryNameById.get(product.id_category) ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#dce9ff] text-[#44474f] border border-[#c4c6d0] dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700">
                          {categoryNameById.get(product.id_category)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      className={`px-4 py-4 text-right font-medium ${
                        product.below_minimum
                          ? "text-[#ba1a1a] dark:text-red-400"
                          : "text-[#009c6b] dark:text-emerald-400"
                      }`}
                    >
                      {product.current_stock}
                    </td>
                    <td className="px-4 py-4 text-right text-[#44474f] dark:text-zinc-400">
                      {product.min_stock_effective ?? "—"}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <input
                        type="number"
                        min={1}
                        step="1"
                        disabled={!checked}
                        value={quantity}
                        onChange={(e) =>
                          setLineQuantity(product.id_product, Math.max(1, Number(e.target.value) || 1))
                        }
                        className="w-20 text-center py-1 border border-[#c4c6d0] dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-[#0b1c30] dark:text-zinc-100 outline-none disabled:opacity-50 focus:ring-1 focus:ring-[#0051d5] focus:border-[#0051d5]"
                      />
                    </td>
                    <td className="px-4 py-4 text-[#44474f] dark:text-zinc-400">
                      {product.id_unit_measurement
                        ? unitNameById.get(product.id_unit_measurement) ?? "—"
                        : "—"}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={!checked}
                        value={unitPrice}
                        onChange={(e) =>
                          setLineUnitPrice(product.id_product, Math.max(0, Number(e.target.value) || 0))
                        }
                        className="w-24 text-right py-1 px-2 border border-[#c4c6d0] dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-[#0b1c30] dark:text-zinc-100 outline-none disabled:opacity-50 focus:ring-1 focus:ring-[#0051d5] focus:border-[#0051d5]"
                      />
                    </td>
                    <td className="px-3 py-4 text-center">
                      <input
                        type="checkbox"
                        disabled={!checked}
                        checked={appliesIva}
                        onChange={(e) => setLineAppliesIva(product.id_product, e.target.checked)}
                        className="w-4 h-4 accent-[#0051d5] disabled:opacity-50"
                      />
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-[#0b1c30] dark:text-zinc-100">
                      {checked ? currencyFormatter.format(subtotal) : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
