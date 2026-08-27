"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImageOff, UploadCloud } from "lucide-react";
import type { Organization } from "facturapi";
import { uploadOrganizationLogo } from "../actions";

interface Props {
  orgId: string;
  organization: Organization;
}

export default function LogoSection({ orgId, organization }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasLogo = Boolean(organization.logo_url);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData(e.currentTarget);
      formData.set("orgId", orgId);
      const result = await uploadOrganizationLogo(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
      formRef.current?.reset();
    } catch {
      setError("Error inesperado al subir el logo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-6 shadow-sm flex flex-col gap-6">
      <h3 className="text-sm font-bold text-[#0b1c30] dark:text-zinc-100">Logo del comprobante</h3>

      <div className="flex items-center gap-6">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-[#c4c6d0] dark:border-zinc-600 bg-[#f7f9ff] dark:bg-zinc-800">
          {organization.logo_url ? (
            <Image
              src={organization.logo_url}
              alt="Logo de la organización"
              width={96}
              height={96}
              className="h-full w-full object-contain"
            />
          ) : (
            <ImageOff size={28} className="text-[#8a8f9a] dark:text-zinc-500" />
          )}
        </div>

        <form ref={formRef} onSubmit={handleUpload} className="flex flex-1 flex-col gap-3">
          {error && (
            <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#44474f] dark:text-zinc-400">
              Imagen PNG o JPEG · máximo 2 MB
            </span>
            <input
              type="file"
              name="logo"
              accept=".png,.jpg,.jpeg,image/png,image/jpeg"
              required
              className="rounded-md border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#0051d5] dark:focus:ring-zinc-400"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={uploading}
              className="flex items-center gap-2 rounded-lg bg-[#0051d5] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0051d5]/90 disabled:opacity-50"
            >
              <UploadCloud size={16} />
              {uploading ? "Subiendo…" : hasLogo ? "Reemplazar logo" : "Subir logo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
