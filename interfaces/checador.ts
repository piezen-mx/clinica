/** Fila de RH.checadores. */
export interface IChecador {
  id_checador: number;
  sn:          string;
  id_sucursal: number;
  nombre:      string;
  activo:      boolean;
  status:      boolean;
  created_at:  string | null; // "YYYY-MM-DD HH:mm:ss"
}

/** Fila de listado: IChecador + nombre de sucursal resuelto por JOIN. */
export interface IChecadorListItem extends IChecador {
  nombre_sucursal: string;
}

/** Payload del alta/edición de checador. */
export type ChecadorFormInput = Pick<IChecador, "sn" | "id_sucursal" | "nombre">;
