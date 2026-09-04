"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IEmployeeIdentifierListItem } from "@/interfaces/asistencia";
import { IChecadorListItem } from "@/interfaces/checador";
import { deactivateEmployeeIdentifier } from "../actions";
import EmployeeIdentifierForm from "./EmployeeIdentifierForm";

interface Props {
  id_empleado: number;
  identifiers: IEmployeeIdentifierListItem[];
  checadores: IChecadorListItem[];
}

const TIPO_LABELS: Record<string, string> = {
  huella: "Huella",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

/** Botón "Identificadores" + modal con el listado de identificadores asignados y el alta.
 *  Es el mismo contenido que antes vivía en el cuerpo de la pestaña, movido tal cual a un modal. */
export default function EmployeeIdentifiersModal({ id_empleado, identifiers, checadores }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleDeactivate(id_empleado_identificador: number) {
    setDeactivatingId(id_empleado_identificador);
    try {
      await deactivateEmployeeIdentifier(id_empleado_identificador);
      router.refresh();
    } finally {
      setDeactivatingId(null);
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-[#0051d5] text-white text-sm font-semibold rounded-lg hover:bg-[#0043b0] transition-colors"
      >
        Identificadores
      </button>

      {isOpen &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-zinc-900 shadow-xl">
              <div className="flex items-center justify-between border-b border-[#c4c6d0] dark:border-zinc-700 px-6 py-4">
                <h3 className="text-lg font-bold text-[#0b1c30] dark:text-zinc-50">Identificadores</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xl leading-none"
                >
                  &times;
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 p-6">
                <div className="lg:col-span-2 flex flex-col gap-5">
                  <div>
                    <h4 className="text-base font-bold text-[#0b1c30] dark:text-zinc-50">
                      Identificadores asignados
                    </h4>
                    <p className="text-sm text-[#44474f] dark:text-zinc-400">
                      PINs, huellas o tarjetas registrados en los checadores biométricos para este empleado.
                    </p>
                  </div>

                  {identifiers.length === 0 ? (
                    <div className="bg-[#f8f9fb] dark:bg-zinc-800 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-8 text-center text-sm text-[#44474f] dark:text-zinc-400">
                      Este empleado todavía no tiene ningún identificador asignado.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-[#c4c6d0] dark:border-zinc-700 rounded-xl">
                      <table className="min-w-full divide-y divide-[#c4c6d0] dark:divide-zinc-700 text-sm">
                        <thead className="bg-[#f8f9fb] dark:bg-zinc-800">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold text-[#44474f] dark:text-zinc-300 whitespace-nowrap">
                              Checador
                            </th>
                            <th className="px-4 py-3 text-left font-semibold text-[#44474f] dark:text-zinc-300 whitespace-nowrap">
                              Sucursal
                            </th>
                            <th className="px-4 py-3 text-left font-semibold text-[#44474f] dark:text-zinc-300 whitespace-nowrap">
                              Tipo
                            </th>
                            <th className="px-4 py-3 text-left font-semibold text-[#44474f] dark:text-zinc-300 whitespace-nowrap">
                              PIN
                            </th>
                            <th className="px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#c4c6d0]/50 dark:divide-zinc-700/50">
                          {identifiers.map((item) => (
                            <tr
                              key={item.id_empleado_identificador}
                              className="hover:bg-[#f8f9fb] dark:hover:bg-zinc-800/50"
                            >
                              <td className="px-4 py-3 text-[#0b1c30] dark:text-zinc-100">{item.nombre_checador}</td>
                              <td className="px-4 py-3 text-[#0b1c30] dark:text-zinc-100">{item.nombre_sucursal}</td>
                              <td className="px-4 py-3 text-[#0b1c30] dark:text-zinc-100">
                                {TIPO_LABELS[item.tipo] ?? item.tipo}
                              </td>
                              <td className="px-4 py-3 text-[#0b1c30] dark:text-zinc-100 font-mono">
                                {item.identificador}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={() => handleDeactivate(item.id_empleado_identificador)}
                                  disabled={deactivatingId === item.id_empleado_identificador}
                                  className="px-3 py-1.5 text-xs font-semibold text-[#ba1a1a] dark:text-red-400 hover:bg-[#ba1a1a]/10 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {deactivatingId === item.id_empleado_identificador ? "Dando de baja…" : "Baja"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-1">
                  <EmployeeIdentifierForm id_empleado={id_empleado} checadores={checadores} />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-[#c4c6d0] dark:border-zinc-700 px-6 py-4">
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg border border-[#c4c6d0] dark:border-zinc-600 px-4 py-2 text-sm font-medium text-[#44474f] dark:text-zinc-300 hover:bg-[#f8f9fb] dark:hover:bg-zinc-800 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
