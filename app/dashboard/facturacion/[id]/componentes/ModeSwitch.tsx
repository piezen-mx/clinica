"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setOrgMode } from "../../actions";
import ConfirmModal from "@/app/dashboard/componentes/ConfirmModal";

interface Props {
  orgId: string;
  initialIsLive: boolean;
}

/**
 * Interruptor de modo Live/Test, ex `ModeSwitch.tsx` (52 líneas) del proyecto
 * original. Cambios:
 *
 * 1. **No escribe ni lee `?mode=`.** El original hace `router.push('?mode=live')`
 *    además de persistir, y las páginas leen el query param con prioridad sobre
 *    la base de datos (`invoices/page.tsx:39`), de modo que `?mode=live` escrito
 *    a mano en la URL pone la pestaña en producción sin tocar el switch ni la
 *    BD. Aquí el switch solo llama a `setOrgMode` y hace `router.refresh()`.
 * 2. Activar Live abre un `ConfirmModal` con un mensaje explícito sobre lo que
 *    implica. Desactivarlo no requiere confirmación: siempre es seguro volver a
 *    Test.
 * 3. El estado inicial (`initialIsLive`) viene del `is_live` que `layout.tsx` ya
 *    lee de la base de datos, no de un query param.
 */
export default function ModeSwitch({ orgId, initialIsLive }: Props) {
  const router = useRouter();
  const [isLive, setIsLive] = useState(initialIsLive);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyMode = async (nextIsLive: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const result = await setOrgMode(orgId, nextIsLive);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setIsLive(result.data.isLive);
      setShowConfirm(false);
      router.refresh();
    } catch {
      setError("Error inesperado al cambiar el modo de la organización");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    setError(null);
    if (isLive) {
      // Desactivar Live no tiene precondiciones ni riesgo de timbrado accidental.
      void applyMode(false);
    } else {
      setShowConfirm(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        aria-pressed={isLive}
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors disabled:opacity-50 ${
          isLive
            ? "border-[#ba1a1a]/40 bg-[#ba1a1a]/10 text-[#ba1a1a] dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
            : "border-[#c4c6d0] bg-[#e5eeff] text-[#44474f] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${isLive ? "bg-[#ba1a1a] dark:bg-red-400" : "bg-[#747780] dark:bg-zinc-500"}`} />
        {isLive ? "Live" : "Test"}
      </button>

      {showConfirm && (
        <ConfirmModal
          message="Al activar el modo Live, esta organización emitirá comprobantes fiscales reales ante el SAT. Cada factura será irreversible y solo podrá cancelarse con motivo. ¿Continuar?"
          confirmLabel="Activar Live"
          loading={loading}
          error={error}
          onConfirm={() => applyMode(true)}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
