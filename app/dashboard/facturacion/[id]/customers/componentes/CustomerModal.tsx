"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Customer } from "facturapi";
import { TAX_SYSTEM_OPTIONS } from "@/lib/billing/taxSystemCatalog";
import { ICustomerFormInput } from "@/interfaces/organization";
import { createCustomerAction, updateCustomerAction } from "../actions";

interface Props {
  orgId: string;
  /** Ausente = modo crear. */
  customer?: Customer;
  onClose: () => void;
  onSaved: (customer: Customer, wasEditing: boolean) => void;
}

const inputClass =
  "rounded-md border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#0051d5] dark:focus:ring-zinc-400";
const labelClass = "text-xs font-medium text-[#44474f] dark:text-zinc-400";

function buildEmptyForm(): ICustomerFormInput {
  return {
    legal_name: "",
    tax_id: "",
    tax_system: "616",
    email: "",
    phone: null,
    street: null,
    exterior: null,
    interior: null,
    neighborhood: null,
    zip: "",
    city: null,
    municipality: null,
    state: null,
    country: null,
  };
}

function customerToForm(customer: Customer): ICustomerFormInput {
  return {
    legal_name: customer.legal_name,
    tax_id: customer.tax_id,
    tax_system: customer.tax_system ?? "616",
    email: customer.email,
    phone: customer.phone ?? null,
    street: customer.address.street ?? null,
    exterior: customer.address.exterior ?? null,
    interior: customer.address.interior ?? null,
    neighborhood: customer.address.neighborhood ?? null,
    zip: customer.address.zip,
    city: customer.address.city ?? null,
    municipality: customer.address.municipality ?? null,
    state: customer.address.state ?? null,
    country: customer.address.country ?? null,
  };
}

export default function CustomerModal({ orgId, customer, onClose, onSaved }: Props) {
  const router = useRouter();
  const isEditing = Boolean(customer);

  const [form, setForm] = useState<ICustomerFormInput>(customer ? customerToForm(customer) : buildEmptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleText = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleOptionalText = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value.trim().length > 0 ? value : null }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result =
        isEditing && customer
          ? await updateCustomerAction(orgId, customer.id, form)
          : await createCustomerAction(orgId, form);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
      onSaved(result.data, isEditing);
    } catch {
      setError("Error inesperado al guardar el cliente");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-zinc-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#c4c6d0] dark:border-zinc-700 px-6 py-4 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <h3 className="text-lg font-semibold text-[#0b1c30] dark:text-zinc-50">
            {isEditing ? "Editar cliente" : "Nuevo cliente"}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={labelClass}>Razón social *</span>
              <input
                type="text"
                name="legal_name"
                value={form.legal_name}
                onChange={handleText}
                required
                placeholder="Empresa S.A. de C.V."
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>RFC *</span>
              <input
                type="text"
                name="tax_id"
                value={form.tax_id}
                onChange={(e) => setForm((prev) => ({ ...prev, tax_id: e.target.value.toUpperCase() }))}
                required
                placeholder="XAXX010101000"
                className={`${inputClass} font-mono uppercase`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Régimen fiscal *</span>
              <select name="tax_system" value={form.tax_system} onChange={handleText} required className={inputClass}>
                {TAX_SYSTEM_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Correo electrónico *</span>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleText}
                required
                placeholder="cliente@empresa.com"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Teléfono</span>
              <input
                type="tel"
                name="phone"
                value={form.phone ?? ""}
                onChange={handleOptionalText}
                placeholder="+52 55 1234 5678"
                className={inputClass}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={labelClass}>Calle</span>
              <input type="text" name="street" value={form.street ?? ""} onChange={handleOptionalText} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Número exterior</span>
              <input type="text" name="exterior" value={form.exterior ?? ""} onChange={handleOptionalText} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Número interior</span>
              <input type="text" name="interior" value={form.interior ?? ""} onChange={handleOptionalText} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Colonia</span>
              <input type="text" name="neighborhood" value={form.neighborhood ?? ""} onChange={handleOptionalText} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Código postal *</span>
              <input
                type="text"
                name="zip"
                value={form.zip}
                onChange={handleText}
                required
                maxLength={5}
                placeholder="06600"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Ciudad</span>
              <input type="text" name="city" value={form.city ?? ""} onChange={handleOptionalText} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Municipio</span>
              <input type="text" name="municipality" value={form.municipality ?? ""} onChange={handleOptionalText} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Estado</span>
              <input type="text" name="state" value={form.state ?? ""} onChange={handleOptionalText} className={inputClass} />
            </label>
          </div>

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
              {saving ? "Guardando…" : isEditing ? "Guardar cambios" : "Crear cliente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
