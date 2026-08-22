/** Fila de RH.empleado_identificadores — mapea el ID crudo del checador a un empleado. */
export interface IEmployeeIdentifier {
  id_empleado_identificador: number;
  id_empleado:               number;
  identificador:             string;
  tipo:                      "huella" | "tarjeta" | "otro";
  status:                    boolean;
  created_at:                string | null; // "YYYY-MM-DD HH:mm:ss"
}

export type AttendanceEventType = "entrada" | "salida";

/** Fila de RH.asistencias tal como la devuelven los server actions. */
export interface IAttendanceEvent {
  id_asistencia:        number;
  id_empleado:          number;
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
