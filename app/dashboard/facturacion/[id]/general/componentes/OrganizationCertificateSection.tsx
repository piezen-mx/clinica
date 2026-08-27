"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldOff, Trash2, UploadCloud } from "lucide-react";
import type { Organization } from "facturapi";
import { uploadCertificate, deleteCertificate } from "../../../actions";
import ConfirmModal from "@/app/dashboard/componentes/ConfirmModal";

interface Props {
  orgId: string;
  organization: Organization;
}

const inputClass =
  "rounded-md border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#0051d5] dark:focus:ring-zinc-400";
const labelClass = "text-xs font-medium text-[#44474f] dark:text-zinc-400";

export default function OrganizationCertificateSection({ orgId, organization }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { has_certificate, expires_at } = organization.certificate;

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData(e.currentTarget);
      formData.set("orgId", orgId);
      const result = await uploadCertificate(formData);
      if (!result.ok) {
        setUploadError(result.message);
        return;
      }
      router.refresh();
      formRef.current?.reset();
    } catch {
      setUploadError("Error inesperado al subir el certificado");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteCertificate(orgId);
      if (!result.ok) {
        setDeleteError(result.message);
        return;
      }
      setShowDeleteConfirm(false);
      router.refresh();
    } catch {
      setDeleteError("Error inesperado al eliminar el certificado");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-6 shadow-sm flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#0b1c30] dark:text-zinc-100">Certificado de sello digital (CSD)</h3>
        {has_certificate ? (
          <span className="flex items-center gap-1.5 rounded-full bg-[#009c6b]/10 px-3 py-1 text-xs font-semibold text-[#009c6b] dark:bg-emerald-900/20 dark:text-emerald-400">
            <ShieldCheck size={14} />
            Cargado
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full bg-[#ba1a1a]/10 px-3 py-1 text-xs font-semibold text-[#ba1a1a] dark:bg-red-900/20 dark:text-red-400">
            <ShieldOff size={14} />
            Sin certificado
          </span>
        )}
      </div>

      {has_certificate && expires_at && (
        <p className="text-sm text-[#44474f] dark:text-zinc-400">
          Vence: {new Date(expires_at).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      )}

      <form ref={formRef} onSubmit={handleUpload} className="flex flex-col gap-4">
        {uploadError && (
          <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-600 dark:text-red-400">
            {uploadError}
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Archivo .cer *</span>
            <input type="file" name="cer" accept=".cer" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Archivo .key *</span>
            <input type="file" name="key" accept=".key" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Contraseña del certificado *</span>
            <input type="password" name="password" required className={inputClass} />
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={uploading}
            className="flex items-center gap-2 rounded-lg bg-[#0051d5] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0051d5]/90 disabled:opacity-50"
          >
            <UploadCloud size={16} />
            {uploading ? "Subiendo…" : has_certificate ? "Reemplazar certificado" : "Subir certificado"}
          </button>
        </div>
      </form>

      {has_certificate && (
        <div className="flex justify-end pt-2 border-t border-[#c4c6d0] dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#ba1a1a]/30 bg-[#ba1a1a]/10 text-sm font-semibold text-[#ba1a1a] hover:bg-[#ba1a1a]/20 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors"
          >
            <Trash2 size={16} />
            Eliminar certificado
          </button>
        </div>
      )}

      {showDeleteConfirm && (
        <ConfirmModal
          message="¿Eliminar el certificado de sello digital? La organización no podrá timbrar en modo Live hasta que subas uno nuevo."
          confirmLabel="Eliminar"
          loading={deleting}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
