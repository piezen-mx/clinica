"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteOrganization } from "../../../actions";
import ConfirmModal from "@/app/dashboard/componentes/ConfirmModal";

interface Props {
  orgId: string;
  organizationName: string;
}

export default function DeleteOrganizationSection({ orgId, organizationName }: Props) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteOrganization(orgId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push("/dashboard/facturacion");
      router.refresh();
    } catch {
      setError("Error inesperado al eliminar la organización");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-[#ba1a1a]/30 dark:border-red-900/50 rounded-xl p-6 shadow-sm flex items-center justify-between">
      <div>
        <h3 className="text-sm font-bold text-[#ba1a1a] dark:text-red-400">Eliminar organización</h3>
        <p className="text-sm text-[#44474f] dark:text-zinc-400">
          Borra la organización de Facturapi y su configuración local. Esta acción no se puede deshacer.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#ba1a1a]/30 bg-[#ba1a1a]/10 text-sm font-semibold text-[#ba1a1a] hover:bg-[#ba1a1a]/20 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors"
      >
        <Trash2 size={16} />
        Eliminar
      </button>

      {showConfirm && (
        <ConfirmModal
          message={`¿Eliminar "${organizationName}"? Se borrará de Facturapi y de este panel. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          loading={deleting}
          error={error}
          onConfirm={handleDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
