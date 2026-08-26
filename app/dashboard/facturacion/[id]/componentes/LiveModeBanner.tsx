import { AlertTriangle } from "lucide-react";

interface Props {
  isLive: boolean;
}

/**
 * Franja permanente que aparece en las cinco pestañas de la organización
 * mientras `is_live = 1` (spec 30) — se renderiza desde `[id]/layout.tsx`, no
 * solo en la pestaña de Facturas.
 *
 * Usa el token `error` (`#ba1a1a`) de `references/DESIGN.md`, no `success`: el
 * original marca Live con una etiqueta verde (`ModeSwitch.tsx:46`), el mismo
 * color que el resto del dashboard usa para "todo bien". Modo Live no es un
 * estado saludable — es un estado en el que cada acción tiene consecuencias
 * fiscales reales e irreversibles ante el SAT.
 */
export default function LiveModeBanner({ isLive }: Props) {
  if (!isLive) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-[#ba1a1a] dark:bg-red-900 px-4 py-2.5 text-sm font-semibold text-white">
      <AlertTriangle size={16} className="shrink-0" />
      <span>
        Modo Live activo: esta organización está emitiendo comprobantes fiscales reales ante el SAT.
      </span>
    </div>
  );
}
