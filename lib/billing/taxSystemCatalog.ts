/**
 * Catálogo de regímenes fiscales del SAT (subset del enum `TaxSystem` de `facturapi`),
 * con etiqueta legible para los selects de alta/edición de organización. No es
 * exhaustivo del catálogo completo del SAT — cubre los regímenes más comunes.
 */
export const TAX_SYSTEM_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "601", label: "601 — General de Ley Personas Morales" },
  { code: "603", label: "603 — Personas Morales con Fines no Lucrativos" },
  { code: "605", label: "605 — Sueldos y Salarios" },
  { code: "606", label: "606 — Arrendamiento" },
  { code: "607", label: "607 — Enajenación o Adquisición de Bienes" },
  { code: "608", label: "608 — Demás Ingresos" },
  { code: "610", label: "610 — Residentes en el Extranjero" },
  { code: "611", label: "611 — Ingresos por Dividendos (Socios y Accionistas)" },
  { code: "612", label: "612 — Personas Físicas con Actividades Empresariales y Profesionales" },
  { code: "614", label: "614 — Ingresos por Intereses" },
  { code: "615", label: "615 — Ingresos por Obtención de Premios" },
  { code: "616", label: "616 — Sin Obligaciones Fiscales" },
  { code: "620", label: "620 — Sociedades Cooperativas de Producción" },
  { code: "621", label: "621 — Régimen de Incorporación Fiscal" },
  { code: "622", label: "622 — Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras" },
  { code: "623", label: "623 — Opcional para Grupos de Sociedades" },
  { code: "624", label: "624 — Coordinados" },
  { code: "625", label: "625 — Actividades Empresariales con Ingresos a través de Plataformas Tecnológicas" },
  { code: "626", label: "626 — Régimen Simplificado de Confianza" },
];

export function taxSystemLabel(code: string | null | undefined): string {
  if (!code) return "—";
  const match = TAX_SYSTEM_OPTIONS.find((option) => option.code === code);
  return match ? match.label : code;
}
