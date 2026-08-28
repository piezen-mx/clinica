"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getServiciosTabData,
  selectServicioOpcion,
  ServicioConOpciones,
} from "../actions";
import { IConsultaServicio } from "@/interfaces/consulta_servicio";

// ─── types ────────────────────────────────────────────────────────────────────

interface Props {
  id_consulta:   number;
  locked?:       boolean;
  onContinuar?:  () => void;
  onTotalChange?: (total: number) => void;
  is_onicomicosis?: boolean;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function TabServicios({ id_consulta, locked, onContinuar, onTotalChange, is_onicomicosis }: Props) {
  const [servicios,         setServicios        ] = useState<ServicioConOpciones[]>([]);
  const [consultaServicios, setConsultaServicios] = useState<IConsultaServicio[]>([]);
  const [loading,           setLoading          ] = useState(true);
  const [error,             setError            ] = useState<string | null>(null);
  const [isPending,         startTransition     ] = useTransition();

  // Track which servicio is currently being saved
  const [savingId, setSavingId] = useState<number | null>(null);

  // Report services total to parent whenever selected options change
  useEffect(() => {
    const total = consultaServicios.reduce((s, cs) => s + Number(cs.precio_aplicado), 0);
    onTotalChange?.(total);
  }, [consultaServicios]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getServiciosTabData(id_consulta).then((data) => {
      if (cancelled) return;
      setServicios(data.servicios);
      setConsultaServicios(data.consultaServicios);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setError("Error al cargar los servicios");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id_consulta]);

  // Returns the currently selected id_servicio_opcion for a given servicio
  const getSelected = (id_servicio: number): number => {
    const opcionIds = servicios
      .find((s) => s.id_servicio === id_servicio)
      ?.opciones.map((o) => o.id_servicio_opcion) ?? [];
    return (
      consultaServicios.find((cs) => opcionIds.includes(cs.id_servicio_opcion))
        ?.id_servicio_opcion ?? 0
    );
  };

  // All services loaded for this sucursal must have a selection before continuing
  const canContinuar = 
  // is_onicomicosis || 
  (servicios.length > 0 && servicios.every((s) => getSelected(s.id_servicio) !== 0));

  const handleSelect = (
    id_servicio:        number,
    id_servicio_opcion: number,
    precio:             number,
  ) => {
    setSavingId(id_servicio);
    setError(null);
    startTransition(async () => {
      const res = await selectServicioOpcion(
        id_consulta,
        id_servicio,
        id_servicio_opcion,
        precio,
      );
      setSavingId(null);
      if (!res.ok) {
        setError(res.data as string);
        return;
      }
      // Update local consulta_servicios state
      setConsultaServicios((prev) => {
        const opcionIds = servicios
          .find((s) => s.id_servicio === id_servicio)
          ?.opciones.map((o) => o.id_servicio_opcion) ?? [];
        const filtered = prev.filter((cs) => !opcionIds.includes(cs.id_servicio_opcion));
        if (res.data) return [...filtered, res.data as IConsultaServicio];
        return filtered;
      });
    });
  };

  // ── render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return <p className="text-zinc-400 text-sm">Cargando servicios...</p>;
  }

  if (servicios.length === 0) {
    return (
      <p className="text-zinc-400 text-sm">
        Debe agregar servicios y las opciones.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </p>
      )}

      {servicios.map((servicio) => {
        const selectedOpcion = getSelected(servicio.id_servicio);
        const isSaving       = isPending && savingId === servicio.id_servicio;

        return (
          <div
            key={servicio.id_servicio}
            className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden"
          >
            {/* service header */}
            <div className="flex items-center justify-between px-4 py-3 bg-zinc-100 dark:bg-zinc-800">
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                {servicio.nombre}
              </span>
              {isSaving && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">Guardando...</span>
              )}
            </div>

            {/* opciones */}
            {servicio.opciones.length === 0 ? (
              <p className="px-4 py-3 text-xs text-zinc-400">Sin opciones configuradas.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-700">
                {servicio.opciones.map((opcion) => {
                  const checked = selectedOpcion === opcion.id_servicio_opcion;
                  return (
                    <li key={opcion.id_servicio_opcion}>
                      <label className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none transition-colors ${
                        checked
                          ? "bg-zinc-50 dark:bg-zinc-800/60"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                      }`}>
                        <input
                          type="radio"
                          name={`servicio_${servicio.id_servicio}`}
                          value={opcion.id_servicio_opcion}
                          checked={checked}
                          disabled={isSaving || locked}
                          onChange={() =>
                            handleSelect(
                              servicio.id_servicio,
                              opcion.id_servicio_opcion,
                              opcion.precio,
                            )
                          }
                          className="h-4 w-4 border-zinc-300 text-zinc-800 focus:ring-zinc-500"
                        />
                        <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">
                          {opcion.nombre}
                        </span>
                        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400 tabular-nums">
                          ${Number(opcion.precio).toFixed(2)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      {!locked && onContinuar && (
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onContinuar}
            disabled={!canContinuar}
            className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors dark:bg-zinc-600 dark:hover:bg-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continuar
          </button>
        </div>
      )}
    </div>
  );
}
