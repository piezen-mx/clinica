/** Fila de BILLING.organizations tal como la devuelve el repositorio. */
export interface IOrganizationRecord {
  id:            number;
  uid:           string;
  id_empresa:    number;
  is_live:       boolean;
  name:          string | null;
  legal_name:    string | null;
  tax_id:        string | null;
  tax_system:    string | null;
  phone:         string | null;
  website:       string | null;
  support_email: string | null;
  street:        string | null;
  exterior:      string | null;
  interior:      string | null;
  neighborhood:  string | null;
  zip:           string | null;
  city:          string | null;
  municipality:  string | null;
  state:         string | null;
  country:       string | null;
  created_at:    string | null;   // "YYYY-MM-DD HH:mm:ss"
  updated_at:    string | null;   // "YYYY-MM-DD HH:mm:ss"
  /** Producto de Facturapi usado como concepto único al facturar cobros (spec 34). */
  default_product_id: string | null;
}

/**
 * `IOrganizationRecord` NO expone `test_key` ni `live_key`: las claves descifradas solo circulan
 * dentro de `lib/billing/`, y este tipo es el que cruza hacia páginas y componentes.
 */
export interface IOrganizationSecrets {
  hasTestKey: boolean;
  hasLiveKey: boolean;
}

/** Datos legales + dirección que se copian localmente y se mandan a Facturapi. */
export type OrganizationLegalInput = Pick<
  IOrganizationRecord,
  | "name" | "legal_name" | "tax_id" | "tax_system" | "phone" | "website" | "support_email"
  | "street" | "exterior" | "interior" | "neighborhood" | "zip" | "city"
  | "municipality" | "state" | "country"
>;

/** Modo de operación de una organización: sandbox o producción. */
export type FacturapiMode = "test" | "live";

/** Datos de un cliente de Facturapi capturados en el formulario (spec 29). */
export interface ICustomerFormInput {
  legal_name:   string;
  tax_id:       string;
  tax_system:   string;
  email:        string;
  phone:        string | null;
  street:       string | null;
  exterior:     string | null;
  interior:     string | null;
  neighborhood: string | null;
  zip:          string;
  city:         string | null;
  municipality: string | null;
  state:        string | null;
  country:      string | null;
}

/** Datos de un producto de Facturapi capturados en el formulario (spec 29). */
export interface IProductFormInput {
  description:  string;
  product_key:  string;  // clave del catálogo SAT
  unit_key:     string;  // clave de unidad SAT, default "H87"
  price:        number;  // validado: nunca NaN
  tax_included: boolean;
}

/** Resultado del buscador del catálogo SAT (spec 29). */
export interface ISatProductSuggestion {
  key:         string;
  description: string;
}

/** Renglón de una factura en el formulario de captura (spec 30). */
export interface IInvoiceLineInput {
  product_id: string;   // id del producto en Facturapi
  quantity:   number;   // validado: nunca NaN, > 0
}

/** Datos de captura de una factura de ingreso (spec 30). */
export interface ICreateInvoiceInput {
  customer_id:    string;
  lines:          IInvoiceLineInput[];
  payment_form:   string;   // clave SAT
  payment_method: string;   // "PUE" | "PPD"
  use:            string;   // uso del CFDI
  series:         string | null;
  folio_number:   number | null;   // validado: nunca NaN
}

/** Motivos de cancelación admitidos por el SAT (spec 30). */
export type InvoiceCancellationMotive = "01" | "02" | "03" | "04";

/** Opciones de personalización del comprobante que expone Facturapi (spec 31). */
export interface IOrganizationCustomizationInput {
  color:          string | null;   // hexadecimal, validado
  next_folio:     number | null;   // entero positivo
  invoice_series: string | null;
  pdf_extra:      Record<string, string | boolean | null>;
}

/** Origen de una operación cobrable (spec 34). */
export type BillableSource =
  | "consulta"
  | "tratamiento_revision"   // pagos id_tratamiento_pago_tipo = 1
  | "tratamiento";           // pagos id_tratamiento_pago_tipo = 2

/** Renglón del listado "Por facturar" (spec 34). */
export interface IBillableOperation {
  source:             BillableSource;
  source_id:          number;         // id_consulta o id_tratamiento
  patient_name:       string;
  patient_whatsapp:   string | null;
  podologist_name:    string | null;
  last_payment_date:  string;         // "YYYY-MM-DD HH:mm:ss", vía CONVERT(varchar(19), …, 120)
  total:              number;         // suma de los pagos que componen la operación
  payment_form:       string;         // clave SAT del pago de mayor monto
  payment_form_label: string;         // descripción del método, para mostrar
}

/** Captura del modal de facturación de un cobro (spec 34). */
export interface ICreateBillableInvoiceInput {
  source:      BillableSource;
  source_id:   number;
  customer_id: string;   // id del cliente en Facturapi
  description: string;   // concepto, precargado y editable
  use:         string;   // uso del CFDI, default "D01"
}
