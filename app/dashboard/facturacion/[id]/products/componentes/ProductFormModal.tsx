"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { Product } from "facturapi";
import { ISatProductSuggestion } from "@/interfaces/organization";
import { createProductAction, updateProductAction } from "../actions";

interface Props {
  orgId: string;
  /** Ausente = modo crear. */
  product?: Product;
  onClose: () => void;
  onSaved: (product: Product, wasEditing: boolean) => void;
}

/** Forma editable del formulario: `price` viaja como string mientras se escribe (`money()` la valida en el servidor). */
interface ProductFormState {
  description: string;
  product_key: string;
  unit_key: string;
  price: string;
  tax_included: boolean;
}

const UNIT_KEYS = [
  { value: "H87", label: "H87 — Pieza" },
  { value: "E48", label: "E48 — Unidad de servicio" },
  { value: "KGM", label: "KGM — Kilogramo" },
  { value: "MTR", label: "MTR — Metro" },
  { value: "LTR", label: "LTR — Litro" },
  { value: "ACT", label: "ACT — Actividad" },
];

const SAT_SEARCH_MIN_LENGTH = 2;
const SAT_SEARCH_DEBOUNCE_MS = 400;

const inputClass =
  "rounded-md border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#0051d5] dark:focus:ring-zinc-400";
const labelClass = "text-xs font-medium text-[#44474f] dark:text-zinc-400";

function buildEmptyForm(): ProductFormState {
  return { description: "", product_key: "", unit_key: "H87", price: "", tax_included: false };
}

function productToForm(product: Product): ProductFormState {
  return {
    description: product.description,
    product_key: product.product_key,
    unit_key: product.unit_key,
    price: String(product.price),
    tax_included: product.tax_included,
  };
}

export default function ProductFormModal({ orgId, product, onClose, onSaved }: Props) {
  const router = useRouter();
  const isEditing = Boolean(product);

  const [form, setForm] = useState<ProductFormState>(product ? productToForm(product) : buildEmptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [satQuery, setSatQuery] = useState("");
  const [satResults, setSatResults] = useState<ISatProductSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Buscador del catálogo SAT: con debounce y mínimo de 2 caracteres, para no consumir
  // cuota de Facturapi por cada pulsación (ver Riesgos, spec 29). Cancela la búsqueda en
  // curso si el usuario sigue escribiendo o el modal se cierra.
  useEffect(() => {
    const query = satQuery.trim();
    if (query.length < SAT_SEARCH_MIN_LENGTH) {
      setSatResults([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const url = `/api/facturacion/catalogs/products?orgId=${encodeURIComponent(orgId)}&q=${encodeURIComponent(query)}`;
        const res = await fetch(url, { signal: controller.signal });
        const json = await res.json();
        setSatResults(res.ok && json.ok ? json.data : []);
      } catch {
        if (!controller.signal.aborted) setSatResults([]);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, SAT_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [satQuery, orgId]);

  const handleField = (field: keyof ProductFormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const selectSatProduct = (item: ISatProductSuggestion) => {
    setForm((prev) => ({ ...prev, product_key: item.key }));
    setSatResults([]);
    setSatQuery("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result =
        isEditing && product
          ? await updateProductAction(orgId, product.id, form)
          : await createProductAction(orgId, form);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
      onSaved(result.data, isEditing);
    } catch {
      setError("Error inesperado al guardar el producto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-zinc-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#c4c6d0] dark:border-zinc-700 px-6 py-4 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <h3 className="text-lg font-semibold text-[#0b1c30] dark:text-zinc-50">
            {isEditing ? "Editar producto" : "Nuevo producto"}
          </h3>
          <button
            onClick={onClose}
            className="text-[#747780] hover:text-[#0b1c30] dark:text-zinc-400 dark:hover:text-zinc-200 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-6">
          {error && (
            <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Descripción *</span>
            <input
              type="text"
              value={form.description}
              onChange={(e) => handleField("description", e.target.value)}
              required
              placeholder="Servicio de consultoría"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Buscar clave SAT</span>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747780] dark:text-zinc-500"
              />
              <input
                type="text"
                value={satQuery}
                onChange={(e) => setSatQuery(e.target.value)}
                placeholder="ej. servicios de software (mínimo 2 caracteres)"
                className={`${inputClass} w-full pl-9`}
              />
            </div>
            {isSearching && <span className="text-xs text-[#747780] dark:text-zinc-500">Buscando…</span>}
            {satResults.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-md border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm shadow-md">
                {satResults.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-[#eff4ff] dark:hover:bg-zinc-700"
                      onClick={() => selectSatProduct(item)}
                    >
                      <span className="font-mono font-medium text-[#0b1c30] dark:text-zinc-100">{item.key}</span>
                      <span className="ml-2 text-[#44474f] dark:text-zinc-400">{item.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Clave SAT *</span>
              <input
                type="text"
                value={form.product_key}
                onChange={(e) => handleField("product_key", e.target.value)}
                required
                placeholder="81112500"
                className={`${inputClass} font-mono`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Precio (MXN) *</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => handleField("price", e.target.value)}
                required
                placeholder="0.00"
                className={inputClass}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Unidad *</span>
            <select
              value={form.unit_key}
              onChange={(e) => handleField("unit_key", e.target.value)}
              required
              className={inputClass}
            >
              {UNIT_KEYS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.tax_included}
              onChange={(e) => handleField("tax_included", e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border border-[#c4c6d0] dark:border-zinc-600 accent-[#0051d5]"
            />
            <span className="text-sm text-[#0b1c30] dark:text-zinc-100 cursor-pointer">IVA incluido en el precio</span>
          </label>

          <div className="flex justify-end gap-3 pt-2 border-t border-[#c4c6d0] dark:border-zinc-700">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-[#c4c6d0] dark:border-zinc-600 px-4 py-2 text-sm font-medium text-[#44474f] dark:text-zinc-300 hover:bg-[#eff4ff] dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#0051d5] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0051d5]/90 disabled:opacity-50"
            >
              {saving ? "Guardando…" : isEditing ? "Guardar cambios" : "Crear producto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
