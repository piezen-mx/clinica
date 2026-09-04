"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { EmployeeFormInput, IEmployeeListItem } from "@/interfaces/employee";
import { addZeroToday } from "@/utils/date_helpper";
import { createEmployee, updateEmployee, IEmployeeCatalogs } from "../actions";

interface Props {
  /** Ausente = modo crear. Acepta IEmployeeListItem (listado) o IEmployeeRecord (expediente),
   *  ya que el formulario solo usa los campos propios de IEmployee. */
  employee?: IEmployeeListItem;
  catalogs: IEmployeeCatalogs;
  onClose: () => void;
}

const inputClass =
  "rounded-md border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#0051d5] dark:focus:ring-zinc-400";
const disabledInputClass =
  "rounded-md border border-[#c4c6d0] dark:border-zinc-600 bg-[#eff4ff] dark:bg-zinc-800/60 px-3 py-2 text-sm text-[#44474f] dark:text-zinc-400 cursor-not-allowed";
const labelClass = "text-xs font-medium text-[#44474f] dark:text-zinc-400";

function buildEmptyForm(): EmployeeFormInput {
  return {
    id_sucursal: 0,
    nombre: "",
    apellido_paterno: null,
    apellido_materno: null,
    foto_url: null,
    fecha_ingreso: "",
    id_supervisor: null,
    whatsapp: null,
    email: null,
    rfc: null,
    curp: null,
    nss: null,
    fecha_nacimiento: null,
    genero: null,
    estado_civil: null,
    direccion: null,
    contacto_emergencia: null,
    whatsapp_emergencia: null,
    contacto_emergencia_2: null,
    whatsapp_emergencia_2: null,
    id_department: 0,
    id_puesto: 0,
    id_turno: null,
    dias_laborales: null,
    horario: null,
    salario_diario: null,
    salario_diario_fiscal: null,
    tipo_salario: null,
    cuenta_bancaria: null,
  };
}

function employeeToFormInput(employee: IEmployeeListItem): EmployeeFormInput {
  return {
    id_sucursal: employee.id_sucursal,
    nombre: employee.nombre,
    apellido_paterno: employee.apellido_paterno,
    apellido_materno: employee.apellido_materno,
    foto_url: employee.foto_url,
    fecha_ingreso: employee.fecha_ingreso,
    id_supervisor: employee.id_supervisor,
    whatsapp: employee.whatsapp,
    email: employee.email,
    rfc: employee.rfc,
    curp: employee.curp,
    nss: employee.nss,
    fecha_nacimiento: employee.fecha_nacimiento,
    genero: employee.genero,
    estado_civil: employee.estado_civil,
    direccion: employee.direccion,
    contacto_emergencia: employee.contacto_emergencia,
    whatsapp_emergencia: employee.whatsapp_emergencia,
    contacto_emergencia_2: employee.contacto_emergencia_2,
    whatsapp_emergencia_2: employee.whatsapp_emergencia_2,
    id_department: employee.id_department,
    id_puesto: employee.id_puesto,
    id_turno: employee.id_turno,
    dias_laborales: employee.dias_laborales,
    horario: employee.horario,
    salario_diario: employee.salario_diario,
    salario_diario_fiscal: employee.salario_diario_fiscal,
    tipo_salario: employee.tipo_salario,
    cuenta_bancaria: employee.cuenta_bancaria,
  };
}

function validateForm(form: EmployeeFormInput): string | null {
  if (!form.nombre.trim()) return "El nombre es obligatorio";
  if (!form.id_department) return "El departamento es obligatorio";
  if (!form.id_puesto) return "El puesto es obligatorio";
  if (!form.id_sucursal) return "La sucursal es obligatoria";
  if (!form.fecha_ingreso) return "La fecha de ingreso es obligatoria";
  return null;
}

export default function EmployeeModal({ employee, catalogs, onClose }: Props) {
  const router = useRouter();
  const isEditing = Boolean(employee);

  const [form, setForm]           = useState<EmployeeFormInput>(
    employee ? employeeToFormInput(employee) : buildEmptyForm()
  );
  const [saving, setSaving]       = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const availablePositions = useMemo(
    () => catalogs.positions.filter((position) => position.id_department === form.id_department),
    [catalogs.positions, form.id_department]
  );

  const codePlaceholder = `EMP-${(form.fecha_ingreso || addZeroToday(new Date())).slice(0, 4)}-XXX`;

  const handleTextChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value === "" ? null : value }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value === "" ? null : Number(value) }));
  };

  const handleDepartmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id_department = Number(e.target.value) || 0;
    setForm((prev) => ({ ...prev, id_department, id_puesto: 0 }));
  };

  const handleSelectIdChange = (field: "id_puesto" | "id_sucursal" | "id_turno" | "id_supervisor") =>
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value === "" ? (field === "id_turno" || field === "id_supervisor" ? null : 0) : Number(e.target.value);
      setForm((prev) => ({ ...prev, [field]: value }));
    };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const fileName = `empleado_${Date.now()}.jpg`;
      const uploadRes = await fetch(
        `/api/upload?folder=clinica/empleados&name=${encodeURIComponent(fileName)}`,
        { method: "POST", headers: { "Content-Type": file.type }, body: file }
      );
      const uploadData = await uploadRes.json();
      if (!uploadData.ok) throw new Error(uploadData.data ?? "Error al subir la fotografía");
      setForm((prev) => ({ ...prev, foto_url: uploadData.data }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir la fotografía");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = employee
        ? await updateEmployee(employee.id_empleado, form)
        : await createEmployee(form);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("Error inesperado al guardar el empleado");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-zinc-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#c4c6d0] dark:border-zinc-700 px-6 py-4 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <h3 className="text-lg font-semibold text-[#0b1c30] dark:text-zinc-50">
            {isEditing ? "Editar empleado" : "Nuevo empleado"}
          </h3>
          <button
            onClick={onClose}
            className="text-[#747780] hover:text-[#0b1c30] dark:text-zinc-400 dark:hover:text-zinc-200 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-8">
          {error && (
            <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {/* Datos generales */}
          <section className="flex flex-col gap-4">
            <h4 className="text-sm font-semibold text-[#0b1c30] dark:text-zinc-100 pb-2 border-b border-[#c4c6d0]/50 dark:border-zinc-700/50">
              Datos generales
            </h4>
            <div className="flex flex-col sm:flex-row gap-6">
              <label className="flex-shrink-0 flex flex-col items-center gap-2 cursor-pointer">
                <div className="w-28 h-28 rounded-lg border border-dashed border-[#c4c6d0] dark:border-zinc-600 bg-[#eff4ff] dark:bg-zinc-800 flex items-center justify-center overflow-hidden text-[#44474f] dark:text-zinc-400 hover:bg-[#e5eeff] dark:hover:bg-zinc-700 transition-colors">
                  {form.foto_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.foto_url} alt="Foto del empleado" className="w-full h-full object-cover" />
                  ) : uploadingPhoto ? (
                    <span className="text-xs">Subiendo…</span>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Camera size={22} />
                      <span className="text-xs">Subir foto</span>
                    </div>
                  )}
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} disabled={uploadingPhoto} />
              </label>

              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Nombre(s) *</span>
                  <input type="text" name="nombre" value={form.nombre} onChange={handleTextChange} required className={inputClass} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>ID Empleado</span>
                  <input type="text" disabled value={employee ? employee.codigo_empleado : codePlaceholder} className={disabledInputClass} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Apellido paterno</span>
                  <input type="text" name="apellido_paterno" value={form.apellido_paterno ?? ""} onChange={handleTextChange} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Apellido materno</span>
                  <input type="text" name="apellido_materno" value={form.apellido_materno ?? ""} onChange={handleTextChange} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Fecha de ingreso *</span>
                  <input
                    type="date"
                    name="fecha_ingreso"
                    value={String(form.fecha_ingreso ?? "").slice(0, 10)}
                    onChange={handleTextChange}
                    required
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Sucursal *</span>
                  <select name="id_sucursal" value={form.id_sucursal || ""} onChange={handleSelectIdChange("id_sucursal")} required className={inputClass}>
                    <option value="">Seleccione…</option>
                    {catalogs.sucursales.map((sucursal) => (
                      <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>
                        {sucursal.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Supervisor</span>
                  <select name="id_supervisor" value={form.id_supervisor ?? ""} onChange={handleSelectIdChange("id_supervisor")} className={inputClass}>
                    <option value="">Sin supervisor</option>
                    {catalogs.supervisors.map((supervisor) => (
                      <option key={supervisor.id_empleado} value={supervisor.id_empleado}>
                        {supervisor.nombre_completo}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>WhatsApp</span>
                  <input type="text" name="whatsapp" value={form.whatsapp ?? ""} onChange={handleTextChange} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Correo</span>
                  <input type="email" name="email" value={form.email ?? ""} onChange={handleTextChange} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>RFC</span>
                  <input type="text" name="rfc" value={form.rfc ?? ""} onChange={handleTextChange} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>CURP</span>
                  <input type="text" name="curp" value={form.curp ?? ""} onChange={handleTextChange} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>NSS</span>
                  <input type="text" name="nss" value={form.nss ?? ""} onChange={handleTextChange} className={inputClass} />
                </label>
              </div>
            </div>
          </section>

          {/* Datos personales */}
          <section className="flex flex-col gap-4">
            <h4 className="text-sm font-semibold text-[#0b1c30] dark:text-zinc-100 pb-2 border-b border-[#c4c6d0]/50 dark:border-zinc-700/50">
              Datos personales
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Fecha de nacimiento</span>
                <input
                  type="date"
                  name="fecha_nacimiento"
                  value={String(form.fecha_nacimiento ?? "").slice(0, 10)}
                  onChange={handleTextChange}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Género</span>
                <select name="genero" value={form.genero ?? ""} onChange={handleTextChange} className={inputClass}>
                  <option value="">Seleccione…</option>
                  <option value="femenino">Femenino</option>
                  <option value="masculino">Masculino</option>
                  <option value="otro">Otro</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Estado civil</span>
                <select name="estado_civil" value={form.estado_civil ?? ""} onChange={handleTextChange} className={inputClass}>
                  <option value="">Seleccione…</option>
                  <option value="soltero">Soltero/a</option>
                  <option value="casado">Casado/a</option>
                  <option value="divorciado">Divorciado/a</option>
                  <option value="viudo">Viudo/a</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className={labelClass}>Dirección</span>
                <textarea name="direccion" value={form.direccion ?? ""} onChange={handleTextChange} className={`${inputClass} h-20 resize-none`} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Contacto de emergencia (nombre)</span>
                <input type="text" name="contacto_emergencia" value={form.contacto_emergencia ?? ""} onChange={handleTextChange} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>WhatsApp de emergencia</span>
                <input type="text" name="whatsapp_emergencia" value={form.whatsapp_emergencia ?? ""} onChange={handleTextChange} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Contacto de emergencia 2 (nombre)</span>
                <input type="text" name="contacto_emergencia_2" value={form.contacto_emergencia_2 ?? ""} onChange={handleTextChange} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>WhatsApp de emergencia 2</span>
                <input type="text" name="whatsapp_emergencia_2" value={form.whatsapp_emergencia_2 ?? ""} onChange={handleTextChange} className={inputClass} />
              </label>
            </div>
          </section>

          {/* Información laboral */}
          <section className="flex flex-col gap-4">
            <h4 className="text-sm font-semibold text-[#0b1c30] dark:text-zinc-100 pb-2 border-b border-[#c4c6d0]/50 dark:border-zinc-700/50">
              Información laboral
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Departamento *</span>
                <select name="id_department" value={form.id_department || ""} onChange={handleDepartmentChange} required className={inputClass}>
                  <option value="">Seleccione…</option>
                  {catalogs.departments.map((department) => (
                    <option key={department.id_department} value={department.id_department}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Puesto *</span>
                <select
                  name="id_puesto"
                  value={form.id_puesto || ""}
                  onChange={handleSelectIdChange("id_puesto")}
                  required
                  disabled={!form.id_department}
                  className={inputClass}
                >
                  <option value="">Seleccione…</option>
                  {availablePositions.map((position) => (
                    <option key={position.id_puesto} value={position.id_puesto}>
                      {position.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Turno</span>
                <select name="id_turno" value={form.id_turno ?? ""} onChange={handleSelectIdChange("id_turno")} className={inputClass}>
                  <option value="">Sin turno</option>
                  {catalogs.shifts.map((shift) => (
                    <option key={shift.id_turno} value={shift.id_turno}>
                      {shift.description}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Días laborales</span>
                <input type="text" name="dias_laborales" placeholder="Ej. Lunes a Sábado" value={form.dias_laborales ?? ""} onChange={handleTextChange} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Horario</span>
                <input type="text" name="horario" placeholder="Ej. 09:00 - 18:00" value={form.horario ?? ""} onChange={handleTextChange} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Tipo de salario</span>
                <select name="tipo_salario" value={form.tipo_salario ?? ""} onChange={handleTextChange} className={inputClass}>
                  <option value="">Seleccione…</option>
                  <option value="fijo">Fijo</option>
                  <option value="comision">Por comisión</option>
                  <option value="mixto">Mixto (base + comisión)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Salario diario</span>
                <input type="number" step="0.01" min="0" name="salario_diario" value={form.salario_diario ?? ""} onChange={handleNumberChange} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Salario diario fiscal</span>
                <input type="number" step="0.01" min="0" name="salario_diario_fiscal" value={form.salario_diario_fiscal ?? ""} onChange={handleNumberChange} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className={labelClass}>Cuenta bancaria</span>
                <input type="text" name="cuenta_bancaria" value={form.cuenta_bancaria ?? ""} onChange={handleTextChange} className={inputClass} />
              </label>
            </div>
          </section>

          <div className="flex justify-end gap-3 pt-2 border-t border-[#c4c6d0] dark:border-zinc-700">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#c4c6d0] dark:border-zinc-600 px-4 py-2 text-sm font-medium text-[#44474f] dark:text-zinc-300 hover:bg-[#eff4ff] dark:hover:bg-zinc-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || uploadingPhoto}
              className="rounded-lg bg-[#0051d5] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0051d5]/90 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar empleado"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
