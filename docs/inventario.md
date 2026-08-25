# Inventory

- Multi-branch inventory module, with shared logic in `lib/inventory/` (`stock.ts`, `consultationConsumption.ts`).
- **Productos** (`app/dashboard/productos/`) and **proveedores** (`proveedores/`, `interfaces/supplier.ts`, `supplier_product.ts`).
- **Pedidos** (`pedidos/`, `interfaces/purchase_order.ts`, `purchase_order_template.ts`) — purchase orders to suppliers.
- **Recepciones** (`recepciones/`, `interfaces/purchase_reception.ts`) — receiving goods against a pedido, updates stock.
- **Movimientos** (`movimientos/`, `interfaces/movement.ts`, `kardex.ts`) — stock kardex (ins/outs) per branch.
- **Conteos** (`conteos/`, `interfaces/stock_count.ts`) — physical inventory counts reconciled against system stock.
