"use client";

import { IProduct } from "@/interfaces/product";
import { IProductCategory } from "@/interfaces/product_category";
import { IUnitMeasurement } from "@/interfaces/unit_measurement";
import { ISupplier } from "@/interfaces/supplier";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { getProducts, getCategories, getUnitsMeasurement, saveProduct } from "./actions";
import { getSuppliers } from "@/app/dashboard/proveedores/actions";
import ProductRow from "./componentes/ProductRow";
import ProductModal, { ProductFormData } from "./componentes/ProductModal";

const EMPTY: ProductFormData = {
  id_product: 0,
  name: "",
  id_category: null,
  brand: "",
  presentation: "",
  id_unit_measurement: null,
  size: "",
  price: 0,
  sale_price: null,
  product_code: "",
  id_supplier: null,
  pieces: null,
  min_stock: null,
  auto_consume: false,
  consumption_per_consultation: null,
  description: "",
  activo: true,
  split: false,
  url_product: "",
};

export default function ProductosPage() {
  const [products, setProducts]           = useState<IProduct[]>([]);
  const [categories, setCategories]       = useState<IProductCategory[]>([]);
  const [unitsMeasurement, setUnitsMeasurement] = useState<IUnitMeasurement[]>([]);
  const [suppliers, setSuppliers]         = useState<ISupplier[]>([]);
  const [loading, setLoading]             = useState(true);
  const [showModal, setShowModal]         = useState(false);
  const [form, setForm]                   = useState<ProductFormData>(EMPTY);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [search, setSearch]               = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const data = await getProducts();
      setProducts(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    getCategories().then(setCategories);
    getUnitsMeasurement().then(setUnitsMeasurement);
    getSuppliers().then(setSuppliers);
  }, []);

  const categoryNameById = useMemo(
    () => new Map(categories.map((c) => [c.id_category, c.name])),
    [categories]
  );
  const supplierNameById = useMemo(
    () => new Map(suppliers.map((s) => [s.id_proveedor, s.nombre_corto])),
    [suppliers]
  );

  const openNew = () => {
    setForm(EMPTY);
    setError(null);
    setShowModal(true);
  };

  const openEdit = (product: IProduct) => {
    setForm({
      id_product: product.id_product,
      name: product.name,
      id_category: product.id_category,
      brand: product.brand ?? "",
      presentation: product.presentation ?? "",
      id_unit_measurement: product.id_unit_measurement,
      size: product.size ?? "",
      price: product.price,
      sale_price: product.sale_price,
      product_code: product.product_code ?? "",
      id_supplier: product.id_supplier,
      pieces: product.pieces,
      min_stock: product.min_stock,
      auto_consume: product.auto_consume,
      consumption_per_consultation: product.consumption_per_consultation,
      description: product.description ?? "",
      activo: product.activo,
      split: product.split,
      url_product: product.url_product ?? "",
    });
    setError(null);
    setShowModal(true);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const numericFields = ["id_category", "id_unit_measurement", "id_supplier", "pieces", "min_stock"];
    setForm((prev) => ({
      ...prev,
      [name]:
        type === "checkbox"
          ? (e.target as HTMLInputElement).checked
          : name === "price"
          ? parseFloat(value) || 0
          : name === "sale_price" || name === "consumption_per_consultation"
          ? (value === "" ? null : parseFloat(value) || 0)
          : numericFields.includes(name)
          ? value === "" ? null : Number(value)
          : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await saveProduct(form);
      if (!res.ok) throw new Error(res.message ?? "Error al guardar");
      setShowModal(false);
      await fetchProducts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  const productsFiltered = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || String(p.id_category) === categoryFilter;
    const matchesSupplier = !supplierFilter || String(p.id_supplier) === supplierFilter;
    return matchesSearch && matchesCategory && matchesSupplier;
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-[#0b1c30] dark:text-zinc-50 mb-1">Catálogo de Productos</h2>
          <p className="text-sm text-[#44474f] dark:text-zinc-400">
            Gestiona el inventario completo de insumos y productos para venta.
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 rounded-lg bg-[#0051d5] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0051d5]/90"
        >
          Agregar Producto
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl p-4 flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[250px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#44474f] dark:text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar producto por nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-[#eff4ff] dark:bg-zinc-800 pl-10 pr-4 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 placeholder-[#747780] dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#0051d5] focus:border-[#0051d5] transition-all"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-[#eff4ff] dark:bg-zinc-800 px-4 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0051d5] focus:border-[#0051d5] min-w-[160px]"
        >
          <option value="">Todas las Categorías</option>
          {categories.map((c) => (
            <option key={c.id_category} value={c.id_category}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="rounded-lg border border-[#c4c6d0] dark:border-zinc-600 bg-[#eff4ff] dark:bg-zinc-800 px-4 py-2 text-sm text-[#0b1c30] dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0051d5] focus:border-[#0051d5] min-w-[160px]"
        >
          <option value="">Todos los Proveedores</option>
          {suppliers.map((s) => (
            <option key={s.id_proveedor} value={s.id_proveedor}>
              {s.nombre_corto}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-[#44474f] dark:text-zinc-400">Cargando…</p>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-[#c4c6d0] dark:border-zinc-700 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-[#eff4ff] dark:bg-zinc-800 border-b border-[#c4c6d0] dark:border-zinc-700 text-sm text-[#44474f] dark:text-zinc-400">
                <tr>
                  <th className="px-6 py-4 font-semibold">No. Producto</th>
                  <th className="px-6 py-4 font-semibold min-w-[250px]">Producto (Marca / Presentación)</th>
                  <th className="px-6 py-4 font-semibold">Categoría</th>
                  <th className="px-6 py-4 font-semibold">Proveedor</th>
                  <th className="px-6 py-4 font-semibold text-right">Precio Unit.</th>
                  <th className="px-6 py-4 font-semibold">Talla/Medida</th>
                  <th className="px-6 py-4 font-semibold">Stock Mín.</th>
                  {/* <th className="px-6 py-4 font-semibold">Consumo/consulta</th> */}
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productsFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-6 text-center text-[#747780] dark:text-zinc-500">
                      Sin registros
                    </td>
                  </tr>
                ) : (
                  productsFiltered.map((p) => (
                    <ProductRow
                      key={p.id_product}
                      product={p}
                      categoryName={p.id_category ? categoryNameById.get(p.id_category) ?? "" : ""}
                      supplierName={p.id_supplier ? supplierNameById.get(p.id_supplier) ?? "" : ""}
                      onEdit={openEdit}
                      onDeleted={fetchProducts}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <ProductModal
          form={form}
          saving={saving}
          error={error}
          categories={categories}
          unitsMeasurement={unitsMeasurement}
          suppliers={suppliers}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
