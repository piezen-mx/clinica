"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useSucursal } from "@/contexts/SucursalContext";
import { IPaciente } from "@/interfaces/paciente";
import { IPhoneCode } from "@/interfaces/phone_code";
import { useEffect, useState } from "react";
import PacienteFila from "./componentes/PacienteFila";
import PacienteModal from "./componentes/PacienteModal";
import { getPacientes, savePaciente, buscarPacientesExternos, buscarPacientesPorSucursal, getPhoneCodes, exportPacientesSucursal } from "./actions";
import { SucursalName } from "../componentes/SucursalName";
import { addZeroToday } from "@/utils/date_helpper";

function slugifySucursalName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const EMPTY: IPaciente = {
  id_paciente:                  0,
  nombre:                       "",
  apellido_paterno:             "",
  apellido_materno:             "",
  telefono:                     "",
  whatsapp:                     "",
  fecha_nacimiento:             "",
  sexo:                         "",
  direccion:                    "",
  ciudad_preferida:             "",
  observaciones_generales:      "",
  contacto_emergencia_nombre:   "",
  contacto_emergencia_whatsapp: "",
  created_at:                   "",
  updated_at:                   "",
  deleted_at:                   "",
  id_sucursal:                  0,
  id_empresa:                   0,
  id_phone_code:                52,
  nombre_sucursal:              "",
  en_tratamiento_onicomicosis:  "",
  onicomicosis_ultima_consulta:   false,
  onicocriptosis_ultima_consulta: false,
  sucursal:""
};

export default function PacientesPage() {
  const { user } = useAuth();
  const canSeeWhatsapp = user?.id_role === 1 || user?.id_role === 4;
  const canExportExcel = user?.id_role === 1 || user?.id_role === 4;
  const { selectedId, sucursales } = useSucursal();
  const [pacientes, setPacientes] = useState<IPaciente[]>([]);
  const [phoneCodes, setPhoneCodes] = useState<IPhoneCode[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState<IPaciente>(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [search, setSearch]         = useState("");
  const [extSearch, setExtSearch]   = useState("");
  const [extResults, setExtResults] = useState<IPaciente[]>([]);
  const [extLoading, setExtLoading] = useState(false);
  const [extSearched, setExtSearched] = useState(false);
  const [searchResults, setSearchResults]   = useState<IPaciente[] | null>(null);
  const [searchLoading, setSearchLoading]   = useState(false);

  type SortKey = "nombre" | "apellido_paterno" | "apellido_materno" | "whatsapp" | "sexo" | "nombre_sucursal";
  const [sortKey, setSortKey]   = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc]   = useState(true);

  const handleExtSearch = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    setExtLoading(true);
    setExtSearched(true);
    try {
      const data = await buscarPacientesExternos(extSearch);
      setExtResults(data);
    } finally {
      setExtLoading(false);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((prev) => !prev);
    else { setSortKey(key); setSortAsc(true); }
  };
  const fetchPacientes = async () => {
    setLoading(true);
    try {
      const data = await getPacientes();
      setPacientes(data);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    if (search.trim().length < 3) { setSearchResults(null); return; }
    setSearchLoading(true);
    try {
      const data = await buscarPacientesPorSucursal(search.trim());
      setSearchResults(data);
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => { fetchPacientes(); }, [selectedId]);
  useEffect(() => { getPhoneCodes().then(setPhoneCodes); }, []);

  const openNew = () => {
    setForm({ ...EMPTY, id_sucursal: selectedId, id_empresa: user!.id_empresa });
    setError(null);
    setShowModal(true);
  };

  const openEdit = (p: IPaciente) => {
    setForm({ ...p });
    setError(null);
    setShowModal(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "id_phone_code" ? (value === "" ? null : Number(value)) : name === "id_sucursal" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    // return
    try {
      const result = await savePaciente(form);
      if (!result.ok) throw new Error(result.message ?? "Error al guardar");
      setShowModal(false);
      await fetchPacientes();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportNotice(null);
    try {
      const { rows, nombre_sucursal } = await exportPacientesSucursal();
      if (rows.length === 0) {
        setExportNotice("No hay pacientes para exportar en esta sucursal");
        return;
      }
      const XLSX = await import("xlsx");
      const sheetRows = rows.map((row) => ({
        "Nombre completo": row.nombre_completo,
        ...(canSeeWhatsapp ? { WhatsApp: row.whatsapp } : {}),
        Sucursal: row.nombre_sucursal,
      }));
      const worksheet = XLSX.utils.json_to_sheet(sheetRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Pacientes");
      const fileName = `pacientes_${slugifySucursalName(nombre_sucursal)}_${addZeroToday(new Date())}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } finally {
      setExporting(false);
    }
  };

  const baseList = searchResults ?? pacientes;
  const pacientesFiltrados = baseList
    .filter((p) => {
      const q = search.toLowerCase();
      return (
        p.nombre.toLowerCase().includes(q) ||
        p.apellido_paterno.toLowerCase().includes(q) ||
        p.apellido_materno.toLowerCase().includes(q) ||
        p.whatsapp.includes(q)
      );
    })
    .sort((a, b) => {
      if (!sortKey) return 0;
      const va = String(a[sortKey] ?? "").toLowerCase();
      const vb = String(b[sortKey] ?? "").toLowerCase();
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    });

  return (
    <div>
      <SucursalName/>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-semibold text-zinc-800 dark:text-zinc-50">Pacientes</h2>
          <div className="flex flex-1 items-center gap-2 sm:hidden">
            <input
              type="text"
              placeholder="Buscar pacientes en todas las sucursales por nombre, apellidos o whatsapp… (Enter para buscar)"
              value={extSearch}
              onChange={(e) => setExtSearch(e.target.value)}
              onKeyDown={handleExtSearch}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 placeholder-zinc-400 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
            {extLoading && <span className="text-xs text-zinc-400">Buscando…</span>}
          </div>
        </div>

        <div className="hidden flex-1 items-center gap-2 sm:flex">
          <input
            type="text"
            placeholder="Buscar pacientes en todas las sucursales por nombre, apellidos o whatsapp… (Enter para buscar)"
            value={extSearch}
            onChange={(e) => setExtSearch(e.target.value)}
            onKeyDown={handleExtSearch}
            className="w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 placeholder-zinc-400 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
          {extLoading && <span className="text-xs text-zinc-400">Buscando…</span>}
        </div>

        <div className="flex items-center gap-4">
          {canExportExcel && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              {exporting ? "Exportando…" : "Exportar a Excel"}
            </button>
          )}

          <button
            onClick={openNew}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-600 dark:hover:bg-zinc-500"
          >
            + Nuevo paciente
          </button>
        </div>
      </div>

      {exportNotice && (
        <p className="mb-4 -mt-2 text-sm text-amber-600 dark:text-amber-400">{exportNotice}</p>
      )}

      {extSearched && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
          <div className="px-4 py-2 text-xs font-medium text-blue-700 dark:text-blue-300 border-b border-blue-200 dark:border-blue-800">
            Resultados externos{extResults.length > 0 ? ` — ${extResults.length} encontrado${extResults.length !== 1 ? "s" : ""}` : ""}
          </div>
          {extResults.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-400">Sin coincidencias</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-blue-100 dark:divide-blue-800 text-sm">
                <thead className="bg-blue-100/60 dark:bg-blue-900/30">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">Nombre</th>
                    <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">Ap. paterno</th>
                    <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">Ap. materno</th>
                    {canSeeWhatsapp && <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">Teléfono</th>}
                    <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">Sexo</th>
                    <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">Sucursal</th>
                    <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">Onicomicosis</th>
                    <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">Patologias</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50 dark:divide-blue-900">
                  {extResults.map((p) => (
                    <PacienteFila key={`ext-${p.id_paciente}`} paciente={p} onEdit={openEdit} showWhatsapp={canSeeWhatsapp} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        <input
          type="text"
          placeholder="Buscar por nombre, apellidos o whatsapp… (Enter para buscar en DB)"
          value={search}
          onChange={(e) => { setSearch(e.target.value); if (!e.target.value) setSearchResults(null); }}
          onKeyDown={handleSearchKeyDown}
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-800 placeholder-zinc-400 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
        />
        {searchLoading && <span className="text-xs text-zinc-400 whitespace-nowrap">Buscando…</span>}
        {searchResults !== null && !searchLoading && (
          <span className="text-xs text-zinc-500 whitespace-nowrap">{searchResults.length} en DB</span>
        )}
      </div>

      {loading ? (
        <p className="text-zinc-500">Cargando...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">
            <thead className="bg-zinc-100 dark:bg-zinc-800">
              <tr>
                {([
                  { label: "Nombre",           key: "nombre"            },
                  { label: "Apellido paterno",  key: "apellido_paterno"  },
                  { label: "Apellido materno",  key: "apellido_materno"  },
                  ...(canSeeWhatsapp ? [{ label: "Whatsapp", key: "whatsapp" as SortKey }] : []),
                  { label: "Sexo",              key: "sexo"              },
                  { label: "Sucursal",          key: "nombre_sucursal"   },
                ] as { label: string; key: SortKey }[]).map(({ label, key }) => (
                  <th
                    key={key}
                    onClick={() => toggleSort(key)}
                    className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300 whitespace-nowrap cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    {label}
                    <span className="ml-1 text-xs">
                      {sortKey === key ? (sortAsc ? "▲" : "▼") : <span className="opacity-30">▲</span>}
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Onicomicosis</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Patologias</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700 bg-white dark:bg-zinc-900">
              {pacientesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-zinc-400">Sin registros</td>
                </tr>
              ) : pacientesFiltrados.map((p) => (
                <PacienteFila key={p.id_paciente} paciente={p} onEdit={openEdit} showWhatsapp={canSeeWhatsapp} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <PacienteModal
          form={form}
          saving={saving}
          error={error}
          phoneCodes={phoneCodes}
          sucursales={sucursales}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
