"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { IAttendanceDayState } from "@/interfaces/asistencia";
import { addZeroToday } from "@/utils/date_helpper";

interface Props {
  mes: string; // "YYYY-MM"
  desde: string; // "YYYY-MM-DD"
  hasta: string; // "YYYY-MM-DD"
  dayStates: IAttendanceDayState[];
}

const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Suma (o resta) meses a un "YYYY-MM", devolviendo otro "YYYY-MM". Cálculo de calendario puro,
 *  sin relación con fecha_hora de BD: usa Date.UTC solo para no arrastrar el huso horario local. */
function shiftMonth(mes: string, delta: number): string {
  const [yearStr, monthStr] = mes.split("-");
  const totalMonths = Number(yearStr) * 12 + (Number(monthStr) - 1) + delta;
  const year = Math.floor(totalMonths / 12);
  const month = totalMonths % 12;
  return `${year}-${pad2(month + 1)}`;
}

function daysInMonth(mes: string): number {
  const [yearStr, monthStr] = mes.split("-");
  return new Date(Date.UTC(Number(yearStr), Number(monthStr), 0)).getUTCDate();
}

/** Índice de columna (0 = Lunes … 6 = Domingo) del primer día del mes. */
function firstWeekdayIndex(mes: string): number {
  const [yearStr, monthStr] = mes.split("-");
  const sundayFirstIndex = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, 1)).getUTCDay();
  return (sundayFirstIndex + 6) % 7;
}

/** Calendario lateral con selección de rango por clic y puntos de estado por día.
 *  Toda interacción se traduce en router.push sobre los search params — no hay estado de
 *  filtro fuera de la URL, solo el "¿es el primer o el segundo clic del rango?" local. */
export default function AttendanceCalendar({ mes, desde, hasta, dayStates }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [awaitingRangeEnd, setAwaitingRangeEnd] = useState(false);

  const dayStatusByDate = new Map(dayStates.map((d) => [d.fecha, d.status]));

  function pushParams(next: { desde: string; hasta: string; mes: string; pagina: number }) {
    const params = new URLSearchParams({
      desde: next.desde,
      hasta: next.hasta,
      mes: next.mes,
      pagina: String(next.pagina),
    });
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleMonthShift(delta: number) {
    pushParams({ desde, hasta, mes: shiftMonth(mes, delta), pagina: 1 });
  }

  function handleDayClick(fecha: string) {
    if (!awaitingRangeEnd) {
      pushParams({ desde: fecha, hasta: fecha, mes, pagina: 1 });
      setAwaitingRangeEnd(true);
      return;
    }

    const newDesde = fecha < desde ? fecha : desde;
    const newHasta = fecha < desde ? desde : fecha;
    pushParams({ desde: newDesde, hasta: newHasta, mes, pagina: 1 });
    setAwaitingRangeEnd(false);
  }

  function handleClearRange() {
    const today = addZeroToday(new Date());
    pushParams({ desde: today, hasta: today, mes: today.slice(0, 7), pagina: 1 });
    setAwaitingRangeEnd(false);
  }

  const [year, month] = mes.split("-");
  const monthLabel = `${MONTH_NAMES[Number(month) - 1]} ${year}`;
  const totalDays = daysInMonth(mes);
  const leadingBlanks = firstWeekdayIndex(mes);

  const cells: (string | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => `${mes}-${pad2(i + 1)}`),
  ];

  return (
    <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-5 flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-base font-semibold text-[#0b1c30] dark:text-zinc-50">{monthLabel}</h3>
            <span className="text-xs text-[#44474f] dark:text-zinc-400">
              Selección: {desde === hasta ? desde.split("-").reverse().join("/") : `${desde.split("-").reverse().join("/")} – ${hasta.split("-").reverse().join("/")}`}
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => handleMonthShift(-1)}
              aria-label="Mes anterior"
              className="w-8 h-8 rounded hover:bg-[#f8f9fb] dark:hover:bg-zinc-800 flex items-center justify-center text-[#44474f] dark:text-zinc-300"
            >
              ‹
            </button>
            <button
              onClick={() => handleMonthShift(1)}
              aria-label="Mes siguiente"
              className="w-8 h-8 rounded hover:bg-[#f8f9fb] dark:hover:bg-zinc-800 flex items-center justify-center text-[#44474f] dark:text-zinc-300"
            >
              ›
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-[#44474f] dark:text-zinc-400 mb-2">
          {WEEKDAY_LABELS.map((label, i) => (
            <div key={i}>{label}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-sm">
          {cells.map((fecha, i) => {
            if (!fecha) return <div key={`blank-${i}`} />;

            const status = dayStatusByDate.get(fecha);
            const isInRange = fecha >= desde && fecha <= hasta;
            const dayNumber = Number(fecha.slice(8, 10));

            return (
              <button
                key={fecha}
                onClick={() => handleDayClick(fecha)}
                className={`relative p-2 rounded transition-colors ${
                  isInRange
                    ? "bg-[#0051d5]/20 dark:bg-[#0051d5]/30 font-semibold text-[#0b1c30] dark:text-zinc-50"
                    : "text-[#0b1c30] dark:text-zinc-100 hover:bg-[#f8f9fb] dark:hover:bg-zinc-800"
                }`}
              >
                {dayNumber}
                {status && (
                  <span
                    className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${
                      status === "complete" ? "bg-[#1e8e3e]" : "bg-[#c8a415]"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-[#c4c6d0] dark:border-zinc-700 grid grid-cols-1 gap-2">
        <div className="flex items-center gap-2 text-xs text-[#44474f] dark:text-zinc-400">
          <span className="w-2.5 h-2.5 rounded-full bg-[#1e8e3e]" /> Día completo (entrada y salida)
        </div>
        <div className="flex items-center gap-2 text-xs text-[#44474f] dark:text-zinc-400">
          <span className="w-2.5 h-2.5 rounded-full bg-[#c8a415]" /> Día incompleto
        </div>
        <div className="flex items-center gap-2 text-xs text-[#44474f] dark:text-zinc-400">
          <span className="w-2.5 h-2.5 rounded bg-[#0051d5]/20 border border-[#0051d5]/40" /> Rango activo
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-[#c4c6d0] dark:border-zinc-700 flex justify-end">
        <button
          onClick={handleClearRange}
          className="text-xs font-semibold text-[#44474f] dark:text-zinc-400 hover:text-[#0b1c30] dark:hover:text-zinc-100 transition-colors"
        >
          Limpiar rango
        </button>
      </div>
    </div>
  );
}
