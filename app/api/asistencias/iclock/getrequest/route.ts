import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * El checador hace polling aquí (GET .../iclock/getrequest?SN=...) para saber
 * si hay comandos pendientes (ej. borrar usuario, resincronizar hora). Por
 * ahora nunca mandamos comandos, así que siempre respondemos "sin pendientes".
 */
export const GET = async () => {
  return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
};
