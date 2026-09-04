import { AttendanceDayStatus, IAttendanceEvent } from "@/interfaces/asistencia";

/** Resultado de summarizeAttendanceEvents: las 4 métricas del resumen más el estado por día. */
export interface AttendanceSummaryResult {
  attended_days: number;
  total_events: number;
  registered_hours: number;
  incomplete_days: number;
  dayStatuses: Map<string, AttendanceDayStatus>;
}

/** Extrae "YYYY-MM-DD" de un fecha_hora "YYYY-MM-DD HH:mm:ss", sin construir ningún Date. */
function extractDatePart(fechaHora: string): string {
  return fechaHora.slice(0, 10);
}

/** Diferencia en horas entre dos "YYYY-MM-DD HH:mm:ss", asumiendo el mismo día calendario. */
function hoursBetween(entrada: string, salida: string): number {
  const normalizedEntrada = entrada.replace(" ", "T");
  const normalizedSalida = salida.replace(" ", "T");
  const millisecondsDiff =
    new Date(normalizedSalida).getTime() - new Date(normalizedEntrada).getTime();
  return millisecondsDiff / (1000 * 60 * 60);
}

/**
 * Recibe las checadas de un rango, ordenadas ascendentemente por fecha_hora, y calcula
 * las métricas de resumen emparejando entrada→salida en secuencia por día calendario
 * (soporta salidas intermedias, p. ej. comida). No usa Date sobre strings crudos salvo
 * para restar dos horas ya normalizadas del mismo día. Función pura, sin acceso a BD.
 */
export function summarizeAttendanceEvents(
  events: IAttendanceEvent[]
): AttendanceSummaryResult {
  const eventsByDay = new Map<string, IAttendanceEvent[]>();
  for (const event of events) {
    const day = extractDatePart(event.fecha_hora);
    const dayEvents = eventsByDay.get(day);
    if (dayEvents) {
      dayEvents.push(event);
    } else {
      eventsByDay.set(day, [event]);
    }
  }

  let registeredHours = 0;
  let incompleteDays = 0;
  const dayStatuses = new Map<string, AttendanceDayStatus>();

  for (const [day, dayEvents] of eventsByDay) {
    let openEntrada: IAttendanceEvent | null = null;
    let dayIsIncomplete = false;

    for (const event of dayEvents) {
      if (event.tipo === "entrada") {
        if (openEntrada) {
          // Dos entradas seguidas sin salida que las cierre: la primera queda incompleta.
          dayIsIncomplete = true;
        }
        openEntrada = event;
      } else {
        // event.tipo === "salida"
        if (openEntrada) {
          registeredHours += hoursBetween(openEntrada.fecha_hora, event.fecha_hora);
          openEntrada = null;
        } else {
          // Salida sin entrada previa abierta.
          dayIsIncomplete = true;
        }
      }
    }

    if (openEntrada) {
      // Entrada sin salida que la cierre al final del día.
      dayIsIncomplete = true;
    }

    if (dayIsIncomplete) {
      incompleteDays += 1;
      dayStatuses.set(day, "incomplete");
    } else {
      dayStatuses.set(day, "complete");
    }
  }

  return {
    attended_days: eventsByDay.size,
    total_events: events.length,
    registered_hours: Math.round(registeredHours * 100) / 100,
    incomplete_days: incompleteDays,
    dayStatuses,
  };
}
