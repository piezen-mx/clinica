"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiKeys } from "facturapi";
import { KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { renewTestApiKey, renewLiveApiKey, deleteLiveApiKey, listLiveApiKeys } from "../../../actions";
import ConfirmModal from "@/app/dashboard/componentes/ConfirmModal";

interface Props {
  orgId: string;
  hasTestKey: boolean;
  hasLiveKey: boolean;
}

/** Badge de estado de una clave: "Configurada" / "No configurada", nunca la clave en sí. */
function KeyStatusBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <span className="rounded-full bg-[#009c6b]/10 px-3 py-1 text-xs font-semibold text-[#009c6b] dark:bg-emerald-900/20 dark:text-emerald-400">
      Configurada
    </span>
  ) : (
    <span className="rounded-full bg-[#747780]/10 px-3 py-1 text-xs font-semibold text-[#44474f] dark:bg-zinc-800 dark:text-zinc-400">
      No configurada
    </span>
  );
}

export default function OrganizationApiKeysSection({ orgId, hasTestKey, hasLiveKey }: Props) {
  const router = useRouter();

  const [renewingTest, setRenewingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const [renewingLive, setRenewingLive] = useState(false);
  const [liveResult, setLiveResult] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  const [liveKeys, setLiveKeys] = useState<ApiKeys[]>([]);
  const [loadingLiveKeys, setLoadingLiveKeys] = useState(true);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listLiveApiKeys(orgId);
      if (cancelled) return;
      if (result.ok) setLiveKeys(result.data);
      setLoadingLiveKeys(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const handleRenewTest = async () => {
    setRenewingTest(true);
    setTestError(null);
    setTestResult(null);
    try {
      const result = await renewTestApiKey(orgId);
      if (!result.ok) {
        setTestError(result.message);
        return;
      }
      setTestResult(result.data.first_12);
      router.refresh();
    } catch {
      setTestError("Error inesperado al renovar la clave de prueba");
    } finally {
      setRenewingTest(false);
    }
  };

  const handleRenewLive = async () => {
    setRenewingLive(true);
    setLiveError(null);
    setLiveResult(null);
    try {
      const result = await renewLiveApiKey(orgId);
      if (!result.ok) {
        setLiveError(result.message);
        return;
      }
      setLiveResult(result.data.first_12);
      const refreshed = await listLiveApiKeys(orgId);
      if (refreshed.ok) setLiveKeys(refreshed.data);
      router.refresh();
    } catch {
      setLiveError("Error inesperado al renovar la clave Live");
    } finally {
      setRenewingLive(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    setRevokeError(null);
    try {
      const result = await deleteLiveApiKey(orgId, keyId);
      if (!result.ok) {
        setRevokeError(result.message);
        return;
      }
      setLiveKeys(result.data);
      router.refresh();
    } catch {
      setRevokeError("Error inesperado al revocar la clave");
    } finally {
      setRevokingKeyId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-6 shadow-sm flex flex-col gap-8">
      <h3 className="text-sm font-bold text-[#0b1c30] dark:text-zinc-100">API keys</h3>

      {/* Clave de prueba */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h4 className="text-sm font-semibold text-[#0b1c30] dark:text-zinc-100">Clave de prueba</h4>
            <KeyStatusBadge configured={hasTestKey} />
          </div>
          <button
            type="button"
            onClick={handleRenewTest}
            disabled={renewingTest}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm font-semibold text-[#0b1c30] dark:text-zinc-100 hover:bg-[#eff4ff] dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} />
            {renewingTest ? "Renovando…" : "Renovar clave de prueba"}
          </button>
        </div>
        {testError && (
          <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {testError}
          </p>
        )}
        {testResult && (
          <p className="rounded-md bg-[#eff4ff] dark:bg-zinc-800 px-3 py-2 text-sm text-[#0b1c30] dark:text-zinc-100">
            Nueva clave generada, empieza con <span className="font-mono font-semibold">{testResult}…</span>
          </p>
        )}
      </section>

      {/* Claves Live */}
      <section className="flex flex-col gap-3 pt-2 border-t border-[#c4c6d0] dark:border-zinc-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h4 className="text-sm font-semibold text-[#0b1c30] dark:text-zinc-100">Claves Live</h4>
            <KeyStatusBadge configured={hasLiveKey} />
          </div>
          <button
            type="button"
            onClick={handleRenewLive}
            disabled={renewingLive}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm font-semibold text-[#0b1c30] dark:text-zinc-100 hover:bg-[#eff4ff] dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <KeyRound size={16} />
            {renewingLive ? "Renovando…" : "Renovar clave Live"}
          </button>
        </div>
        {liveError && (
          <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {liveError}
          </p>
        )}
        {liveResult && (
          <p className="rounded-md bg-[#eff4ff] dark:bg-zinc-800 px-3 py-2 text-sm text-[#0b1c30] dark:text-zinc-100">
            Nueva clave generada, empieza con <span className="font-mono font-semibold">{liveResult}…</span>
          </p>
        )}
        {revokeError && (
          <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {revokeError}
          </p>
        )}

        {!loadingLiveKeys && liveKeys.length > 0 && (
          <ul className="flex flex-col gap-2">
            {liveKeys.map((key) => (
              <li
                key={key.id}
                className="flex items-center justify-between rounded-lg border border-[#c4c6d0] dark:border-zinc-700 px-4 py-2"
              >
                <span className="font-mono text-sm text-[#0b1c30] dark:text-zinc-100">{key.first_12}…</span>
                <button
                  type="button"
                  onClick={() => setRevokingKeyId(key.id)}
                  className="flex items-center gap-1 text-sm font-semibold text-[#ba1a1a] hover:underline dark:text-red-400"
                >
                  <Trash2 size={14} />
                  Revocar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {revokingKeyId && (
        <ConfirmModal
          message="¿Revocar esta clave Live? Cualquier integración que la use dejará de funcionar de inmediato."
          confirmLabel="Revocar"
          onConfirm={() => handleRevoke(revokingKeyId)}
          onCancel={() => setRevokingKeyId(null)}
        />
      )}
    </div>
  );
}
