export interface IProduct {
  id_product:           number;
  name:                 string;
  id_category:          number | null;
  brand:                string;
  presentation:         string;
  id_unit_measurement:  number | null;
  size:                 string;
  price:                number;
  sale_price:           number | null;
  product_code:         string;
  id_supplier:          number | null;
  pieces:               number | null;
  min_stock:            number | null;
  auto_consume:         boolean;
  consumption_per_consultation: number | null;
  id_empresa:            number;
  description:          string;
  created_at:           Date | string;
  activo:               boolean;
  status:               boolean;
  split:                boolean;
  url_product:          string;
  bono_venta:           number | null;
  url_compra:           string | null;
}
