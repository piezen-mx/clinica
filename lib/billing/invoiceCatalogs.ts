/**
 * Catálogos SAT usados por la captura de facturas (spec 30): forma de pago,
 * método de pago, uso del CFDI y motivo de cancelación. Cada uno se construye
 * sobre el enum correspondiente del SDK de `facturapi` (la misma fuente de
 * verdad que valida `lib/billing/schemas.ts`), con una etiqueta legible para
 * los `<select>` — mismo criterio que `taxSystemCatalog.ts` (spec 28).
 */
import { PaymentFormList, PaymentMethod, InvoiceUse, CancellationMotive, InvoiceStatus } from "facturapi";

export interface ICatalogOption {
  code: string;
  label: string;
}

/** El SDK ya trae la lista con etiquetas; solo se le da el formato "código — etiqueta". */
export const PAYMENT_FORM_OPTIONS: ICatalogOption[] = PaymentFormList.map((item) => ({
  code: item.value,
  label: `${item.value} — ${item.label}`,
}));

export const PAYMENT_METHOD_OPTIONS: ICatalogOption[] = [
  { code: PaymentMethod.PAGO_EN_UNA_EXHIBICION, label: "PUE — Pago en una sola exhibición" },
  { code: PaymentMethod.PAGO_EN_PARCIALIDADES_DIFERIDO, label: "PPD — Pago en parcialidades o diferido" },
];

export const CFDI_USE_OPTIONS: ICatalogOption[] = [
  { code: InvoiceUse.ADQUISICION_MERCANCIAS, label: "G01 — Adquisición de mercancías" },
  { code: InvoiceUse.DEVOLUCIONES_DESCUENTOS_BONIFICACIONES, label: "G02 — Devoluciones, descuentos o bonificaciones" },
  { code: InvoiceUse.GASTOS_EN_GENERAL, label: "G03 — Gastos en general" },
  { code: InvoiceUse.CONSTRUCCIONES, label: "I01 — Construcciones" },
  { code: InvoiceUse.MOBILIARIO_Y_EQUIPO_DE_OFICINA, label: "I02 — Mobiliario y equipo de oficina por inversiones" },
  { code: InvoiceUse.EQUIPO_DE_TRANSPORTE, label: "I03 — Equipo de transporte" },
  { code: InvoiceUse.EQUIPO_DE_COMPUTO, label: "I04 — Equipo de cómputo y accesorios" },
  { code: InvoiceUse.DADOS_TROQUELES_HERRAMENTAL, label: "I05 — Dados, troqueles, moldes, matrices y otros activos" },
  { code: InvoiceUse.COMUNICACIONES_TELEFONICAS, label: "I06 — Comunicaciones telefónicas" },
  { code: InvoiceUse.COMUNICACIONES_SATELITALES, label: "I07 — Comunicaciones satelitales" },
  { code: InvoiceUse.OTRA_MAQUINARIA, label: "I08 — Otra maquinaria y equipo" },
  { code: InvoiceUse.HONORARIOS_MEDICOS, label: "D01 — Honorarios médicos, dentales y gastos hospitalarios" },
  { code: InvoiceUse.GASTOS_MEDICOS_POR_INCAPACIDAD, label: "D02 — Gastos médicos por incapacidad o discapacidad" },
  { code: InvoiceUse.GASTOS_FUNERALES, label: "D03 — Gastos funerales" },
  { code: InvoiceUse.DONATIVOS, label: "D04 — Donativos" },
  { code: InvoiceUse.INTERESES_POR_CREDITOS_HIPOTECARIOS, label: "D05 — Intereses por créditos hipotecarios (casa habitación)" },
  { code: InvoiceUse.APORTACIONES_VOLUNTARIAS_SAR, label: "D06 — Aportaciones voluntarias al SAR" },
  { code: InvoiceUse.PRIMA_SEGUROS_GASTOS_MEDICOS, label: "D07 — Primas por seguros de gastos médicos" },
  { code: InvoiceUse.GASTOS_TRANSPORTACION_ESCOLAR, label: "D08 — Gastos de transportación escolar obligatoria" },
  { code: InvoiceUse.CUENTAS_AHORRO_PENSIONES, label: "D09 — Depósitos en cuentas para el ahorro o planes de pensiones" },
  { code: InvoiceUse.SERVICIOS_EDUCATIVOS, label: "D10 — Pagos por servicios educativos (colegiaturas)" },
  { code: InvoiceUse.SIN_EFECTOS_FISCALES, label: "S01 — Sin efectos fiscales" },
  { code: InvoiceUse.PAGOS, label: "CP01 — Pagos" },
  { code: InvoiceUse.NOMINA, label: "CN01 — Nómina" },
  { code: InvoiceUse.POR_DEFINIR, label: "P01 — Por definir" },
];

export const CANCELLATION_MOTIVE_OPTIONS: ICatalogOption[] = [
  { code: CancellationMotive.ERRORES_CON_RELACION, label: "01 — Comprobante emitido con errores, con relación" },
  { code: CancellationMotive.ERRORES_SIN_RELACION, label: "02 — Comprobante emitido con errores, sin relación" },
  { code: CancellationMotive.NO_SE_CONCRETO, label: "03 — No se llevó a cabo la operación" },
  { code: CancellationMotive.FACTURA_GLOBAL, label: "04 — Operación nominativa relacionada en una factura global" },
];

function labelFor(options: ICatalogOption[], code: string | null | undefined): string {
  if (!code) return "—";
  return options.find((option) => option.code === code)?.label ?? code;
}

export const paymentFormLabel = (code: string | null | undefined) => labelFor(PAYMENT_FORM_OPTIONS, code);
export const paymentMethodLabel = (code: string | null | undefined) => labelFor(PAYMENT_METHOD_OPTIONS, code);
export const cfdiUseLabel = (code: string | null | undefined) => labelFor(CFDI_USE_OPTIONS, code);
export const cancellationMotiveLabel = (code: string | null | undefined) => labelFor(CANCELLATION_MOTIVE_OPTIONS, code);

/** Estatus de una factura, para el filtro del listado y el badge de cada renglón. */
export const INVOICE_STATUS_OPTIONS: ICatalogOption[] = [
  { code: InvoiceStatus.VALID, label: "Vigente" },
  { code: InvoiceStatus.PENDING, label: "Pendiente" },
  { code: InvoiceStatus.CANCELED, label: "Cancelada" },
  { code: InvoiceStatus.FAILED, label: "Fallida" },
  { code: InvoiceStatus.DRAFT, label: "Borrador" },
];

export const invoiceStatusLabel = (code: string | null | undefined) => labelFor(INVOICE_STATUS_OPTIONS, code);
