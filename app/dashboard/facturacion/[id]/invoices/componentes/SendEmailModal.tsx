"use client";

import { useState } from "react";
import type { Customer, Invoice } from "facturapi";
import ConfirmModal from "@/app/dashboard/componentes/ConfirmModal";
import { sendInvoiceByEmailAction } from "../actions";

interface Props {
  orgId: string;
  invoice: Invoice;
  /** Para mostrar a qué correo se va a enviar; `sendInvoiceByEmailAction` no acepta ninguno alterno. */
  customers: Customer[];
  onClose: () => void;
  onSent: () => void;
}

/**
 * Confirmación de envío por correo, ex `SendEmailModal.tsx` (117 líneas). El
 * original deja capturar un destinatario libre; aquí no hay ningún campo que
 * llenar — solo se confirma el envío al correo **registrado del cliente del
 * comprobante** (ver Decisiones tomadas, spec 30). El correo mostrado es
 * informativo: se busca en `customers`, ya cargado para el modal de creación,
 * para no pedirlo de nuevo a Facturapi solo para mostrarlo.
 */
export default function SendEmailModal({ orgId, invoice, customers, onClose, onSent }: Props) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customer = customers.find((c) => c.id === invoice.customer.id);

  const handleConfirm = async () => {
    setSending(true);
    setError(null);
    try {
      const result = await sendInvoiceByEmailAction(orgId, invoice.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onSent();
    } catch {
      setError("Error inesperado al enviar la factura por correo");
    } finally {
      setSending(false);
    }
  };

  return (
    <ConfirmModal
      message={
        customer
          ? `Se enviará el comprobante (folio ${invoice.folio_number}) al correo registrado de "${customer.legal_name}": ${customer.email}.`
          : `Se enviará el comprobante (folio ${invoice.folio_number}) al correo registrado del cliente.`
      }
      confirmLabel="Enviar"
      loading={sending}
      error={error}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
}
