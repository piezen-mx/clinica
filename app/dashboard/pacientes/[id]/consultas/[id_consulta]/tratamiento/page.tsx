"use client";

import { IMetodoPago } from "@/interfaces/metodo_pago";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  EspecialistaOption,
  PagoFormData,
  TratamientoFormData,
  checkOnicomicosisGrado2,
  checkTratamientoExists,
  getDefaultTotalTratamiento,
  getEspecialistas,
  getMetodosPago,
  saveTratamiento,
} from "./actions";
import PagoTratamientoForm from "./componentes/PagoTratamientoForm";
import TratamientoForm from "./componentes/TratamientoForm";

const TRATAMIENTO_DEFAULTS: TratamientoFormData = {
  peso:                   "",
  talla:                  "",
  altura:                 "",
  antecedentes_cronicos:  "",
  antecedentes_hepaticos: "",
  alergias:               "",
  medicacion_actual:      "",
  id_especialista:        0,
};

const PAGO_DEFAULTS: PagoFormData = {
  total:        950,
  idMetodoPago: 0,
  referencia:   "",
};

export default function TratamientoPage() {
  const router       = useRouter();
  const params       = useParams();
  const id_paciente  = Number(params.id);
  const id_consulta  = Number(params.id_consulta);

  const [especialistas, setEspecialistas] = useState<EspecialistaOption[]>([]);
  const [metodosPago,   setMetodosPago  ] = useState<IMetodoPago[]>([]);
  const [loadingData,      setLoadingData     ] = useState(true);
  const [saving,           setSaving          ] = useState(false);
  const [error,            setError           ] = useState<string | null>(null);
  const [confirming,        setConfirming       ] = useState(false);
  const [tratamientoExiste,  setTratamientoExiste] = useState(false);
  const [onicomicosisGrado2, setOnicomicosisGrado2] = useState(false);

  const [tratamientoForm, setTratamientoForm] = useState<TratamientoFormData>(TRATAMIENTO_DEFAULTS);
  const [pagoForm,        setPagoForm       ] = useState<PagoFormData>(PAGO_DEFAULTS);

  useEffect(() => {
    Promise.all([
      getEspecialistas(),
      getMetodosPago(),
      getDefaultTotalTratamiento(),
      checkTratamientoExists(id_consulta),
      checkOnicomicosisGrado2(id_consulta),
    ]).then(([esp, mp, defaultTotal, existe, grado2]) => {
      setEspecialistas(esp);
      setMetodosPago(mp);
      setPagoForm((prev) => ({ ...prev, total: defaultTotal }));
      setTratamientoExiste(existe);
      setOnicomicosisGrado2(grado2);
      setLoadingData(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTratamientoChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setTratamientoForm((prev) => ({
      ...prev,
      [name]: name === "id_especialista" ? Number(value) : value,
    }));
  };

  const handlePagoChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setPagoForm((prev) => ({
      ...prev,
      [name]: name === "idMetodoPago" ? Number(value) : name === "total" ? Number(value) : value,
    }));
  };

  const handleGuardarClick = () => {
    setError(null);

    if (!tratamientoForm.peso || !tratamientoForm.talla || !tratamientoForm.altura) {
      setError("Peso, talla y altura son requeridos.");
      return;
    }
    if (!tratamientoForm.id_especialista) {
      setError("Selecciona un especialista.");
      return;
    }
    if (!pagoForm.idMetodoPago) {
      setError("Selecciona un método de pago.");
      return;
    }
    if (!tratamientoForm.antecedentes_cronicos || !tratamientoForm.antecedentes_hepaticos || !tratamientoForm.  medicacion_actual || !tratamientoForm.alergias) {
      setError("Todos los antecedentes, alergias y medicación son requeridos.");
      return;
    }

    setConfirming(true);
  };

  const handleConfirmSave = async () => {
    setConfirming(false);
    setSaving(true);
    const result = await saveTratamiento(id_consulta, tratamientoForm, pagoForm);
    setSaving(false);

    if (!result.ok) {
      setError(result.message ?? "Error al guardar.");
      return;
    }

    // Send WhatsApp to specialist
    if (result.especialistaTelefono) {
      const digits  = result.especialistaTelefono.replace(/\D/g, "");
      const phone   = digits.startsWith("52") ? digits : `52${digits}`;
      const fechaFmt = (() => {
        if (!result.createdAt) return "";
        const d = new Date(String(result.createdAt).replace(" ", "T"));
        const dd   = String(d.getDate()).padStart(2, "0");
        const mm   = String(d.getMonth() + 1).padStart(2, "0");
        const yyyy = d.getFullYear();
        const hh   = String(d.getHours()).padStart(2, "0");
        const min  = String(d.getMinutes()).padStart(2, "0");
        return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
      })();
      const msg = [
        `Hola ${result.nombreEspecialista ?? "especialista"}`,
        `Usted tiene un nuevo tratamiento de ${result.nombrePaciente ?? "Paciente"}${fechaFmt ? `, ${fechaFmt}` : ""}.`,
        `Sucursal: ${result.nombreSucursal ?? "Desconocida"}.`,
        `Favor de revisar la página de Piezen.`,
      ].join("\n");
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    }

    router.push(`/dashboard/pacientes/${id_paciente}/consultas/${id_consulta}`);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Regresar
        </button>
        <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
          Solicitud de tratamiento — Onicomicosis
        </h1>
      </div>

      {loadingData ? (
        <p className="text-sm text-zinc-400">Cargando datos…</p> 
      ) : (
        <>
          <TratamientoForm
            form={tratamientoForm}
            especialistas={especialistas}
            onChange={handleTratamientoChange}
            disabled={saving}
          />

          <PagoTratamientoForm
            form={pagoForm}
            metodosPago={metodosPago}
            onChange={handlePagoChange}
            disabled={saving}
          />

          {error && (
            <p className="rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}

          {!onicomicosisGrado2 && (
            <p className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
              La consulta no tiene <strong>onicomicosis grado 2</strong> registrada en patología ungueal. El tratamiento no puede solicitarse.
            </p>
          )}

          {tratamientoExiste && (
            <p className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
              Ya existe un registro de tratamiento para esta consulta. No se puede guardar de nuevo.
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleGuardarClick}
              disabled={saving || tratamientoExiste || !onicomicosisGrado2}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-2 text-sm font-semibold text-white transition-colors"
            >
              {saving ? (
                <>
                  <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Guardando…
                </>
              ) : (
                "Guardar"
              )}
            </button>
          </div>
        </>
      )}

      {confirming && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-zinc-900 shadow-xl">
            <div className="px-6 py-5 space-y-2">
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                Confirmar registro
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                ¿Deseas guardar el tratamiento de onicomicosis y su pago? Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t border-zinc-200 dark:border-zinc-700 px-6 py-4">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-zinc-300 dark:border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
