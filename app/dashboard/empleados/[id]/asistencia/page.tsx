import Link from "next/link";
import {
  getEmployeeAttendanceEvents,
  getEmployeeAttendanceSummary,
  getEmployeeAttendanceMonthStates,
  getEmployeeIdentifiers,
  getChecadoresActivos,
} from "./actions";
import { addZeroToday } from "@/utils/date_helpper";
import EmployeeIdentifiersModal from "./componentes/EmployeeIdentifiersModal";
import AttendanceCalendar from "./componentes/AttendanceCalendar";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string; mes?: string; pagina?: string }>;
}

const PAGE_SIZE = 15;

const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function isValidDate(value: string | undefined): value is string {
  return !!value && DATE_PATTERN.test(value);
}

function isValidMonth(value: string | undefined): value is string {
  return !!value && MONTH_PATTERN.test(value);
}

/** Normaliza searchParams a valores válidos, con "hoy" como default y sin romper la
 *  página ante parámetros inválidos, ausentes, o un rango invertido escrito a mano. */
function normalizeSearchParams(raw: {
  desde?: string;
  hasta?: string;
  mes?: string;
  pagina?: string;
}) {
  const today = addZeroToday(new Date());

  let desde = isValidDate(raw.desde) ? raw.desde : today;
  let hasta = isValidDate(raw.hasta) ? raw.hasta : today;
  if (hasta < desde) [desde, hasta] = [hasta, desde];

  const mes = isValidMonth(raw.mes) ? raw.mes : hasta.slice(0, 7);

  const parsedPage = Number(raw.pagina);
  const pagina = Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  return { desde, hasta, mes, pagina };
}

function formatFecha(fechaHora: string): string {
  return fechaHora.slice(0, 10).split("-").reverse().join("/");
}

function formatHora(fechaHora: string): string {
  return fechaHora.slice(11, 16);
}

const TIPO_BADGE_STYLES: Record<string, string> = {
  entrada: "bg-[#d7e8da] text-[#1e6b3a] dark:bg-emerald-900/30 dark:text-emerald-400",
  salida: "bg-[#dbe1ff] text-[#0043b0] dark:bg-blue-900/30 dark:text-blue-400",
};

const TIPO_LABELS: Record<string, string> = {
  entrada: "Entrada",
  salida: "Salida",
};

export default async function EmployeeAttendancePage({ params, searchParams }: Props) {
  const { id } = await params;
  const id_empleado = Number(id);
  const { desde, hasta, mes, pagina } = normalizeSearchParams(await searchParams);

  const [eventsPage, summary, monthStates, identifiers, checadores] = await Promise.all([
    getEmployeeAttendanceEvents({ id_empleado, desde, hasta, pagina }),
    getEmployeeAttendanceSummary({ id_empleado, desde, hasta }),
    getEmployeeAttendanceMonthStates({ id_empleado, mes }),
    getEmployeeIdentifiers(id_empleado),
    getChecadoresActivos(),
  ]);

  const totalPages = Math.max(1, Math.ceil(eventsPage.total / PAGE_SIZE));
  const rangeStart = eventsPage.total === 0 ? 0 : (pagina - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(pagina * PAGE_SIZE, eventsPage.total);

  function pageHref(targetPage: number): string {
    const params = new URLSearchParams({ desde, hasta, mes, pagina: String(targetPage) });
    return `/dashboard/empleados/${id_empleado}/asistencia?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-[#0b1c30] dark:text-zinc-50 mb-1">Control de Asistencias</h2>
          <p className="text-sm text-[#44474f] dark:text-zinc-400">
            Checadas registradas por el checador biométrico, sin evaluación de horario ni puntualidad.
          </p>
        </div>
        <EmployeeIdentifiersModal id_empleado={id_empleado} identifiers={identifiers} checadores={checadores} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-5 flex flex-col justify-between">
          <span className="text-xs font-semibold text-[#44474f] dark:text-zinc-400 uppercase tracking-wider">
            Días con asistencia
          </span>
          <span className="text-3xl font-bold text-[#0b1c30] dark:text-zinc-50 mt-2">{summary.attended_days}</span>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-5 flex flex-col justify-between">
          <span className="text-xs font-semibold text-[#44474f] dark:text-zinc-400 uppercase tracking-wider">
            Total de checadas
          </span>
          <span className="text-3xl font-bold text-[#0b1c30] dark:text-zinc-50 mt-2">{summary.total_events}</span>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-5 flex flex-col justify-between">
          <span className="text-xs font-semibold text-[#44474f] dark:text-zinc-400 uppercase tracking-wider">
            Horas registradas
          </span>
          <span className="text-3xl font-bold text-[#0b1c30] dark:text-zinc-50 mt-2">
            {summary.registered_hours.toFixed(2)} <span className="text-base font-normal">hrs</span>
          </span>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-5 flex flex-col justify-between">
          <span className="text-xs font-semibold text-[#44474f] dark:text-zinc-400 uppercase tracking-wider">
            Días incompletos
          </span>
          <span className="text-3xl font-bold text-[#0b1c30] dark:text-zinc-50 mt-2">{summary.incomplete_days}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="p-5 border-b border-[#c4c6d0] dark:border-zinc-700 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-[#0b1c30] dark:text-zinc-50">Registro de Asistencias</h3>
              <span className="px-2 py-0.5 rounded-full bg-[#dbe1ff] dark:bg-blue-900/30 text-[#0043b0] dark:text-blue-400 text-xs font-semibold">
                {eventsPage.total} registros
              </span>
            </div>
          </div>

          {eventsPage.events.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#44474f] dark:text-zinc-400">
              No hay checadas registradas en el rango seleccionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#f8f9fb] dark:bg-zinc-800 border-b border-[#c4c6d0] dark:border-zinc-700 text-sm text-[#44474f] dark:text-zinc-400">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Fecha</th>
                    <th className="px-5 py-3 font-semibold">Hora</th>
                    <th className="px-5 py-3 font-semibold">Tipo</th>
                    <th className="px-5 py-3 font-semibold">Sucursal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c4c6d0]/50 dark:divide-zinc-700/50 text-sm">
                  {eventsPage.events.map((event) => (
                    <tr key={event.id_asistencia} className="hover:bg-[#f8f9fb] dark:hover:bg-zinc-800/50">
                      <td className="px-5 py-3 font-medium text-[#0b1c30] dark:text-zinc-100">
                        {formatFecha(event.fecha_hora)}
                      </td>
                      <td className="px-5 py-3 font-bold text-[#0b1c30] dark:text-zinc-100">
                        {formatHora(event.fecha_hora)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${TIPO_BADGE_STYLES[event.tipo]}`}
                        >
                          {TIPO_LABELS[event.tipo] ?? event.tipo}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[#44474f] dark:text-zinc-400">{event.nombre_sucursal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-auto p-4 border-t border-[#c4c6d0] dark:border-zinc-700 flex items-center justify-between text-sm text-[#44474f] dark:text-zinc-400">
            <span>
              Mostrando {rangeStart}-{rangeEnd} de {eventsPage.total} registros
            </span>
            <div className="flex items-center gap-2">
              {pagina <= 1 ? (
                <span className="px-3 py-1 rounded border border-[#c4c6d0] dark:border-zinc-700 opacity-50">
                  Anterior
                </span>
              ) : (
                <Link
                  href={pageHref(pagina - 1)}
                  className="px-3 py-1 rounded border border-[#c4c6d0] dark:border-zinc-700 hover:bg-[#f8f9fb] dark:hover:bg-zinc-800"
                >
                  Anterior
                </Link>
              )}
              <span className="px-3 py-1 rounded bg-[#0051d5] text-white font-semibold">{pagina}</span>
              {pagina >= totalPages ? (
                <span className="px-3 py-1 rounded border border-[#c4c6d0] dark:border-zinc-700 opacity-50">
                  Siguiente
                </span>
              ) : (
                <Link
                  href={pageHref(pagina + 1)}
                  className="px-3 py-1 rounded border border-[#c4c6d0] dark:border-zinc-700 hover:bg-[#f8f9fb] dark:hover:bg-zinc-800"
                >
                  Siguiente
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4">
          <AttendanceCalendar mes={mes} desde={desde} hasta={hasta} dayStates={monthStates} />
        </div>
      </div>
    </div>
  );
}
