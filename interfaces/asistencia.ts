/** Fila de RH.empleado_identificadores — mapea el ID crudo del checador a un empleado. */
export interface IEmployeeIdentifier {
  id_empleado_identificador: number;
  id_empleado:               number;
  id_checador:                number;
  identificador:             string;
  tipo:                      "huella" | "tarjeta" | "otro";
  status:                    boolean;
  created_at:                string | null; // "YYYY-MM-DD HH:mm:ss"
}

/** Listado para la pestaña "Asistencia": IEmployeeIdentifier + nombre del checador. */
export interface IEmployeeIdentifierListItem extends IEmployeeIdentifier {
  nombre_checador:  string;
  nombre_sucursal:  string;
}

export type AttendanceEventType = "entrada" | "salida";

/** Fila de RH.asistencias tal como la devuelven los server actions. */
export interface IAttendanceEvent {
  id_asistencia:        number;
  id_empleado:          number;
  id_checador:           number;
  fecha_hora:           string; // "YYYY-MM-DD HH:mm:ss" — nunca Date
  tipo:                 AttendanceEventType;
  identificador_origen: string | null;
  created_at:           string | null;
}

/** Body esperado en el POST de app/api/asistencias — enviado por el checador biométrico. */
export interface AttendancePostBody {
  identificador: string;             // ID crudo de huella/tarjeta reportado por el dispositivo
  tipo:          AttendanceEventType;
  fecha_hora:    string;             // "YYYY-MM-DD HH:mm:ss" hora local Mexico City, nunca UTC/ISO con offset
}

/** Fila de la tabla del historial: IAttendanceEvent + datos del checador resueltos por JOIN. */
export interface IAttendanceEventListItem extends IAttendanceEvent {
  nombre_checador: string;
  nombre_sucursal: string;
}

/** Página de checadas + total, para la paginación server-side. */
export interface IAttendanceEventsPage {
  events: IAttendanceEventListItem[];
  total:  number;   // total de checadas del rango, no de la página
}

/** Métricas de las 4 tarjetas de resumen, calculadas sobre el rango seleccionado. */
export interface IAttendanceSummary {
  attended_days:     number;  // días distintos con al menos una checada
  total_events:      number;  // checadas en el rango
  registered_hours:  number;  // suma de pares entrada→salida, en horas con 2 decimales
  incomplete_days:   number;  // días con entrada sin salida o salida sin entrada
}

/** Estado de un día del mes visible, para el punto de color del calendario. */
export type AttendanceDayStatus = "complete" | "incomplete";

export interface IAttendanceDayState {
  fecha:  string;               // "YYYY-MM-DD"
  status: AttendanceDayStatus;  // los días sin checadas simplemente no vienen en el arreglo
}
