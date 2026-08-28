"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import type { Organization } from "facturapi";
import { updateOrganizationLegal } from "../../../actions";
import { TAX_SYSTEM_OPTIONS, taxSystemLabel } from "@/lib/billing/taxSystemCatalog";

interface Props {
  orgId: string;
  organization: Organization;
}

interface FormState {
  name: string;
  legal_name: string;
  tax_system: string;
  phone: string;
  website: string;
  support_email: string;
  street: string;
  exterior: string;
  interior: string;
  neighborhood: string;
  zip: string;
  city: string;
  municipality: string;
  state: string;
}

/** `tax_id`/`country` no son editables (ver nota en `CreateOrganizationSchema`) y se omiten aquí. */
function organizationToForm(organization: Organization): FormState {
  const { legal } = organization;
  return {
    name: legal.name ?? "",
    legal_name: legal.legal_name ?? "",
    tax_system: legal.tax_system ?? "",
    phone: legal.phone ?? "",
    website: legal.website ?? "",
    support_email: legal.support_email ?? "",
    street: legal.address.street ?? "",
    exterior: legal.address.exterior ?? "",
    interior: legal.address.interior ?? "",
    neighborhood: legal.address.neighborhood ?? "",
    zip: legal.address.zip ?? "",
    city: legal.address.city ?? "",
    municipality: legal.address.municipality ?? "",
    state: legal.address.state ?? "",
  };
}

const inputClass =
  "rounded-md border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#0051d5] dark:focus:ring-zinc-400";
const labelClass = "text-xs font-medium text-[#44474f] dark:text-zinc-400";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <span className="font-semibold text-[#44474f] dark:text-zinc-400 col-span-1">{label}:</span>
      <span className="text-[#0b1c30] dark:text-zinc-100 col-span-2 wrap-break-word">{value || "—"}</span>
    </div>
  );
}

export default function OrganizationLegalSection({ orgId, organization }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() => organizationToForm(organization));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { legal } = organization;

  const startEditing = () => {
    setForm(organizationToForm(organization));
    setError(null);
    setEditing(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await updateOrganizationLegal(orgId, form);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
      setEditing(false);
    } catch {
      setError("Error inesperado al guardar los datos fiscales");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-6 shadow-sm flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#0b1c30] dark:text-zinc-100">Datos fiscales</h3>
          <button
            type="button"
            onClick={startEditing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm font-semibold text-[#0b1c30] dark:text-zinc-100 hover:bg-[#eff4ff] dark:hover:bg-zinc-700 transition-colors"
          >
            <Pencil size={16} />
            Editar
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-3 text-sm">
          <div className="flex flex-col gap-3">
            <InfoRow label="Nombre comercial" value={legal.name} />
            <InfoRow label="Razón social" value={legal.legal_name} />
            <InfoRow label="RFC" value={legal.tax_id} />
            <InfoRow label="Régimen fiscal" value={taxSystemLabel(legal.tax_system)} />
            <InfoRow label="Teléfono" value={legal.phone} />
            <InfoRow label="Sitio web" value={legal.website} />
            <InfoRow label="Correo de soporte" value={legal.support_email} />
          </div>
          <div className="flex flex-col gap-3">
            <InfoRow
              label="Dirección"
              value={[legal.address.street, legal.address.exterior, legal.address.interior]
                .filter(Boolean)
                .join(" ")}
            />
            <InfoRow label="Colonia" value={legal.address.neighborhood ?? ""} />
            <InfoRow label="Código postal" value={legal.address.zip} />
            <InfoRow label="Ciudad" value={legal.address.city ?? ""} />
            <InfoRow label="Municipio" value={legal.address.municipality ?? ""} />
            <InfoRow label="Estado" value={legal.address.state ?? ""} />
            <InfoRow label="País" value={legal.address.country} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-6 shadow-sm flex flex-col gap-6"
    >
      <h3 className="text-sm font-bold text-[#0b1c30] dark:text-zinc-100">Editar datos fiscales</h3>

      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

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
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Teléfono</span>
          <input type="tel" name="phone" value={form.phone} onChange={handleChange} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Sitio web</span>
          <input type="text" name="website" value={form.website} onChange={handleChange} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Correo de soporte</span>
          <input type="email" name="support_email" value={form.support_email} onChange={handleChange} className={inputClass} />
        </label>
      </div>

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
          <span className={labelClass}>Número interior</span>
          <input type="text" name="interior" value={form.interior} onChange={handleChange} className={inputClass} />
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

      <p className="text-xs text-[#44474f] dark:text-zinc-500">
        El RFC y el país quedan fijos a los de la cuenta de facturación de la empresa —
        Facturapi no permite editarlos por organización.
      </p>

      <div className="flex justify-end gap-3 pt-2 border-t border-[#c4c6d0] dark:border-zinc-700">
        <button
          type="button"
          onClick={() => setEditing(false)}
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
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
