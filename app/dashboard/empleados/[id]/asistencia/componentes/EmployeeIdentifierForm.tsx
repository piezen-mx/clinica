"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IChecadorListItem } from "@/interfaces/checador";
import { saveEmployeeIdentifier } from "../actions";

interface Props {
  id_empleado: number;
  checadores: IChecadorListItem[];
}

const TIPO_OPTIONS: { value: "huella" | "tarjeta" | "otro"; label: string }[] = [
  { value: "huella", label: "Huella" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "otro", label: "Otro" },
];

/** Panel "Asignar identificador": select de checador activo, PIN crudo y tipo; llama saveEmployeeIdentifier. */
export default function EmployeeIdentifierForm({ id_empleado, checadores }: Props) {
  const [idChecador, setIdChecador] = useState("");
  const [identificador, setIdentificador] = useState("");
  const [tipo, setTipo] = useState<"huella" | "tarjeta" | "otro">("huella");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const noChecadores = checadores.length === 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!idChecador) {
      setError("Selecciona un checador");
      return;
    }
    if (!identificador.trim()) {
      setError("Captura el identificador (PIN)");
      return;
    }

    setSaving(true);
    try {
      const result = await saveEmployeeIdentifier({
        id_empleado,
        id_checador: Number(idChecador),
        identificador: identificador.trim(),
        tipo,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setIdChecador("");
      setIdentificador("");
      setTipo("huella");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-6 flex flex-col gap-5">
      <div>
        <h3 className="text-lg font-bold text-[#0b1c30] dark:text-zinc-50 mb-1">Asignar identificador</h3>
        <p className="text-sm text-[#44474f] dark:text-zinc-400">
          Registra la huella, tarjeta o PIN de este empleado en un checador.
        </p>
      </div>

      {noChecadores ? (
        <p className="text-sm text-[#44474f] dark:text-zinc-400">
          No hay checadores activos dados de alta. Da de alta uno desde{" "}
          <span className="font-semibold">Sucursales → Checadores</span> antes de asignar un identificador.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-[#0b1c30] dark:text-zinc-50">Checador</span>
            <select
              value={idChecador}
              onChange={(e) => setIdChecador(e.target.value)}
              disabled={saving}
              className="w-full bg-white dark:bg-zinc-800 border border-[#c4c6d0] dark:border-zinc-700 rounded-lg py-2 px-3 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:border-[#0051d5]"
            >
              <option value="">Selecciona un checador…</option>
              {checadores.map((c) => (
                <option key={c.id_checador} value={c.id_checador}>
                  {c.nombre_sucursal} — {c.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-[#0b1c30] dark:text-zinc-50">Identificador (PIN)</span>
            <input
              type="text"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
              disabled={saving}
              placeholder="Ej. 1"
              className="w-full bg-white dark:bg-zinc-800 border border-[#c4c6d0] dark:border-zinc-700 rounded-lg py-2 px-3 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:border-[#0051d5]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-[#0b1c30] dark:text-zinc-50">Tipo</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "huella" | "tarjeta" | "otro")}
              disabled={saving}
              className="w-full bg-white dark:bg-zinc-800 border border-[#c4c6d0] dark:border-zinc-700 rounded-lg py-2 px-3 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:border-[#0051d5]"
            >
              {TIPO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {error && (
            <p className="text-xs text-[#ba1a1a] dark:text-red-400 bg-[#ba1a1a]/5 dark:bg-red-900/20 border border-[#ba1a1a]/20 dark:border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-[#0051d5] text-white text-sm font-semibold rounded-lg hover:bg-[#0043b0] transition-colors disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Asignar identificador"}
          </button>
        </form>
      )}
    </div>
  );
}
