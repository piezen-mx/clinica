"use client";

import { IProduct } from "@/interfaces/product";
import { IProductCategory } from "@/interfaces/product_category";
import { IUnitMeasurement } from "@/interfaces/unit_measurement";
import { ISupplier } from "@/interfaces/supplier";
import { useAuth } from "@/contexts/AuthContext";
import { useRef, useState } from "react";

/** Solo Administrador (1) y Dueño/Gerencia (4) pueden ajustar el Stock Mínimo — ver Inventario.md. */
const MIN_STOCK_ALLOWED_ROLES = [1, 4];

export type ProductFormData = Omit<IProduct, "id_empresa" | "status" | "created_at">;

interface Props {
  form: ProductFormData;
  saving: boolean;
  error: string | null;
  categories: IProductCategory[];
  unitsMeasurement: IUnitMeasurement[];
  suppliers: ISupplier[];
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  onImageUploaded: (url: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

const inputClass =
  "w-full rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0051d5] focus:border-[#0051d5] transition-colors";
const labelClass = "block text-xs font-semibold text-[#44474f] dark:text-zinc-400 mb-1";

/** Mismo patrón que TabFotos.tsx, pero con maxWidth = 400 (ver spec 37). */
const resizeImage = (file: File, maxWidth = 400, quality = 0.82): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img       = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale   = img.width > maxWidth ? maxWidth / img.width : 1;
      const canvas  = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas no disponible")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Error al comprimir imagen"))),
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = objectUrl;
  });

export default function ProductModal({
  form,
  saving,
  error,
  categories,
  unitsMeasurement,
  suppliers,
  onChange,
  onImageUploaded,
  onSubmit,
  onClose,
}: Props) {
  const { user } = useAuth();
  const canEditMinStock = !!user && MIN_STOCK_ALLOWED_ROLES.includes(user.id_role);
  const isVentaSplit = form.id_category === 4 && !!form.split;
  const isVenta = form.id_category === 4;

  const imageInputRef                    = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError]         = useState<string | null>(null);

  // Id estable mientras el modal permanece abierto, usado como public_id en
  // Cloudinary para un producto aún no guardado (ver spec 41).
  const [tempId] = useState(() => Math.random().toString(36).slice(2, 10));
  const stableProductKey = form.id_product > 0 ? String(form.id_product) : `tmp_${tempId}`;

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setImageError(null);
    try {
      const resized = await resizeImage(file);

      const fileName = `producto_${stableProductKey}.jpg`;

      const uploadRes = await fetch(
        `/api/upload?name=${encodeURIComponent(fileName)}&folder=clinica/productos&overwrite=true`,
        {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: resized,
        }
      );
      const uploadData = await uploadRes.json();
      if (!uploadData.ok) throw new Error(uploadData.data ?? "Error al subir la imagen");

      onImageUploaded(String(uploadData.data));
    } catch (err: unknown) {
      setImageError(err instanceof Error ? err.message : "Error al subir la imagen");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-zinc-900 shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-[#c4c6d0] dark:border-zinc-700 px-6 py-4 shrink-0">
          <h3 className="text-lg font-semibold text-[#0b1c30] dark:text-zinc-50">
            {form.id_product === 0 ? "Nuevo producto" : "Editar producto"}
          </h3>
          <button onClick={onClose} className="text-[#747780] hover:text-[#0b1c30] dark:text-zinc-400 dark:hover:text-zinc-200 text-xl leading-none">
            &times;
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto">
          {error && (
            <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div className="md:col-span-2">
              <label className={labelClass}>Nombre *</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={onChange}
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Categoría</label>
              <select
                name="id_category"
                value={form.id_category ?? ""}
                onChange={onChange}
                className={inputClass}
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id_category} value={c.id_category}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Marca</label>
              <input
                type="text"
                name="brand"
                value={form.brand ?? ""}
                onChange={onChange}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Presentación</label>
              <input
                type="text"
                name="presentation"
                value={form.presentation ?? ""}
                onChange={onChange}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Unidad de Medida</label>
              <select
                name="id_unit_measurement"
                value={form.id_unit_measurement ?? ""}
                onChange={onChange}
                className={inputClass}
              >
                <option value="">—</option>
                {unitsMeasurement.map((u) => (
                  <option key={u.id_unit_measurement} value={u.id_unit_measurement}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Talla/Tamaño</label>
              <input
                type="text"
                name="size"
                value={form.size ?? ""}
                onChange={onChange}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                {isVentaSplit ? "Precio de Compra (paquete/caja)" : "Precio Unitario"}
              </label>
              <input
                type="number"
                name="price"
                value={form.price ?? 0}
                onChange={onChange}
                min={0}
                step="0.01"
                className={inputClass}
              />
            </div>

            {isVenta && (
              <div>
                <label className={labelClass}>Precio de Venta (pieza)</label>
                <input
                  type="number"
                  name="sale_price"
                  value={form.sale_price ?? ""}
                  onChange={onChange}
                  min={0}
                  step="0.01"
                  required
                  className={inputClass}
                />
              </div>
            )}

            {isVenta && (
              <div>
                <label className={labelClass}>Bono de Venta</label>
                <input
                  type="number"
                  name="bono_venta"
                  value={form.bono_venta ?? ""}
                  onChange={onChange}
                  min={0}
                  step="0.01"
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label className={labelClass}>No. Producto/Código de Barras</label>
              <input
                type="text"
                name="product_code"
                value={form.product_code ?? ""}
                onChange={onChange}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Proveedor</label>
              <select
                name="id_supplier"
                value={form.id_supplier ?? ""}
                onChange={onChange}
                className={inputClass}
              >
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id_proveedor} value={s.id_proveedor}>
                    {s.nombre_corto}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>URL de Compra</label>
              <input
                type="url"
                name="url_compra"
                value={form.url_compra ?? ""}
                onChange={onChange}
                className={inputClass}
              />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Imagen del Producto</label>
              <div className="flex items-center gap-4">
                <div className="relative h-20 w-20 shrink-0">
                  {form.url_product ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.url_product}
                      alt={form.name || "Producto"}
                      className="h-20 w-20 rounded-lg object-cover border border-[#c4c6d0] dark:border-zinc-600"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-lg border border-dashed border-[#c4c6d0] dark:border-zinc-600 flex items-center justify-center text-xs text-[#747780] dark:text-zinc-500 text-center px-1">
                      Sin imagen
                    </div>
                  )}
                  {uploadingImage && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                  <button
                    type="button"
                    disabled={uploadingImage}
                    onClick={() => imageInputRef.current?.click()}
                    className="rounded-lg border border-[#c4c6d0] dark:border-zinc-600 px-4 py-2 text-sm font-medium text-[#44474f] dark:text-zinc-300 hover:bg-[#eff4ff] dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                  >
                    {uploadingImage ? "Subiendo…" : "Subir imagen"}
                  </button>
                  {imageError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{imageError}</p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className={labelClass}>
                {isVentaSplit ? "Piezas por Paquete/Caja" : "Piezas por Producto"}
              </label>
              <input
                type="number"
                name="pieces"
                value={form.pieces ?? ""}
                onChange={onChange}
                min={0}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Stock Mínimo</label>
              <input
                type="number"
                name="min_stock"
                value={form.min_stock ?? ""}
                onChange={onChange}
                min={0}
                disabled={!canEditMinStock}
                title={canEditMinStock ? undefined : "Solo un administrador puede ajustar el Stock Mínimo"}
                className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
              />
              {!canEditMinStock && (
                <p className="text-xs text-[#747780] dark:text-zinc-500 mt-1">
                  Solo un administrador puede ajustar el Stock Mínimo.
                </p>
              )}
            </div>

            {canEditMinStock && (
              <div className="md:col-span-2 bg-[#eff4ff] dark:bg-zinc-800/50 p-4 rounded-lg border border-[#c4c6d0]/50 dark:border-zinc-700 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="auto_consume"
                    checked={!!form.auto_consume}
                    onChange={onChange}
                    className="mt-1 h-5 w-5 rounded border-[#c4c6d0] dark:border-zinc-600 text-[#0051d5] focus:ring-[#0051d5]"
                  />
                  <div>
                    <label className="block text-sm font-semibold text-[#0b1c30] dark:text-zinc-100">
                      Consumo automático por consulta
                    </label>
                    <p className="text-xs text-[#44474f] dark:text-zinc-400">
                      El producto se descuenta solo del stock cada vez que se crea una consulta.
                    </p>
                  </div>
                </div>

                {form.auto_consume && (
                  <div>
                    <label className={labelClass}>Cantidad por consulta</label>
                    <input
                      type="number"
                      name="consumption_per_consultation"
                      value={form.consumption_per_consultation ?? ""}
                      onChange={onChange}
                      min={0.0001}
                      step="0.0001"
                      required
                      className={inputClass}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 py-2">
              <input
                type="checkbox"
                name="activo"
                checked={!!form.activo}
                onChange={onChange}
                className="h-5 w-5 rounded border-[#c4c6d0] dark:border-zinc-600 text-[#0051d5] focus:ring-[#0051d5]"
              />
              <span className="text-sm font-medium text-[#0b1c30] dark:text-zinc-100">Producto Activo</span>
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Descripción</label>
              <textarea
                name="description"
                value={form.description ?? ""}
                onChange={onChange}
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className="md:col-span-2 bg-[#eff4ff] dark:bg-zinc-800/50 p-4 rounded-lg border border-[#c4c6d0]/50 dark:border-zinc-700">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="split"
                  checked={!!form.split}
                  onChange={onChange}
                  className="mt-1 h-5 w-5 rounded border-[#c4c6d0] dark:border-zinc-600 text-[#0051d5] focus:ring-[#0051d5]"
                />
                <div>
                  <label className="block text-sm font-semibold text-[#0b1c30] dark:text-zinc-100">Dividir Unidad</label>
                  <p className="text-xs text-[#44474f] dark:text-zinc-400">
                    Indica si el producto será dividido en piezas o alguna unidad específica.
                  </p>
                </div>
              </div>
            </div>
          </div>

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
              disabled={saving}
              className="rounded-lg bg-[#0051d5] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0051d5]/90 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar Producto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
