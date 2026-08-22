"use client";

import { IChecador } from "@/interfaces/checador";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { deactivateChecador, getChecadores, saveChecador } from "../actions";
import ConfirmModal from "@/app/dashboard/servicios/componentes/ConfirmModal";

type ChecadorFormData = { id_checador: number; sn: string; id_sucursal: number; nombre: string };

interface Props {
  id_sucursal: number;
  nombreSucursal: string;
  onClose: () => void;
}

function emptyForm(id_sucursal: number): ChecadorFormData {
  return { id_checador: 0, sn: "", id_sucursal, nombre: "" };
}

export default function SucursalCheckadoresModal({ id_sucursal, nombreSucursal, onClose }: Props) {
  const [checadores, setChecadores]   = useState<IChecador[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [form, setForm]               = useState<ChecadorFormData>(emptyForm(id_sucursal));
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  const [deactivating, setDeactivating]     = useState(false);
  const [mounted, setMounted]         = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const fetchChecadores = async () => {
    setLoading(true);
    try {
      const data = await getChecadores(id_sucursal);
      setChecadores(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChecadores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id_sucursal]);

  const openNew = () => {
    setForm(emptyForm(id_sucursal));
    setError(null);
    setShowForm(true);
  };

  const openEdit = (c: IChecador) => {
    setForm({ id_checador: c.id_checador, sn: c.sn, id_sucursal: c.id_sucursal, nombre: c.nombre });
    setError(null);
    setShowForm(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await saveChecador(
        form.id_checador === 0
          ? { sn: form.sn, id_sucursal: form.id_sucursal, nombre: form.nombre }
          : { id_checador: form.id_checador, sn: form.sn, id_sucursal: form.id_sucursal, nombre: form.nombre }
      );
      if (!res.ok) throw new Error(res.message ?? "Error al guardar");
      setShowForm(false);
      await fetchChecadores();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeactivate = async () => {
    if (deactivatingId === null) return;
    setDeactivating(true);
    setDeactivateError(null);
    const res = await deactivateChecador(deactivatingId);
    if (res.ok) {
      setDeactivatingId(null);
      await fetchChecadores();
    } else {
      setDeactivateError(res.message ?? "Error al dar de baja");
    }
    setDeactivating(false);
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-zinc-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-6 py-4">
          <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-50">
            Checadores — {nombreSucursal}
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <div className="flex justify-end">
            <button
              onClick={openNew}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-600 dark:hover:bg-zinc-500"
            >
              + Nuevo checador
            </button>
          </div>

          {loading ? (
            <p className="text-zinc-500">Cargando…</p>
          ) : checadores.length === 0 ? (
            <p className="text-center text-zinc-400 py-6">Esta sucursal no tiene checadores configurados.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">
                <thead className="bg-zinc-100 dark:bg-zinc-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Nombre</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300 whitespace-nowrap">SN</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700 bg-white dark:bg-zinc-900">
                  {checadores.map((c) => (
                    <tr key={c.id_checador} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="px-4 py-3 text-zinc-800 dark:text-zinc-100">{c.nombre}</td>
                      <td className="px-4 py-3 text-zinc-800 dark:text-zinc-100">{c.sn}</td>
                      <td className="px-4 py-3 flex gap-2 justify-end">
                        <button
                          onClick={() => openEdit(c)}
                          className="rounded-md bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600 transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => { setDeactivateError(null); setDeactivatingId(c.id_checador); }}
                          className="rounded-md bg-red-100 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/70 transition-colors"
                        >
                          Dar de baja
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-zinc-200 dark:border-zinc-700 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-300 dark:border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-zinc-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-6 py-4">
              <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-50">
                {form.id_checador === 0 ? "Nuevo checador" : "Editar checador"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
              {error && (
                <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">SN (número de serie)</span>
                <input
                  type="text"
                  name="sn"
                  value={form.sn}
                  onChange={handleChange}
                  required
                  placeholder="Ej. NYU7244801371"
                  className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Nombre descriptivo</span>
                <input
                  type="text"
                  name="nombre"
                  value={form.nombre}
                  onChange={handleChange}
                  required
                  placeholder="Ej. Entrada principal"
                  className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                />
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-600 dark:hover:bg-zinc-500 disabled:opacity-50"
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deactivatingId !== null && (
        <ConfirmModal
          message="¿Deseas dar de baja este checador? Dejará de aceptar checadas hasta que se reactive."
          onConfirm={handleConfirmDeactivate}
          onCancel={() => setDeactivatingId(null)}
          loading={deactivating}
          error={deactivateError}
        />
      )}
    </div>,
    document.body
  );
}
