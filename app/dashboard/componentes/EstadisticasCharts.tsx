"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";

function useIsLargeScreen() {
  const [isLarge, setIsLarge] = useState(false);
  const check = useCallback(() => setIsLarge(window.matchMedia("(min-width: 1024px)").matches), []);
  useEffect(() => {
    check();
    const mq = window.matchMedia("(min-width: 1024px)");
    mq.addEventListener("change", check);
    return () => mq.removeEventListener("change", check);
  }, [check]);
  return isLarge;
}
import { addZeroToday } from "@/utils/date_helpper";
import { useSucursal } from "@/contexts/SucursalContext";
import { getEstadisticas, getEstadisticasMultiple, IEstadisticasData } from "@/app/dashboard/actions";
import { useAuth } from "@/contexts/AuthContext";
import { ISucursal } from "@/interfaces/sucursal";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

type ServicioStat = IEstadisticasData["servicios"][number];
type ProductoStat = IEstadisticasData["productos"][number];
type MetodoPagoStat = IEstadisticasData["metodos_pago"][number];
type VentaMensualStat = IEstadisticasData["ventas_mensuales"][number];
type EstadisticasData = Omit<IEstadisticasData, "ok">;

const PIE_COLORS = [
  "#587CD6",
  "#58A4D6",
  "#5C58D6",
  "#58CBD6",
  "#8558D6",
];

function getFirstDayOfMonth(): string {
  const now = new Date();
  return addZeroToday(new Date(now.getFullYear(), now.getMonth(), 1));
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(v);

const METODO_ABREV: Record<string, string> = {
  "tarjeta de crédito": "TC",
  "tarjeta de credito": "TC",
  "transferencia electrónica de fondos": "TEF",
  "transferencia electronica de fondos": "TEF",
  "tarjeta de débito": "TD",
  "tarjeta de debito": "TD",
  "efectivo": "Efectivo",
};

function abbrevMetodo(nombre: string): string {
  return METODO_ABREV[nombre.toLowerCase()] ?? nombre;
}
function abbrevMetodoInicial(nombre: string): string {
  return nombre
    .split(" ")
    .map(word => word.charAt(0))
    .join("")
    .toUpperCase();
}

const EmptyState = () => (
  <div className="flex items-center justify-center h-40 text-zinc-400 dark:text-zinc-500 text-sm">
    Sin datos para el período seleccionado
  </div>
);

const LoadingBar = () => (
  <div className="flex items-center justify-center h-40">
    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

// Custom tooltip for bar charts
const BarTooltipServicios = ({ active, payload }: { active?: boolean; payload?: { payload: ServicioStat }[] }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-xs shadow-lg">
      <p className="font-semibold text-zinc-800 dark:text-zinc-100 mb-1">{d.nombre}</p>
      <p className="text-zinc-600 dark:text-zinc-300">Usos: <span className="font-medium text-indigo-600 dark:text-indigo-400">{d.total_usos}</span></p>
      <p className="text-zinc-600 dark:text-zinc-300">Ingresos: <span className="font-medium text-emerald-600 dark:text-emerald-400">{fmtCurrency(d.total_ingresos)}</span></p>
    </div>
  );
};

const BarTooltipProductos = ({ active, payload, metrica }: { active?: boolean; payload?: { payload: ProductoStat }[]; metrica: "cantidad" | "ingresos" }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-xs shadow-lg">
      <p className="font-semibold text-zinc-800 dark:text-zinc-100 mb-1">{d.nombre}</p>
      {metrica === "cantidad" ? (
        <>
          <p className="text-zinc-600 dark:text-zinc-300">Cantidad: <span className="font-medium text-indigo-600 dark:text-indigo-400">{d.total_cantidad}</span></p>
          <p className="text-zinc-600 dark:text-zinc-300">Ingresos: <span className="font-medium text-emerald-600 dark:text-emerald-400">{fmtCurrency(d.total_ingresos)}</span></p>
        </>
      ) : (
        <>
          <p className="text-zinc-600 dark:text-zinc-300">Ingresos: <span className="font-medium text-emerald-600 dark:text-emerald-400">{fmtCurrency(d.total_ingresos)}</span></p>
          <p className="text-zinc-600 dark:text-zinc-300">Cantidad: <span className="font-medium text-indigo-600 dark:text-indigo-400">{d.total_cantidad}</span></p>
        </>
      )}
    </div>
  );
};

const PieTooltipMetodos = ({ active, payload }: { active?: boolean; payload?: { payload: MetodoPagoStat; value: number }[] }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-xs shadow-lg">
      <p className="font-semibold text-zinc-800 dark:text-zinc-100 mb-1">{d.nombre}</p>
      <p className="text-zinc-600 dark:text-zinc-300">Total: <span className="font-medium text-emerald-600 dark:text-emerald-400">{fmtCurrency(d.total_monto)}</span></p>
      <p className="text-zinc-600 dark:text-zinc-300">Pagos: <span className="font-medium text-indigo-600 dark:text-indigo-400">{d.total_pagos}</span></p>
    </div>
  );
};

const BarTooltipVentas = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { nombre: string; total: number } }[];
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-xs shadow-lg">
      <p className="font-semibold text-zinc-800 dark:text-zinc-100 mb-1">{d.nombre}</p>
      <p className="text-zinc-600 dark:text-zinc-300">
        Total:{" "}
        <span className="font-medium text-emerald-600 dark:text-emerald-400">
          {fmtCurrency(d.total)}
        </span>
      </p>
    </div>
  );
};

const MESES_ABREV = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const fmtMes = (mes: string): string => {
  const [year, month] = mes.split("-");
  return `${MESES_ABREV[parseInt(month, 10) - 1]} ${year.slice(2)}`;
};

const MonthTickWithTotal = (totalesMap: Record<string, number>) =>
  function CustomTick({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value: string } }) {
    if (!payload) return null;
    const mes = payload.value;
    const total = totalesMap[mes] ?? 0;
    const totalStr = total >= 1000 ? `$${(total / 1000).toFixed(1)}k` : `$${total.toFixed(0)}`;
    return (
      <g transform={`translate(${x ?? 0},${y ?? 0})`}>
        <text x={0} y={0} dy={14} textAnchor="middle" fontSize={12} className="fill-zinc-700 dark:fill-zinc-300">
          {fmtMes(mes)}
        </text>
        <text x={0} y={0} dy={28} textAnchor="middle" fontSize={12} className="fill-zinc-400 dark:fill-zinc-500">
          {totalStr}
        </text>
      </g>
    );
  };

const BarTooltipVentasMensuales = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; fill: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-xs shadow-lg">
      <p className="font-semibold text-zinc-800 dark:text-zinc-100 mb-1">
        {label ? fmtMes(label) : ""}
      </p>
      {payload.map((entry, i) => (
        <p key={i} className="text-zinc-600 dark:text-zinc-300">
          {entry.name}:{" "}
          <span className="font-medium" style={{ color: entry.fill }}>
            {fmtCurrency(entry.value)}
          </span>
        </p>
      ))}
    </div>
  );
};

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  className,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      type="checkbox"
      ref={ref}
      checked={checked}
      onChange={onChange}
      className={className}
    />
  );
}

export default function EstadisticasCharts() {
  const { user } = useAuth();
  const isGlobal = user?.id_role === 4;
  const { sucursales, selectedId } = useSucursal();
  const [fechaInicio, setFechaInicio] = useState(getFirstDayOfMonth());
  const [fechaFin, setFechaFin] = useState(addZeroToday(new Date()));
  const [data, setData] = useState<EstadisticasData | null>(null);
  const [loading, setLoading] = useState(false);
  const [metricaProductos, setMetricaProductos] = useState<"cantidad" | "ingresos">("cantidad");
  const [selectedSucursalIds, setSelectedSucursalIds] = useState<number[]>([]);
  const globalInitialized = useRef(false);
  const isLargeScreen = useIsLargeScreen();

  const sucursalesByEstado = useMemo(() => {
    const map: Record<string, ISucursal[]> = {};
    for (const s of sucursales) {
      const key = s.estado ?? "Sin estado";
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return map;
  }, [sucursales]);

  const fetchData = async (inicio: string, fin: string, sucursalId: number) => {
    setLoading(true);
    try {
      const result = await getEstadisticas(inicio, fin, sucursalId);
      if (result.ok) setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  const fetchDataMulti = async (inicio: string, fin: string, ids: number[]) => {
    if (ids.length === 0) { setData(null); return; }
    setLoading(true);
    try {
      const result = await getEstadisticasMultiple(inicio, fin, ids);
      if (result.ok) setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Non-global: react to branch switch
  useEffect(() => {
    if (!isGlobal) fetchData(fechaInicio, fechaFin, selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Global: initialize once when sucursales loads
  useEffect(() => {
    if (isGlobal && sucursales.length > 0 && !globalInitialized.current) {
      globalInitialized.current = true;
      const allIds = sucursales.map(s => s.id_sucursal);
      setSelectedSucursalIds(allIds);
      fetchDataMulti(fechaInicio, fechaFin, allIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGlobal, sucursales]);

  const handleAplicar = () => {
    if (isGlobal) {
      fetchDataMulti(fechaInicio, fechaFin, selectedSucursalIds);
    } else {
      fetchData(fechaInicio, fechaFin, selectedId);
    }
  };

  const toggleSucursal = (id: number) => {
    setSelectedSucursalIds(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const toggleEstado = (sucList: ISucursal[]) => {
    const ids = sucList.map(s => s.id_sucursal);
    const allChecked = ids.every(id => selectedSucursalIds.includes(id));
    if (allChecked) {
      setSelectedSucursalIds(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelectedSucursalIds(prev => [...new Set([...prev, ...ids])]);
    }
  };

  const productosOrdenados = data
    ? [...data.productos]
        .sort((a, b) =>
          metricaProductos === "cantidad"
            ? b.total_cantidad - a.total_cantidad
            : b.total_ingresos - a.total_ingresos
        )
        .slice(0, 7)
    : [];

  const totalServicios = data?.ventas_cobradas.total_servicios ?? 0;
  const totalProductos = data?.ventas_cobradas.total_productos ?? 0;
  const totalTratamientos = data?.tratamientos.total_ingresos ?? 0;
  const ventasTotalesData = [
    { nombre: "Servicios", total: totalServicios, fill: "#587CD6" },
    { nombre: "Productos", total: totalProductos, fill: "#58A4D6" },
    { nombre: "Tratamientos", total: totalTratamientos, fill: "#58CBD6" },
  ];
  const isMultiMonth = (data?.ventas_mensuales.length ?? 0) > 1;
  const mesTotalMap: Record<string, number> = {};
  if (data) {
    for (const row of data.ventas_mensuales) {
      mesTotalMap[row.mes] = (row.total_servicios ?? 0) + (row.total_productos ?? 0) + (row.total_tratamientos ?? 0);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header + filtro fechas */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
            Estadísticas de consultas
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <label className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                Desde
              </label>
              <input
                type="date"
                className="text-xs border border-zinc-300 dark:border-zinc-600 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                Hasta
              </label>
              <input
                type="date"
                className="text-xs border border-zinc-300 dark:border-zinc-600 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </div>
            <button
              onClick={handleAplicar}
              disabled={loading}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white transition-colors"
            >
              {loading ? "Cargando…" : "Aplicar"}
            </button>
          </div>
        </div>
      </div>

      {/* Selector de sucursales — solo para role=4 */}
      {isGlobal && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Sucursales{" "}
              <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">
                ({selectedSucursalIds.length}/{sucursales.length} seleccionadas)
              </span>
            </h4>
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedSucursalIds(sucursales.map(s => s.id_sucursal))}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Todas
              </button>
              <button
                onClick={() => setSelectedSucursalIds([])}
                className="text-xs text-zinc-400 dark:text-zinc-500 hover:underline"
              >
                Ninguna
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            {Object.entries(sucursalesByEstado).map(([estado, sucList]) => {
              const ids = sucList.map(s => s.id_sucursal);
              const allChecked = ids.every(id => selectedSucursalIds.includes(id));
              const someChecked = ids.some(id => selectedSucursalIds.includes(id));
              return (
                <div key={estado}>
                  <label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
                    <IndeterminateCheckbox
                      checked={allChecked}
                      indeterminate={someChecked && !allChecked}
                      onChange={() => toggleEstado(sucList)}
                      className="accent-indigo-600 w-3.5 h-3.5"
                    />
                    <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wide">
                      {estado}
                    </span>
                    <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-full px-1.5 leading-5 font-medium">
                      {sucList.length}
                    </span>
                  </label>
                  <div className="flex flex-col gap-1.5 ml-5">
                    {sucList.map(s => (
                      <label key={s.id_sucursal} className="flex items-center gap-1.5 cursor-pointer select-none group">
                        <input
                          type="checkbox"
                          checked={selectedSucursalIds.includes(s.id_sucursal)}
                          onChange={() => toggleSucursal(s.id_sucursal)}
                          className="accent-indigo-600 w-3.5 h-3.5"
                        />
                        <span className="text-xs text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-800 dark:group-hover:text-zinc-100 transition-colors">
                          {s.nombre}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid de gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 0: Ventas totales — ancho completo */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Ventas totales
            </h4>
            {data && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Total:{" "}
                <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                  {fmtCurrency(totalServicios + totalProductos + totalTratamientos)}
                </span>
              </span>
            )}
          </div>
          {loading ? (
            <LoadingBar />
          ) : !data || (totalServicios === 0 && totalProductos === 0 && totalTratamientos === 0) ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {isMultiMonth ? (
                <div className="overflow-x-auto w-full">
                  <div style={{ minWidth: `${Math.max(data.ventas_mensuales.length * 90, 360)}px` }}>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart
                        data={data.ventas_mensuales}
                        margin={{ left: 16, right: 32, top: 8, bottom: 24 }}
                      >
                        <XAxis dataKey="mes" tick={MonthTickWithTotal(mesTotalMap)} interval={0} height={50} />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v: number) =>
                            v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`
                          }
                        />
                        <Tooltip content={<BarTooltipVentasMensuales />} />
                        <Legend formatter={(value: string) => <span className="text-xs">{value}</span>} />
                        <Bar dataKey="total_servicios" name="Servicios" fill="#587CD6" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="total_productos" name="Productos" fill="#58A4D6" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="total_tratamientos" name="Tratamientos" fill="#58CBD6" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={ventasTotalesData}
                    margin={{ left: 16, right: 32, top: 8, bottom: 4 }}
                  >
                    <XAxis dataKey="nombre" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`
                      }
                    />
                    <Tooltip content={<BarTooltipVentas />} />
                    <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                      {ventasTotalesData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="flex sm:flex-col gap-3 shrink-0">
                <div className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl px-4 py-3 min-w-40">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: "#587CD6" }} />
                  <div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Servicios</p>
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                      {fmtCurrency(totalServicios)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl px-4 py-3 min-w-40">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: "#58A4D6" }} />
                  <div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Productos</p>
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                      {fmtCurrency(totalProductos)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-cyan-50 dark:bg-cyan-950/30 rounded-xl px-4 py-3 min-w-40">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: "#58CBD6" }} />
                  <div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Tratamientos</p>
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                      {fmtCurrency(totalTratamientos)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chart 1: Servicios utilizados */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4">
          <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-3">
            Servicios utilizados
          </h4>
          {loading ? (
            <LoadingBar />
          ) : !data || data.servicios.length === 0 ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={data.servicios}
                layout="vertical"
                margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
              >
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`
                  }
                />
                <YAxis
                  type="category"
                  dataKey="nombre"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip content={<BarTooltipServicios />} />
                <Bar dataKey="total_ingresos" fill="#587CD6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Chart 2: Productos con toggle */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Productos
            </h4>
            <div className="flex rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 text-xs">
              <button
                onClick={() => setMetricaProductos("cantidad")}
                className={`px-2.5 py-1 transition-colors ${
                  metricaProductos === "cantidad"
                    ? "bg-indigo-600 text-white"
                    : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                }`}
              >
                Cantidad
              </button>
              <button
                onClick={() => setMetricaProductos("ingresos")}
                className={`px-2.5 py-1 transition-colors ${
                  metricaProductos === "ingresos"
                    ? "bg-emerald-600 text-white"
                    : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                }`}
              >
                Ingresos
              </button>
            </div>
          </div>
          {loading ? (
            <LoadingBar />
          ) : !data || data.productos.length === 0 ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={productosOrdenados}
                layout="vertical"
                margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
              >
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="nombre"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  content={
                    <BarTooltipProductos metrica={metricaProductos} />
                  }
                />
                <Bar
                  dataKey={
                    metricaProductos === "cantidad"
                      ? "total_cantidad"
                      : "total_ingresos"
                  }
                  fill={metricaProductos === "cantidad" ? "#5C58D6" : "#58A4D6"}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Chart 3: Métodos de pago — ancho completo */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4 lg:col-span-2">
          <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-3">
            Métodos de pago
          </h4>
          {loading ? (
            <LoadingBar />
          ) : !data || data.metodos_pago.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col lg:flex-row items-start gap-6">
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={data.metodos_pago}
                    dataKey="total_monto"
                    nameKey="nombre"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    label={
                      isLargeScreen
                        ? (props: { nombre?: string; percent?: number }) =>
                            `${abbrevMetodoInicial(props.nombre ?? "")}(${((props.percent ?? 0) * 100).toFixed(0)}%)`
                        : false
                    }
                    labelLine={isLargeScreen}
                  >
                    {data.metodos_pago.map((_, i) => (
                      <Cell
                        key={i}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltipMetodos />} />
                  {isLargeScreen && (
                    <Legend
                      formatter={(value) => (
                        <span className="text-xs text-zinc-600 dark:text-zinc-300">
                          {abbrevMetodo(value)}
                        </span>
                      )}
                    />
                  )}
                </PieChart>
              </ResponsiveContainer>
              {/* Tabla resumen */}
              <div className="w-full lg:w-96 shrink-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-zinc-200 dark:border-zinc-700">
                      <th className="text-left pb-2 pt-1 text-zinc-500 dark:text-zinc-400 font-semibold">
                        Método
                      </th>
                      <th className="text-right pb-2 pt-1 text-zinc-500 dark:text-zinc-400 font-semibold w-16">
                        Pagos
                      </th>
                      <th className="text-right pb-2 pt-1 text-zinc-500 dark:text-zinc-400 font-semibold w-36">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.metodos_pago.map((m, i) => (
                      <tr
                        key={m.nombre}
                        className="border-b border-zinc-100 dark:border-zinc-800"
                      >
                        <td className="py-2.5 flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                PIE_COLORS[i % PIE_COLORS.length],
                            }}
                          />
                          <span className="text-zinc-700 dark:text-zinc-200">
                            {m.nombre}
                          </span>
                        </td>
                        <td className="py-2.5 text-right text-zinc-600 dark:text-zinc-300">
                          {m.total_pagos}
                        </td>
                        <td className="py-2.5 text-right font-medium text-zinc-800 dark:text-zinc-100">
                          {fmtCurrency(m.total_monto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-zinc-200 dark:border-zinc-700">
                      <td className="pt-2.5 pb-1 text-zinc-600 dark:text-zinc-300 font-semibold">
                        Total
                      </td>
                      <td className="pt-2.5 pb-1 text-right font-semibold text-zinc-700 dark:text-zinc-200">
                        {data.metodos_pago.reduce(
                          (acc, m) => acc + m.total_pagos,
                          0
                        )}
                      </td>
                      <td className="pt-2.5 pb-1 text-right font-bold text-zinc-800 dark:text-zinc-100">
                        {fmtCurrency(
                          data.metodos_pago.reduce(
                            (acc, m) => acc + m.total_monto,
                            0
                          )
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
