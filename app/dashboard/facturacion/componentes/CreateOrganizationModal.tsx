"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOrganization } from "../actions";
import { TAX_SYSTEM_OPTIONS } from "@/lib/billing/taxSystemCatalog";

interface Props {
  onClose: () => void;
}

interface FormState {
  name: string;
  legal_name: string;
  tax_system: string;
  street: string;
  exterior: string;
  neighborhood: string;
  zip: string;
  city: string;
  municipality: string;
  state: string;
}

function buildEmptyForm(): FormState {
  return {
    name: "",
    legal_name: "",
    tax_system: "",
    street: "",
    exterior: "",
    neighborhood: "",
    zip: "",
    city: "",
    municipality: "",
    state: "",
  };
}

const inputClass =
  "rounded-md border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#0051d5] dark:focus:ring-zinc-400";
const labelClass = "text-xs font-medium text-[#44474f] dark:text-zinc-400";

export default function CreateOrganizationModal({ onClose }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(buildEmptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await createOrganization(form);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("Error inesperado al crear la organización");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-zinc-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#c4c6d0] dark:border-zinc-700 px-6 py-4 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <h3 className="text-lg font-semibold text-[#0b1c30] dark:text-zinc-50">Nueva organización</h3>
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

          <section className="flex flex-col gap-4">
            <h4 className="text-sm font-semibold text-[#0b1c30] dark:text-zinc-100 pb-2 border-b border-[#c4c6d0]/50 dark:border-zinc-700/50">
              Datos fiscales
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Nombre comercial *</span>
                <input type="text" name="name" value={form.name} onChange={handleChange} required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Razón social *</span>
                <input type="text" name="legal_name" value={form.legal_name} onChange={handleChange} required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Régimen fiscal *</span>
                <select name="tax_system" value={form.tax_system} onChange={handleChange} required className={inputClass}>
                  <option value="">Seleccione…</option>
                  {TAX_SYSTEM_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h4 className="text-sm font-semibold text-[#0b1c30] dark:text-zinc-100 pb-2 border-b border-[#c4c6d0]/50 dark:border-zinc-700/50">
              Dirección fiscal
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className={labelClass}>Calle *</span>
                <input type="text" name="street" value={form.street} onChange={handleChange} required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Número exterior *</span>
                <input type="text" name="exterior" value={form.exterior} onChange={handleChange} required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Colonia *</span>
                <input type="text" name="neighborhood" value={form.neighborhood} onChange={handleChange} required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Código postal *</span>
                <input type="text" name="zip" value={form.zip} onChange={handleChange} required maxLength={5} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Ciudad *</span>
                <input type="text" name="city" value={form.city} onChange={handleChange} required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Municipio *</span>
                <input type="text" name="municipality" value={form.municipality} onChange={handleChange} required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Estado *</span>
                <input type="text" name="state" value={form.state} onChange={handleChange} required className={inputClass} />
              </label>
            </div>
          </section>

          <p className="text-xs text-[#44474f] dark:text-zinc-500">
            El RFC y el país quedan fijos a los de la cuenta de facturación de la empresa —
            Facturapi no permite asignar un RFC distinto por organización.
          </p>

          <div className="flex justify-end gap-3 pt-2 border-t border-[#c4c6d0] dark:border-zinc-700">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#c4c6d0] dark:border-zinc-600 px-4 py-2 text-sm font-medium text-[#44474f] dark:text-zinc-300 hover:bg-[#eff4ff] dark:hover:bg-zinc-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#0051d5] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0051d5]/90 disabled:opacity-50"
            >
              {saving ? "Creando…" : "Crear organización"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
