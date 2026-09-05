"use client";

import { Trash2 } from "lucide-react";
import { IPurchaseCartLine, usePurchaseCart } from "@/contexts/PurchaseCartContext";
import { ISupplier } from "@/interfaces/supplier";
import { IMetodoPago } from "@/interfaces/metodo_pago";
import QuantityStepper from "@/app/dashboard/componentes/QuantityStepper";

interface Props {
  supplierName:             string;
  lines:                    IPurchaseCartLine[];
  suppliers:                ISupplier[];
  unitNameById:             Map<number, string>;
  paymentMethods:           IMetodoPago[];
  selectedPaymentMethodId:  number | null;
  /** undefined cuando el grupo no tiene proveedor asignado (no aplica método de pago). */
  onPaymentMethodChange?:   (idMetodoPago: number) => void;
  shippingCost:             number;
  /** undefined cuando el grupo no tiene proveedor asignado (no aplica gasto de envío). */
  onShippingCostChange?:    (value: number) => void;
}

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export default function SupplierOrderGroup({
  supplierName,
  lines,
  suppliers,
  unitNameById,
  paymentMethods,
  selectedPaymentMethodId,
  onPaymentMethodChange,
  shippingCost,
  onShippingCostChange,
}: Props) {
  const { setLineQuantity, setLineUnitPrice, setLineSupplier, setLineAppliesIva, removeLine } =
    usePurchaseCart();

  const groupSubtotal = lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
  const groupTotal = groupSubtotal + (onShippingCostChange ? shippingCost : 0);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h3 className="text-lg font-bold text-[#0b1c30] dark:text-zinc-50">{supplierName}</h3>
        {(onPaymentMethodChange || onShippingCostChange) && (
          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            {onPaymentMethodChange && (
              <div className="flex flex-col gap-1 w-full md:w-56">
                <label className="text-xs text-[#44474f] dark:text-zinc-400">Método de pago</label>
                <select
                  value={selectedPaymentMethodId ?? ""}
                  onChange={(e) => onPaymentMethodChange(Number(e.target.value))}
                  className="rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0051d5] focus:border-[#0051d5]"
                >
                  <option value="" disabled>
                    Selecciona un método
                  </option>
                  {paymentMethods.map((metodo) => (
                    <option key={metodo.idMetodoPago} value={metodo.idMetodoPago}>
                      {metodo.descripcion}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {onShippingCostChange && (
              <div className="flex flex-col gap-1 w-full md:w-40">
                <label className="text-xs text-[#44474f] dark:text-zinc-400">Gasto de envío</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={shippingCost || ""}
                  placeholder="0.00"
                  onChange={(e) =>
                    onShippingCostChange(Math.max(0, Number(e.target.value) || 0))
                  }
                  className="rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-right text-[#0b1c30] dark:text-zinc-100 outline-none focus:ring-1 focus:ring-[#0051d5] focus:border-[#0051d5]"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#c4c6d0] dark:border-zinc-700 bg-[#eff4ff] dark:bg-zinc-800 flex justify-between items-center">
          <h4 className="text-sm font-semibold text-[#0b1c30] dark:text-zinc-100">Productos a comprar</h4>
          <span className="text-xs text-[#44474f] dark:text-zinc-400">
            {lines.length} {lines.length === 1 ? "artículo seleccionado" : "artículos seleccionados"}
          </span>
        </div>
        <div className="divide-y divide-[#c4c6d0] dark:divide-zinc-700">
          {lines.map((line) => {
            const subtotal = line.quantity * line.unit_price;
            return (
              <div
                key={line.id_product}
                className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8 p-6 hover:bg-[#eff4ff]/50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex-1 min-w-[180px]">
                  <h5 className="font-semibold text-[#0b1c30] dark:text-zinc-100">{line.product_name}</h5>
                  <p className="text-xs text-[#44474f] dark:text-zinc-400">
                    {line.product_code || "—"}
                    {line.id_unit_measurement && unitNameById.get(line.id_unit_measurement)
                      ? ` • ${unitNameById.get(line.id_unit_measurement)}`
                      : ""}
                  </p>
                </div>

                <div className="flex flex-col gap-1 w-full md:w-48">
                  <label className="text-xs text-[#44474f] dark:text-zinc-400">Proveedor</label>
                  <select
                    value={line.id_supplier ?? ""}
                    onChange={(e) =>
                      setLineSupplier(
                        line.id_product,
                        e.target.value === "" ? null : Number(e.target.value)
                      )
                    }
                    className="rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0051d5] focus:border-[#0051d5]"
                  >
                    <option value="">Sin proveedor</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id_proveedor} value={supplier.id_proveedor}>
                        {supplier.nombre_corto}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <label className="text-xs text-[#44474f] dark:text-zinc-400">Cantidad</label>
                  <QuantityStepper
                    value={line.quantity}
                    min={1}
                    onChange={(quantity) => setLineQuantity(line.id_product, quantity)}
                  />
                </div>

                <div className="text-right w-24">
                  <p className="text-xs text-[#44474f] dark:text-zinc-400">Unitario</p>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.unit_price}
                    onChange={(e) =>
                      setLineUnitPrice(line.id_product, Math.max(0, Number(e.target.value) || 0))
                    }
                    className="w-24 text-right py-1 px-1 border border-[#c4c6d0] dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-[#0b1c30] dark:text-zinc-100 outline-none focus:ring-1 focus:ring-[#0051d5] focus:border-[#0051d5]"
                  />
                </div>

                <div className="flex flex-col items-center gap-1">
                  <label className="text-xs text-[#44474f] dark:text-zinc-400">Tiene IVA</label>
                  <input
                    type="checkbox"
                    checked={line.applies_iva ?? true}
                    onChange={(e) => setLineAppliesIva(line.id_product, e.target.checked)}
                    className="w-4 h-4 accent-[#0051d5]"
                  />
                </div>

                <div className="text-right w-28">
                  <p className="text-xs text-[#44474f] dark:text-zinc-400">Subtotal</p>
                  <p className="font-semibold text-[#0b1c30] dark:text-zinc-100">
                    {currencyFormatter.format(subtotal)}
                  </p>
                </div>

                <button
                  onClick={() => removeLine(line.id_product)}
                  title="Quitar del pedido"
                  className="p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/40 text-[#44474f] dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors self-start md:self-center"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="px-6 py-4 border-t border-[#c4c6d0] dark:border-zinc-700 bg-[#eff4ff] dark:bg-zinc-800 flex justify-between items-center">
          <span className="text-sm font-semibold text-[#0b1c30] dark:text-zinc-100">
            Total del proveedor
          </span>
          <span className="text-sm font-bold text-[#0051d5] dark:text-blue-400">
            {currencyFormatter.format(groupTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}
