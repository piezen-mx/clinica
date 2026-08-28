"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import {
  getTratamientoDetalle,
  getArchivosByConsulta,
  markTratamientoRevisado,
  updateTratamientoStage,
  hasPagoTipo2,
  getConsultasByTratamiento,
  createConsultaOnicomicosis,
} from "@/app/dashboard/tratamientos/actions";
import { getSucursalesActivas } from "@/app/dashboard/pacientes/[id]/expediente/actions";
import ConsultaModal from "@/app/dashboard/pacientes/[id]/expediente/componentes/ConsultaModal";
import { ITratamientoOnicomicosis } from "@/interfaces/tratamiento_onicomicosis";
import AccordionSolicitud from "./componentes/AccordionSolicitud";
import AccordionPagos from "./componentes/AccordionPagos";
import AccordionEgresos from "./componentes/AccordionEgresos";
import AccordionRecetas from "./componentes/AccordionRecetas";
import AccordionConsultas from "./componentes/AccordionConsultas";

import { useAuth } from "@/contexts/AuthContext";
import { ICita } from "@/interfaces/cita";
import { IConsulta } from "@/interfaces/consulta";
import { IPaciente } from "@/interfaces/paciente";
import { ISucursal } from "@/interfaces/sucursal";
import { IUser } from "@/interfaces/user";
import { buildDate } from "@/utils/date_helpper";
import { getPacientes, getPodologos, getServicioOpciones, saveCita } from "@/app/dashboard/citas/actions";
import CitaModal from "@/app/dashboard/citas/componentes/CitaModal";
import ConfirmModal from "@/app/dashboard/componentes/ConfirmModal";
import CopyButton, { WhatsAppIcon } from "@/app/dashboard/componentes/CopyButton";

type DetailRow = ITratamientoOnicomicosis & {
  nombre_paciente:     string;
  nombre_especialista: string;
  nombre_usuario:      string;
  nombre_stage:        string;
  nombre_sucursal:     string | null;
  id_paciente:         number;
  id_podologo:         number;
  id_sucursal:         number;
  whatsapp:            string | null;
  phone_code:          string | null;
  edad_paciente:       number | null;
};

function buildSolicitudMessage(detalle: DetailRow): string {
  const fechaFmt = (() => {
    if (!detalle.created_at) return "";
    const d = new Date(String(detalle.created_at).replace(" ", "T"));
    const dd   = String(d.getDate()).padStart(2, "0");
    const mm   = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh   = String(d.getHours()).padStart(2, "0");
    const min  = String(d.getMinutes()).padStart(2, "0");
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
  })();
  return [
    `Hola ${detalle.nombre_especialista ?? "especialista"}`,
    `Usted tiene un nuevo tratamiento de ${detalle.nombre_paciente ?? "Paciente"}${fechaFmt ? `, ${fechaFmt}` : ""}.`,
    `Sucursal: ${detalle.nombre_sucursal ?? "Desconocida"}.`,
    `Favor de revisar la página de Piezen.`,
  ].join("\n");
}

const EMPTY: ICita = {
  id_cita:            0,
  id_paciente:        0,
  id_podologo:        0,
  fecha_inicio:       "",
  fecha_fin:          "",
  estado:             "agendada",
  motivo_cancelacion: "",
  created_at:         "",
  deleted_at:         "",
  id_sucursal:        0,
  id_empresa:         0,
};

const EMPTY_CONSULTA: IConsulta = {
  id_consulta:          0,
  id_paciente:          0,
  id_podologo:          0,
  fecha:                "",
  diagnostico:          "",
  tratamiento_aplicado: "",
  observaciones:        "",
  created_at:           "",
  deleted_at:           "",
  costo_total:          0,
  id_sucursal:          0,
  id_empresa:           0,
  cancelada:            false,
  motivo_cancelada:     null,
  is_onicomicosis:      true,
  id_tratamiento:       null,
  id_buzon:             null,
};

interface Props {
  params: Promise<{ id_tratamiento: string }>;
}

export default function TratamientoDetallePage({ params }: Props) {
  const { id_tratamiento: id_str } = use(params);
  const id_tratamiento = Number(id_str);
  const router = useRouter();

  const { user }                          = useAuth();

  const [detalle, setDetalle]   = useState<DetailRow | null>(null);
  const [marking, setMarking]   = useState(false);
  const [archivos, setArchivos] = useState<{ id_archivo: number; ruta: string; categoria: string }[]>([]);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  // States for CitaModal
  const [pacientes, setPacientes]           = useState<IPaciente[]>([]);
  const [podologos, setPodologos]           = useState<IUser[]>([]);
  const [servicioOpciones, setServicioOpciones] = useState<{ id_servicio_opcion: number; nombre: string }[]>([]);
  const [showModal, setShowModal]         = useState(false);
  const [form, setForm]                   = useState<ICita>(EMPTY);
  const [savingCita, setSavingCita]       = useState(false);
  const [errorCita, setErrorCita]         = useState<string | null>(null);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [cancellingStage, setCancellingStage]     = useState(false);
  const [errorCancel, setErrorCancel]             = useState<string | null>(null);
  const [tienePagoTipo2, setTienePagoTipo2]       = useState(false);
  const [numConsultas, setNumConsultas]             = useState(0);
  const [finalizando, setFinalizando]               = useState(false);
  const [showConfirmFinalizar, setShowConfirmFinalizar] = useState(false);
  const [errorFinalizar, setErrorFinalizar]         = useState<string | null>(null);

  // States for ConsultaModal
  const [showConsultaModal,   setShowConsultaModal  ] = useState(false);
  const [consultaForm,        setConsultaForm       ] = useState<IConsulta>(EMPTY_CONSULTA);
  const [savingConsulta,      setSavingConsulta     ] = useState(false);
  const [errorConsulta,       setErrorConsulta      ] = useState<string | null>(null);
  const [sucursales,          setSucursales         ] = useState<ISucursal[]>([]);
  const [sucursalesLoaded,    setSucursalesLoaded   ] = useState(false);

  useEffect(() => {
    getTratamientoDetalle(id_tratamiento).then(async (row) => {
      if (!row) {
        setNotFound(true);
      } else {
        setDetalle(row as DetailRow);
        const [imgs, tienePago, consultas] = await Promise.all([
          getArchivosByConsulta(row.id_consulta),
          hasPagoTipo2(id_tratamiento),
          getConsultasByTratamiento(id_tratamiento),
        ]);
        setArchivos(imgs);
        setTienePagoTipo2(tienePago);
        setNumConsultas(consultas.length);
      }
      setLoading(false);
    });
  }, [id_tratamiento]);

  useEffect(() => {
    getPacientes().then(setPacientes).catch(console.error);
    getPodologos().then(setPodologos).catch(console.error);
    getServicioOpciones().then(setServicioOpciones).catch(console.error);
  }, []);

  const openCrearConsulta = async () => {
    if (!detalle) return;
    if (!sucursalesLoaded) {
      const data = await getSucursalesActivas();
      setSucursales(data);
      setSucursalesLoaded(true);
    }
    setConsultaForm({
      ...EMPTY_CONSULTA,
      id_paciente:    detalle.id_paciente,
      id_podologo:    user?.id_role === 2 ? user.id_user : detalle.id_podologo,
      id_sucursal:    detalle.id_sucursal,
      id_empresa:     user!.id_empresa,
      id_tratamiento: id_tratamiento,
    });
    setErrorConsulta(null);
    setShowConsultaModal(true);
  };

  const handleConsultaChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setConsultaForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleConsultaPodologoChange = (id: number) => {
    setConsultaForm((prev) => ({ ...prev, id_podologo: id }));
  };

  const handleConsultaSucursalChange = (id: number) => {
    setConsultaForm((prev) => ({ ...prev, id_sucursal: id }));
  };

  const handleConsultaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConsulta(true);
    setErrorConsulta(null);
    try {
      const result = await createConsultaOnicomicosis({
        id_paciente:          consultaForm.id_paciente,
        id_podologo:          consultaForm.id_podologo,
        diagnostico:          consultaForm.diagnostico,
        tratamiento_aplicado: consultaForm.tratamiento_aplicado,
        observaciones:        consultaForm.observaciones,
        costo_total:          Number(consultaForm.costo_total),
        id_sucursal:          consultaForm.id_sucursal,
        id_empresa:           consultaForm.id_empresa,
        id_tratamiento:       id_tratamiento,
      });
      if (!result.ok) {
        setErrorConsulta(result.message ?? "Error al crear la consulta");
      } else {
        if (detalle && detalle.id_stage <= 3) {
          await updateTratamientoStage(id_tratamiento, 4);
        }
        setShowConsultaModal(false);
        router.push(`/dashboard/pacientes/${detalle!.id_paciente}/consultas/${result.id_consulta}`);
      }
    } catch {
      setErrorConsulta("Error inesperado");
    } finally {
      setSavingConsulta(false);
    }
  };

  const openCrearCitaByTratamiento = () => {
    if (!detalle) return;
    setForm({
      ...EMPTY,
      id_paciente:    detalle.id_paciente,
      id_podologo:    detalle.id_podologo,
      id_tratamiento: id_tratamiento,
      id_consulta:    undefined,
      id_sucursal:    detalle.id_sucursal,
      id_empresa:     user!.id_empresa,
    });
    setErrorCita(null);
    setShowModal(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCita(true);
    setErrorCita(null);
    try {
      const payload = {
        ...form,
        created_at: form.created_at || buildDate(new Date()),
      };
      const result = await saveCita(payload);
      if (!result.ok) throw new Error(result.message ?? "Error al guardar");
      setShowModal(false);
    } catch (err: unknown) {
      setErrorCita(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      if(detalle && detalle.id_stage<=3){
        await updateTratamientoStage(id_tratamiento, 4);
      }
      setSavingCita(false);
    }
  };

  if (loading) {
    return <p className="p-6 text-zinc-500 dark:text-zinc-400">Cargando…</p>;
  }

  if (notFound || !detalle) {
    return (
      <div className="p-6">
        <p className="text-red-600 dark:text-red-400">Tratamiento no encontrado.</p>
        <button
          onClick={() => router.back()}
          className="mt-4 rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600 transition-colors"
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={() => router.back()}
            className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600 transition-colors"
          >
            ← Volver
          </button>
          <h1 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">
            Detalle del Tratamiento #{detalle.id_tratamiento}
          </h1>
          <CopyButton
            text={buildSolicitudMessage(detalle)}
            label="Copiar solicitud"
            icon={<WhatsAppIcon />}
            className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 dark:border-green-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
          />
          {detalle.new_message && (
            <>
              <span className="rounded-md bg-yellow-100 px-3 py-1.5 text-sm text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200">
                {detalle.message}
              </span>
              <button
                disabled={marking}
                onClick={async () => {
                  setMarking(true);
                  await markTratamientoRevisado(id_tratamiento);
                  setDetalle((prev) => prev ? { ...prev, new_message: false, message: "" } : prev);
                  setMarking(false);
                }}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {marking ? "…" : "Revisado"}
              </button>
            </>
          )}
        </div>
          {
            user?.id_role !== 5 && detalle.id_stage<5 && (
              <div className="flex gap-2">
                {tienePagoTipo2 && (
                <button
                  onClick={openCrearConsulta}
                  className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-600 dark:hover:bg-zinc-500 whitespace-nowrap"
                >
                  Crear consulta
                </button>
                )}
                {tienePagoTipo2 && (
                <button
                  onClick={openCrearCitaByTratamiento}
                  className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-600 dark:hover:bg-zinc-500 whitespace-nowrap"
                >
                  Crear cita
                </button>
                )}
                {numConsultas >= 6 && detalle.id_stage < 5  && (
                  <button
                    onClick={() => { setErrorFinalizar(null); setShowConfirmFinalizar(true); }}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 whitespace-nowrap"
                  >
                    Finalizar
                  </button>
                )}
                {detalle.id_stage !== 6 && (
                  <button
                    onClick={() => { setErrorCancel(null); setShowConfirmCancel(true); }}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )
          }
      </div>

      <div className="flex flex-col gap-4">
        <AccordionSolicitud
            detalle={detalle}
            archivos={archivos}
            onStageUpdated={() => setDetalle((prev) => prev ? { ...prev, id_stage: 2 } : prev)}
          />
        {
          user?.id_role !== 5 && 
          <>
          <AccordionPagos
              id_tratamiento={id_tratamiento}
              nombre_paciente={detalle.nombre_paciente}
              onFirstPago={() => setTienePagoTipo2(true)}
              stage={detalle.id_stage}
            />
          </>
        }
        <AccordionEgresos id_tratamiento={id_tratamiento} stage={detalle.id_stage}/>
        <AccordionRecetas
          id_tratamiento={id_tratamiento}
          nombre_paciente={detalle.nombre_paciente}
          nombre_podologo={detalle.nombre_usuario}
          nombre_especialista={detalle.nombre_especialista}
          whatsapp={detalle.whatsapp ?? null}
          phone_code={detalle.phone_code ?? null}
          id_stage={detalle.id_stage}
          id_role={user?.id_role || 0}
        />
        <AccordionConsultas
          id_tratamiento={id_tratamiento}
          id_paciente={detalle.id_paciente}
        />
      </div>

      {showConfirmFinalizar && (
        <ConfirmModal
          message="¿Estás seguro de que deseas finalizar este tratamiento?"
          confirmLabel="Aceptar"
          loading={finalizando}
          error={errorFinalizar}
          onCancel={() => setShowConfirmFinalizar(false)}
          onConfirm={async () => {
            setFinalizando(true);
            setErrorFinalizar(null);
            try {
              await updateTratamientoStage(id_tratamiento, 5);
              setDetalle((prev) => prev ? { ...prev, id_stage: 5 } : prev);
              setShowConfirmFinalizar(false);
            } catch {
              setErrorFinalizar("Error al finalizar el tratamiento");
            } finally {
              setFinalizando(false);
            }
          }}
        />
      )}

      {showConfirmCancel && (
        <ConfirmModal
        confirmLabel="Aceptar"
          message="¿Estás seguro de que deseas cancelar este tratamiento?"
          loading={cancellingStage}
          error={errorCancel}
          onCancel={() => setShowConfirmCancel(false)}
          onConfirm={async () => {
            setCancellingStage(true);
            setErrorCancel(null);
            try {
              await updateTratamientoStage(id_tratamiento, 6);
              setDetalle((prev) => prev ? { ...prev, id_stage: 6 } : prev);
              setShowConfirmCancel(false);
            } catch {
              setErrorCancel("Error al cancelar el tratamiento");
            } finally {
              setCancellingStage(false);
            }
          }}
        />
      )}

      {showModal && (
        <CitaModal
          form={form}
          pacientes={pacientes}
          servicioOpciones={servicioOpciones}
          saving={savingCita}
          error={errorCita}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onClose={() => setShowModal(false)}
        />
      )}

      {showConsultaModal && (
        <ConsultaModal
          form={consultaForm}
          saving={savingConsulta}
          error={errorConsulta}
          podologos={podologos}
          sucursales={sucursales}
          currentUser={user ?? undefined}
          onChange={handleConsultaChange}
          onPodologoChange={handleConsultaPodologoChange}
          onSucursalChange={handleConsultaSucursalChange}
          onSubmit={handleConsultaSubmit}
          onClose={() => setShowConsultaModal(false)}
        />
      )}
    </div>
  );
}
