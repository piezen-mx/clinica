/** Fila de RH.empleados tal como la devuelven los server actions. */
export interface IEmployee {
  id_empleado:         number;
  codigo_empleado:     string;
  id_empresa:          number;
  id_sucursal:         number;

  nombre:              string;
  apellido_paterno:    string | null;
  apellido_materno:    string | null;
  foto_url:            string | null;
  fecha_ingreso:       string;          // "YYYY-MM-DD" — nunca Date
  id_supervisor:       number | null;
  whatsapp:            string | null;
  email:               string | null;
  rfc:                 string | null;
  curp:                string | null;
  nss:                 string | null;

  fecha_nacimiento:    string | null;   // "YYYY-MM-DD" — nunca Date
  genero:              string | null;
  estado_civil:        string | null;
  direccion:           string | null;
  contacto_emergencia: string | null;
  whatsapp_emergencia: string | null;
  contacto_emergencia_2: string | null;
  whatsapp_emergencia_2: string | null;

  id_department:       number;
  id_puesto:           number;
  id_turno:            number | null;
  dias_laborales:      string | null;
  horario:             string | null;
  salario_diario:      number | null;
  salario_diario_fiscal: number | null;
  tipo_salario:        string | null;
  cuenta_bancaria:     string | null;

  activo:              boolean;
  status:              boolean;
  created_at:          string | null;   // "YYYY-MM-DD HH:mm:ss"
  updated_at:          string | null;
}

/** Fila del listado: IEmployee + nombres resueltos por JOIN + nombre concatenado. */
export interface IEmployeeListItem extends IEmployee {
  /** nombre + apellido_paterno + apellido_materno, con un solo espacio entre partes no vacías. */
  nombre_completo:     string;
  nombre_departamento: string;
  nombre_puesto:       string;
  nombre_sucursal:     string;
}

/** Expediente del detalle: agrega el nombre del supervisor y del turno. */
export interface IEmployeeRecord extends IEmployeeListItem {
  nombre_supervisor:   string | null;   // concatenación de las tres columnas del supervisor
  nombre_turno:        string | null;
}

/** Payload del modal de alta/edición. Sin campos derivados ni generados. */
export type EmployeeFormInput = Omit<
  IEmployee,
  "id_empleado" | "codigo_empleado" | "id_empresa" | "activo" | "status" | "created_at" | "updated_at"
>;
