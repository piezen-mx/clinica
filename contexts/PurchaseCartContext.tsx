"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { ISuggestedProduct } from "@/interfaces/suggested_product";

/** Línea del carrito de pedido: snapshot del producto + cantidad/precio/proveedor editables. */
export interface IPurchaseCartLine {
  id_product:          number;
  product_name:        string;
  product_code:        string;
  brand:               string;
  id_unit_measurement: number | null;
  id_supplier:         number | null;
  pieces:              number | null;
  split:               boolean;
  quantity:            number;
  unit_price:          number;
  applies_iva:         boolean;
}

const SESSION_STORAGE_KEY = "purchaseCart";

interface PurchaseCartContextType {
  lines:                   IPurchaseCartLine[];
  estimatedDate:           string;
  notes:                   string;
  /** id_supplier -> idMetodoPago. Un método de pago por proveedor, elegido en la revisión. */
  paymentMethodBySupplier: Record<number, number>;
  /** id_supplier -> gasto de envío de esa orden. Ausente o 0 = sin envío. */
  shippingCostBySupplier: Record<number, number>;
  /** true una vez que se intentó leer el carrito de sessionStorage (evita falsos "carrito vacío" en el primer render). */
  isHydrated:              boolean;
  isProductInCart:         (id_product: number) => boolean;
  toggleProduct:           (product: ISuggestedProduct, checked: boolean) => void;
  setLineQuantity:         (id_product: number, quantity: number) => void;
  setLineUnitPrice:        (id_product: number, unit_price: number) => void;
  setLineSupplier:         (id_product: number, id_supplier: number | null) => void;
  setLineAppliesIva:       (id_product: number, applies_iva: boolean) => void;
  removeLine:              (id_product: number) => void;
  /** Reemplaza todas las líneas de golpe (p. ej. al cargar una plantilla), sin tocar fecha/notas/métodos de pago. */
  replaceLines:            (lines: IPurchaseCartLine[]) => void;
  setEstimatedDate:        (date: string) => void;
  setNotes:                (notes: string) => void;
  setSupplierPaymentMethod: (id_supplier: number, idMetodoPago: number) => void;
  setSupplierShippingCost: (id_supplier: number, shipping_cost: number) => void;
  clearCart:               () => void;
}

const PurchaseCartContext = createContext<PurchaseCartContextType | null>(null);

export function PurchaseCartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<IPurchaseCartLine[]>([]);
  const [estimatedDate, setEstimatedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethodBySupplier, setPaymentMethodBySupplier] = useState<Record<number, number>>({});
  const [shippingCostBySupplier, setShippingCostBySupplier] = useState<Record<number, number>>({});
  const [isHydrated, setIsHydrated] = useState(false);

  // Carga el carrito de sessionStorage una sola vez, al montar en el cliente.
  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setLines(parsed.lines ?? []);
        setEstimatedDate(parsed.estimatedDate ?? "");
        setNotes(parsed.notes ?? "");
        setPaymentMethodBySupplier(parsed.paymentMethodBySupplier ?? {});
        setShippingCostBySupplier(parsed.shippingCostBySupplier ?? {});
      } catch {
        // sessionStorage corrupto o con un formato viejo: se ignora y arranca vacío
      }
    }
    setIsHydrated(true);
  }, []);

  // Persiste cualquier cambio del carrito, para sobrevivir la navegación entre
  // armado y revisión. No se guarda como orden en BD (ver decisiones del spec).
  useEffect(() => {
    if (!isHydrated) return;
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ lines, estimatedDate, notes, paymentMethodBySupplier, shippingCostBySupplier })
    );
  }, [lines, estimatedDate, notes, paymentMethodBySupplier, shippingCostBySupplier, isHydrated]);

  const isProductInCart = (id_product: number) =>
    lines.some((line) => line.id_product === id_product);

  const toggleProduct = (product: ISuggestedProduct, checked: boolean) => {
    setLines((current) => {
      if (!checked) {
        return current.filter((line) => line.id_product !== product.id_product);
      }
      if (current.some((line) => line.id_product === product.id_product)) {
        return current;
      }
      const newLine: IPurchaseCartLine = {
        id_product: product.id_product,
        product_name: product.name,
        product_code: product.product_code,
        brand: product.brand,
        id_unit_measurement: product.id_unit_measurement,
        id_supplier: product.id_supplier,
        pieces: product.pieces,
        split: product.split,
        quantity: product.suggested_quantity > 0 ? product.suggested_quantity : 1,
        unit_price: product.price,
        applies_iva: true,
      };
      return [...current, newLine];
    });
  };

  const setLineQuantity = (id_product: number, quantity: number) => {
    setLines((current) =>
      current.map((line) =>
        line.id_product === id_product ? { ...line, quantity } : line
      )
    );
  };

  const setLineUnitPrice = (id_product: number, unit_price: number) => {
    setLines((current) =>
      current.map((line) =>
        line.id_product === id_product ? { ...line, unit_price } : line
      )
    );
  };

  const setLineSupplier = (id_product: number, id_supplier: number | null) => {
    setLines((current) =>
      current.map((line) =>
        line.id_product === id_product ? { ...line, id_supplier } : line
      )
    );
  };

  const setLineAppliesIva = (id_product: number, applies_iva: boolean) => {
    setLines((current) =>
      current.map((line) =>
        line.id_product === id_product ? { ...line, applies_iva } : line
      )
    );
  };

  const removeLine = (id_product: number) => {
    setLines((current) => current.filter((line) => line.id_product !== id_product));
  };

  const replaceLines = (newLines: IPurchaseCartLine[]) => {
    setLines(newLines);
  };

  const setSupplierPaymentMethod = (id_supplier: number, idMetodoPago: number) => {
    setPaymentMethodBySupplier((current) => ({ ...current, [id_supplier]: idMetodoPago }));
  };

  const setSupplierShippingCost = (id_supplier: number, shipping_cost: number) => {
    setShippingCostBySupplier((current) => ({ ...current, [id_supplier]: shipping_cost }));
  };

  const clearCart = () => {
    setLines([]);
    setEstimatedDate("");
    setNotes("");
    setPaymentMethodBySupplier({});
    setShippingCostBySupplier({});
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  };

  return (
    <PurchaseCartContext.Provider
      value={{
        lines,
        estimatedDate,
        notes,
        paymentMethodBySupplier,
        shippingCostBySupplier,
        isHydrated,
        isProductInCart,
        toggleProduct,
        setLineQuantity,
        setLineUnitPrice,
        setLineSupplier,
        setLineAppliesIva,
        removeLine,
        replaceLines,
        setEstimatedDate,
        setNotes,
        setSupplierPaymentMethod,
        setSupplierShippingCost,
        clearCart,
      }}
    >
      {children}
    </PurchaseCartContext.Provider>
  );
}

export const usePurchaseCart = (): PurchaseCartContextType => {
  const ctx = useContext(PurchaseCartContext);
  if (!ctx) {
    throw new Error("usePurchaseCart debe usarse dentro de <PurchaseCartProvider>");
  }
  return ctx;
};
