"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Organization } from "facturapi";
import { updateOrganizationCustomization, IInvoiceSeriesFolio } from "../actions";

interface Props {
  orgId: string;
  organization: Organization;
  currentFolio: IInvoiceSeriesFolio | null;
}

interface PdfExtraState {
  codes: boolean;
  address_codes: boolean;
  product_key: boolean;
  round_unit_price: boolean;
  tax_breakdown: boolean;
  ieps_breakdown: boolean;
  render_carta_porte: boolean;
  repeat_signature: boolean;
}

interface CustomizationFormState {
  color: string;
  invoice_series: string;
  next_folio: string;
  pdf_extra: PdfExtraState;
}

const PDF_EXTRA_OPTIONS: Array<{ key: keyof PdfExtraState; label: string }> = [
  { key: "codes", label: "Incluir códigos de barras" },
  { key: "address_codes", label: "Incluir claves de la dirección" },
  { key: "product_key", label: "Mostrar clave de producto SAT" },
  { key: "round_unit_price", label: "Redondear precio unitario" },
  { key: "tax_breakdown", label: "Mostrar desglose de impuestos" },
  { key: "ieps_breakdown", label: "Mostrar desglose de IEPS" },
  { key: "render_carta_porte", label: "Incluir carta porte" },
  { key: "repeat_signature", label: "Repetir sello y cadena original" },
];

const inputClass =
  "rounded-md border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#0051d5] dark:focus:ring-zinc-400";
const labelClass = "text-xs font-medium text-[#44474f] dark:text-zinc-400";

function organizationToForm(organization: Organization): CustomizationFormState {
  const { customization } = organization;
  return {
    color: customization.color ?? "#0051D5",
    invoice_series: customization.default_series?.I ?? "",
    next_folio: "",
    pdf_extra: {
      codes: customization.pdf_extra?.codes ?? false,
      address_codes: customization.pdf_extra?.address_codes ?? false,
      product_key: customization.pdf_extra?.product_key ?? false,
      round_unit_price: customization.pdf_extra?.round_unit_price ?? false,
      tax_breakdown: customization.pdf_extra?.tax_breakdown ?? false,
      ieps_breakdown: customization.pdf_extra?.ieps_breakdown ?? false,
      render_carta_porte: customization.pdf_extra?.render_carta_porte ?? false,
      repeat_signature: customization.pdf_extra?.repeat_signature ?? false,
    },
  };
}

export default function CustomizationSection({ orgId, organization, currentFolio }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<CustomizationFormState>(() => organizationToForm(organization));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePdfExtra = (key: keyof PdfExtraState) => {
    setForm((prev) => ({ ...prev, pdf_extra: { ...prev.pdf_extra, [key]: !prev.pdf_extra[key] } }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await updateOrganizationCustomization(orgId, {
        color: form.color,
        invoice_series: form.invoice_series,
        next_folio: form.next_folio,
        pdf_extra: form.pdf_extra,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setForm((prev) => ({ ...prev, next_folio: "" }));
      router.refresh();
    } catch {
      setError("Error inesperado al guardar la personalización");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-6 shadow-sm flex flex-col gap-6"
    >
      <h3 className="text-sm font-bold text-[#0b1c30] dark:text-zinc-100">Apariencia y series</h3>

      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Color de marca</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
              className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800"
            />
            <input
              type="text"
              value={form.color}
              onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
              className={inputClass}
            />
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Serie de facturas</span>
          <input
            type="text"
            value={form.invoice_series}
            onChange={(e) => setForm((prev) => ({ ...prev, invoice_series: e.target.value.toUpperCase() }))}
            maxLength={10}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>
            Siguiente folio
            {currentFolio && (
              <span className="ml-1 font-normal text-[#8a8f9a] dark:text-zinc-500">
                (actual: {currentFolio.series}-{currentFolio.nextFolio})
              </span>
            )}
          </span>
          <input
            type="number"
            min={1}
            step={1}
            placeholder={currentFolio ? String(currentFolio.nextFolio) : ""}
            value={form.next_folio}
            onChange={(e) => setForm((prev) => ({ ...prev, next_folio: e.target.value }))}
            className={inputClass}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className={labelClass}>Opciones del PDF del comprobante</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {PDF_EXTRA_OPTIONS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.pdf_extra[key]}
                onChange={() => togglePdfExtra(key)}
                className="h-4 w-4 cursor-pointer rounded border border-[#c4c6d0] dark:border-zinc-600 accent-[#0051d5]"
              />
              <span className="text-sm text-[#0b1c30] dark:text-zinc-100 cursor-pointer">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t border-[#c4c6d0] dark:border-zinc-700">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[#0051d5] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0051d5]/90 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
