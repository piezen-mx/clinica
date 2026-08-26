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
