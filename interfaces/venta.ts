export interface IVentaDetalle {
  id_venta_detalle: number;
  id_producto:      number;
  nombre_producto?: string;   // joined
  cantidad:         number;
  precio_unitario:  number;
  subtotal:         number;
}

export interface IVenta {
  id_venta:            number;
  id_sucursal:         number;
  idMetodoPago:        number;
  total:               number;
  created_at:          string;
  id_usuario:          number;
  status:              number;
  webid:               string | null;
  facturado:           number | null;
  uuid_cfdi:           string | null;
  lineas:              IVentaDetalle[];
  // joined
  descripcion_metodo?: string;
}
