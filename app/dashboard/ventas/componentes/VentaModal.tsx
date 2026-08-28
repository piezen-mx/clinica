"use client";

import { useState } from "react";
import { IMetodoPago } from "@/interfaces/metodo_pago";
import { VentaForm, ISaleProduct } from "../actions";

interface Props {
  form:                  VentaForm;
  productos:             ISaleProduct[];
  metodosPagos:          IMetodoPago[];
  saving:                boolean;
  error:                 string | null;
  onAddLinea:            (id_producto: number, cantidad: number) => void;
  onRemoveLinea:         (id_producto: number) => void;
  onUpdateLineaCantidad: (id_producto: number, cantidad: number) => void;
  onMetodoPagoChange:    (idMetodoPago: number) => void;
  onSubmit:              (e: React.FormEvent) => void;
  onClose:               () => void;
}

const fmtCurrency = (val: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);

export default function VentaModal({
  form, productos, metodosPagos, saving, error,
  onAddLinea, onRemoveLinea, onUpdateLineaCantidad, onMetodoPagoChange, onSubmit, onClose,
}: Props) {
  const [pickerProductId, setPickerProductId] = useState(0);
  const [pickerCantidad, setPickerCantidad]   = useState(1);

  const findProduct = (id_producto: number) =>
    productos.find((p) => p.id_product === id_producto);

  const total = form.lineas.reduce((acc, linea) => {
    const producto = findProduct(linea.id_producto);
    return acc + linea.cantidad * (producto?.effective_price ?? 0);
  }, 0);

  const handleAddLinea = () => {
    if (pickerProductId === 0 || pickerCantidad <= 0) return;
    onAddLinea(pickerProductId, pickerCantidad);
    setPickerProductId(0);
    setPickerCantidad(1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-zinc-900 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-6 py-4 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-50">
            {form.id_venta === 0 ? "Nueva venta" : "Editar venta"}
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 flex flex-col gap-4">
          {error && (
            <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {/* Agregar producto al carrito */}
          <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Agregar producto</span>
            <div className="flex gap-2">
              <select
                value={pickerProductId}
                onChange={(e) => setPickerProductId(Number(e.target.value))}
                className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
              >
                <option value={0} disabled>Seleccionar producto…</option>
                {productos.map((p) => (
                  <option key={p.id_product} value={p.id_product}>
                    {p.name} — {fmtCurrency(p.effective_price)} ({p.stock_quantity} en stock)
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={pickerCantidad}
                onChange={(e) => setPickerCantidad(Number(e.target.value))}
                className="w-20 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
              <button
                type="button"
                onClick={handleAddLinea}
                disabled={pickerProductId === 0 || pickerCantidad <= 0}
                className="rounded-md bg-zinc-800 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-600 dark:hover:bg-zinc-500 transition-colors disabled:opacity-60"
              >
                + Agregar
              </button>
            </div>
          </div>

          {/* Líneas del carrito */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Productos del ticket
            </span>
            {form.lineas.length === 0 ? (
              <p className="rounded-md bg-zinc-50 dark:bg-zinc-800 px-3 py-4 text-center text-sm text-zinc-400">
                Agrega al menos un producto.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {form.lineas.map((linea) => {
                  const producto = findProduct(linea.id_producto);
                  const stockFaltante = producto ? linea.cantidad - producto.stock_quantity : 0;
                  const showStockWarning = Boolean(producto) && stockFaltante > 0;
                  return (
                    <li
                      key={linea.id_producto}
                      className="flex flex-col gap-1 rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-sm text-zinc-800 dark:text-zinc-100">
                          {producto?.name ?? `#${linea.id_producto}`}
                        </span>
                        <input
                          type="number"
                          min={1}
                          value={linea.cantidad}
                          onChange={(e) =>
                            onUpdateLineaCantidad(linea.id_producto, Number(e.target.value))
                          }
                          className="w-16 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                        />
                        <span className="w-24 text-right text-sm font-medium text-zinc-700 dark:text-zinc-200">
                          {fmtCurrency(linea.cantidad * (producto?.effective_price ?? 0))}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRemoveLinea(linea.id_producto)}
                          className="text-zinc-400 hover:text-red-500 dark:hover:text-red-400 text-lg leading-none"
                          aria-label="Quitar producto"
                        >
                          &times;
                        </button>
                      </div>
                      {showStockWarning && (
                        <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                          ⚠ Stock insuficiente: faltan {stockFaltante} {producto?.unit_code ?? ""} — el stock quedará en negativo.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Método de pago */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Método de pago</span>
            <select
              value={form.idMetodoPago}
              onChange={(e) => onMetodoPagoChange(Number(e.target.value))}
              required
              className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              <option value={0} disabled>Seleccionar método…</option>
              {metodosPagos.map((m) => (
                <option key={m.idMetodoPago} value={m.idMetodoPago}>
                  {m.descripcion}
                </option>
              ))}
            </select>
          </label>

          {/* Total */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total</span>
            <p className="rounded-md bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {fmtCurrency(total)}
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 dark:border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                saving ||
                productos.length === 0 ||
                metodosPagos.length === 0 ||
                form.lineas.length === 0 ||
                form.idMetodoPago === 0
              }
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-600 dark:hover:bg-zinc-500 transition-colors disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
