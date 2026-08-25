import { NextResponse } from "next/server";
import { parseAttlogBody, saveAttendanceRecords, resolveChecadorBySN } from "@/lib/zktecoAdms";

export const runtime = "nodejs";

/** Respuesta uniforme cuando el SN no está dado de alta (o está inactivo) en RH.checadores. */
function unknownChecadorResponse(serialNumber: string): NextResponse {
  console.warn(`[asistencias] SN desconocido o inactivo, rechazado: ${serialNumber}`);
  return new NextResponse("SN no reconocido", {
    status: 403,
    headers: { "Content-Type": "text/plain" },
  });
}

/**
 * Handshake inicial del checador biométrico
 * (GET .../iclock/cdata?SN=...&options=all&language=101&pushver=...&DeviceType=att).
 * Responde en texto plano con la configuración que el checador espera antes
 * de empezar a empujar datos — formato fijo del protocolo ADMS de ZKTeco.
 */
export const GET = async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const serialNumber = searchParams.get("SN") ?? "";
  console.log(`[asistencias] handshake de checador SN=${serialNumber}`);

  const idChecador = await resolveChecadorBySN(serialNumber);
  if (idChecador === null) {
    return unknownChecadorResponse(serialNumber);
  }

  const options = [
    `GET OPTION FROM: ${serialNumber}`,
    "Stamp=0",
    "OpStamp=0",
    "ErrorDelay=60",
    "Delay=30",
    "TransTimes=00:00;23:59",
    "TransInterval=1",
    "TransFlag=1111000000",
    "Realtime=1",
    "Encrypt=0",
  ].join("\r\n");

  return new NextResponse(options, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
};

/**
 * Recibe lo que el checador empuja. Solo se procesan checadas (table=ATTLOG);
 * cualquier otra tabla (options, usuarios, huellas, fotos) se reconoce con
 * "OK" sin persistir nada, para no trabar el ciclo del dispositivo.
 */
export const POST = async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const table = searchParams.get("table") ?? "";
  const serialNumber = searchParams.get("SN") ?? "";
  const body = await req.text();
  // console.log(`[asistencias] POST table=${table} SN=${serialNumber} body=${body.slice(0, 500)}`);
  try {
    if (table === "ATTLOG") {
      const idChecador = await resolveChecadorBySN(serialNumber);
      if (idChecador === null) {
        return unknownChecadorResponse(serialNumber);
      }

      const records = parseAttlogBody(body);
      await saveAttendanceRecords(records, idChecador);
      return new NextResponse(`OK: ${records.length}`, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // console.log(`[asistencias] POST table=${table} ignorado`, body.slice(0, 500));
    return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
  } catch (error) {
    console.error({ error });
    return new NextResponse("error", { status: 500, headers: { "Content-Type": "text/plain" } });
  }
};
