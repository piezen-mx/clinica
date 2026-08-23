import { getEmployeeIdentifiers, getChecadoresActivos, deactivateEmployeeIdentifier } from "./actions";
import EmployeeIdentifierForm from "./componentes/EmployeeIdentifierForm";

interface Props {
  params: Promise<{ id: string }>;
}

const TIPO_LABELS: Record<string, string> = {
  huella: "Huella",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

/** Baja lógica de un identificador. Server Action inline atada directamente al <form>, sin
 *  necesidad de un client component: la fila trae el id como campo oculto del formulario. */
async function handleDeactivate(formData: FormData): Promise<void> {
  "use server";
  const id_empleado_identificador = Number(formData.get("id_empleado_identificador"));
  await deactivateEmployeeIdentifier(id_empleado_identificador);
}

export default async function EmployeeAttendancePage({ params }: Props) {
  const { id } = await params;
  const id_empleado = Number(id);

  const [identifiers, checadores] = await Promise.all([
    getEmployeeIdentifiers(id_empleado),
    getChecadoresActivos(),
  ]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 flex flex-col gap-5">
        <div>
          <h3 className="text-xl font-bold text-[#0b1c30] dark:text-zinc-50">Identificadores asignados</h3>
          <p className="text-sm text-[#44474f] dark:text-zinc-400">
            PINs, huellas o tarjetas registrados en los checadores biométricos para este empleado.
          </p>
        </div>

        {identifiers.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-8 text-center text-sm text-[#44474f] dark:text-zinc-400">
            Este empleado todavía no tiene ningún identificador asignado.
          </div>
        ) : (
          <div className="overflow-x-auto bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl">
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
                    Identificador
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c4c6d0]/50 dark:divide-zinc-700/50">
                {identifiers.map((item) => (
                  <tr key={item.id_empleado_identificador} className="hover:bg-[#f8f9fb] dark:hover:bg-zinc-800/50">
                    <td className="px-4 py-3 text-[#0b1c30] dark:text-zinc-100">{item.nombre_checador}</td>
                    <td className="px-4 py-3 text-[#0b1c30] dark:text-zinc-100">{item.nombre_sucursal}</td>
                    <td className="px-4 py-3 text-[#0b1c30] dark:text-zinc-100">
                      {TIPO_LABELS[item.tipo] ?? item.tipo}
                    </td>
                    <td className="px-4 py-3 text-[#0b1c30] dark:text-zinc-100 font-mono">{item.identificador}</td>
                    <td className="px-4 py-3 text-right">
                      <form action={handleDeactivate}>
                        <input
                          type="hidden"
                          name="id_empleado_identificador"
                          value={item.id_empleado_identificador}
                        />
                        <button
                          type="submit"
                          className="px-3 py-1.5 text-xs font-semibold text-[#ba1a1a] dark:text-red-400 hover:bg-[#ba1a1a]/10 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          Dar de baja
                        </button>
                      </form>
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
  );
}
