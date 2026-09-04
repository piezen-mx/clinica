"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import { usePurchaseCart } from "@/contexts/PurchaseCartContext";
import { useSucursal } from "@/contexts/SucursalContext";
import { getSuppliers } from "@/app/dashboard/proveedores/actions";
import { getUnitsMeasurement } from "@/app/dashboard/productos/actions";
import { getMetodosPagos } from "@/app/dashboard/ventas/actions";
import { round2 } from "@/utils/number_helper";
import { createPurchaseOrders } from "../../actions";
import { ISupplier } from "@/interfaces/supplier";
import { IUnitMeasurement } from "@/interfaces/unit_measurement";
import { IMetodoPago } from "@/interfaces/metodo_pago";
import SupplierOrderGroup from "./componentes/SupplierOrderGroup";

const TAX_RATE = 16;

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export default function RevisionOrdenPage() {
  const router = useRouter();
  const { selectedId } = useSucursal();
  const {
    lines,
    estimatedDate,
    notes,
    paymentMethodBySupplier,
    shippingCostBySupplier,
    isHydrated,
    setSupplierPaymentMethod,
    setSupplierShippingCost,
    clearCart,
  } = usePurchaseCart();

  const [suppliers, setSuppliers]         = useState<ISupplier[]>([]);
  const [units, setUnits]                 = useState<IUnitMeasurement[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<IMetodoPago[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  // clearCart() tras generar la orden vacía el carrito en esta misma página; sin este
  // flag, el guard de "carrito vacío" de abajo se dispara y compite con la navegación
  // a /dashboard/pedidos, ganando la carrera y dejando al usuario en /nuevo otra vez.
  const hasSubmittedRef = useRef(false);

  useEffect(() => {
    getSuppliers().then(setSuppliers);
    getUnitsMeasurement().then(setUnits);
    getMetodosPagos().then(setPaymentMethods);
  }, []);

  useEffect(() => {
    if (isHydrated && lines.length === 0 && !hasSubmittedRef.current) {
      router.replace("/dashboard/pedidos/nuevo");
    }
  }, [isHydrated, lines.length, router]);

  const unitNameById = useMemo(
    () => new Map(units.map((u) => [u.id_unit_measurement, u.name])),
    [units]
  );
  const supplierNameById = useMemo(
    () => new Map(suppliers.map((s) => [s.id_proveedor, s.nombre_corto])),
    [suppliers]
  );

  const groupedBySupplier = useMemo(() => {
    const groups = new Map<string, typeof lines>();
    for (const line of lines) {
      const key = line.id_supplier === null ? "sin-proveedor" : String(line.id_supplier);
      const existing = groups.get(key) ?? [];
      existing.push(line);
      groups.set(key, existing);
    }
    return groups;
  }, [lines]);

  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
  const tax = lines.reduce(
    (sum, line) =>
      sum +
      ((line.applies_iva ?? true) ? round2((line.quantity * line.unit_price * TAX_RATE) / 100) : 0),
    0
  );
  const shipping = Array.from(groupedBySupplier.keys()).reduce(
    (sum, key) => (key === "sin-proveedor" ? sum : sum + (shippingCostBySupplier[Number(key)] ?? 0)),
    0
  );
  const total = subtotal + tax + shipping;
  const hasLineWithoutSupplier = lines.some((line) => line.id_supplier === null);
  const hasSupplierWithoutPaymentMethod = Array.from(groupedBySupplier.keys()).some(
    (key) => key !== "sin-proveedor" && !paymentMethodBySupplier[Number(key)]
  );

  const handleGenerateOrder = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await createPurchaseOrders({
        id_sucursal: selectedId,
        estimated_date: estimatedDate || null,
        notes,
        lines: lines.map((line) => ({
          id_product: line.id_product,
          id_supplier: line.id_supplier,
          quantity: line.quantity,
          unit_price: line.unit_price,
          applies_iva: line.applies_iva ?? true,
        })),
        paymentMethodBySupplier,
        shippingCostBySupplier,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      hasSubmittedRef.current = true;
      clearCart();
      router.push("/dashboard/pedidos");
    } catch {
      setError("Error inesperado al generar la orden de compra");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isHydrated || lines.length === 0) {
    return <p className="text-[#44474f] dark:text-zinc-400">Cargando…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/pedidos/nuevo"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#44474f] dark:text-zinc-400 hover:text-[#0051d5] transition-colors mb-2"
        >
          <ArrowLeft size={16} />
          Volver a Pedidos
        </Link>
        <h2 className="text-2xl font-bold text-[#0b1c30] dark:text-zinc-50">Revisión de Orden</h2>
        <p className="text-sm text-[#44474f] dark:text-zinc-400 mt-1">
          Revisa los productos, ajusta las cantidades necesarias y confirma la orden de compra.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 flex flex-col gap-8">
          {Array.from(groupedBySupplier.entries()).map(([key, supplierLines]) => {
            const id_supplier = key === "sin-proveedor" ? null : Number(key);
            const supplierName =
              id_supplier !== null
                ? supplierNameById.get(id_supplier) ?? "Proveedor sin nombre"
                : "Sin proveedor asignado";
            return (
              <SupplierOrderGroup
                key={key}
                supplierName={supplierName}
                lines={supplierLines}
                suppliers={suppliers}
                unitNameById={unitNameById}
                paymentMethods={paymentMethods}
                selectedPaymentMethodId={id_supplier !== null ? paymentMethodBySupplier[id_supplier] ?? null : null}
                onPaymentMethodChange={
                  id_supplier !== null
                    ? (idMetodoPago) => setSupplierPaymentMethod(id_supplier, idMetodoPago)
                    : undefined
                }
                shippingCost={id_supplier !== null ? shippingCostBySupplier[id_supplier] ?? 0 : 0}
                onShippingCostChange={
                  id_supplier !== null
                    ? (value) => setSupplierShippingCost(id_supplier, value)
                    : undefined
                }
              />
            );
          })}
        </div>

        <div className="xl:col-span-4">
          <div className="sticky top-6 flex flex-col gap-6">
            <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-[#0b1c30] dark:text-zinc-50 mb-6 border-b border-[#c4c6d0] dark:border-zinc-700 pb-4">
                Resumen del pedido
              </h3>
              <div className="space-y-4 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-[#44474f] dark:text-zinc-400">Productos seleccionados</span>
                  <span className="font-semibold text-[#0b1c30] dark:text-zinc-100">{lines.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#44474f] dark:text-zinc-400">Órdenes a generar</span>
                  <span className="font-semibold text-[#0b1c30] dark:text-zinc-100">
                    {groupedBySupplier.size}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#44474f] dark:text-zinc-400">Subtotal</span>
                  <span className="font-semibold text-[#0b1c30] dark:text-zinc-100">
                    {currencyFormatter.format(subtotal)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#44474f] dark:text-zinc-400">IVA ({TAX_RATE}%)</span>
                  <span className="font-semibold text-[#0b1c30] dark:text-zinc-100">
                    {currencyFormatter.format(tax)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#44474f] dark:text-zinc-400">Envío</span>
                  <span className="font-semibold text-[#0b1c30] dark:text-zinc-100">
                    {currencyFormatter.format(shipping)}
                  </span>
                </div>
                <div className="pt-4 mt-4 border-t border-dashed border-[#c4c6d0] dark:border-zinc-700 flex justify-between items-center">
                  <span className="font-bold text-[#0b1c30] dark:text-zinc-100">Total estimado</span>
                  <span className="text-lg font-bold text-[#0051d5] dark:text-blue-400">
                    {currencyFormatter.format(total)}{" "}
                    <span className="text-xs font-medium text-[#44474f] dark:text-zinc-400">MXN</span>
                  </span>
                </div>
              </div>
              {error && (
                <p className="text-sm text-[#ba1a1a] dark:text-red-400 mt-4">{error}</p>
              )}

              <div className="mt-8">
                <button
                  disabled={submitting || hasLineWithoutSupplier || hasSupplierWithoutPaymentMethod}
                  title={
                    hasLineWithoutSupplier
                      ? "Asigna un proveedor a cada línea antes de generar la orden"
                      : hasSupplierWithoutPaymentMethod
                      ? "Asigna un método de pago a cada proveedor antes de generar la orden"
                      : undefined
                  }
                  onClick={handleGenerateOrder}
                  className="w-full bg-[#0051d5] text-white py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                  {submitting ? "Generando…" : "Generar Orden de Compra"}
                </button>
                {hasLineWithoutSupplier && (
                  <p className="text-xs text-[#747780] dark:text-zinc-500 mt-2 text-center">
                    Asigna un proveedor a cada línea antes de continuar.
                  </p>
                )}
                {!hasLineWithoutSupplier && hasSupplierWithoutPaymentMethod && (
                  <p className="text-xs text-[#747780] dark:text-zinc-500 mt-2 text-center">
                    Asigna un método de pago a cada proveedor antes de continuar.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
