import "server-only";
import Facturapi from "facturapi";

import db from "@/database/connection";
import { getOrganizationByUid, getOrganizationKey } from "@/lib/billing/organizationsRepository";

/**
 * Cliente único de Facturapi del módulo. Reemplaza las 4 implementaciones casi
 * idénticas de `getOrgClient` y los 8 `new Facturapi(...)` sueltos del proyecto
 * original (spec 28).
 */

let rootClient: Facturapi | null = null;

/**
 * Cliente con la clave de plataforma (`FACTURAPI_USER_KEY`), singleton **perezoso**:
 * se construye en la primera llamada, no en el import. El `lib/facturapi.ts`
 * original hace `throw` al importarse si falta la variable — portado tal cual
 * tumbaría el arranque de toda la app (pacientes, citas, ventas, inventario) para
 * quien no tenga configurado el módulo de facturación.
 */
export function getRootClient(): Facturapi {
  if (rootClient) return rootClient;

  const userKey = process.env.FACTURAPI_USER_KEY;
  if (!userKey) {
    throw new Error("FACTURAPI_USER_KEY no está configurada.");
  }

  rootClient = new Facturapi(userKey);
  return rootClient;
}

/**
 * Cliente de Facturapi para una organización, **sin parámetro `mode`**. Resuelve la
 * organización con `getOrganizationByUid` (lo que garantiza el chequeo de tenant en
 * todos los call sites), lee `is_live` de la fila, y obtiene la clave correspondiente
 * con `getOrganizationKey`.
 *
 * Que el modo se resuelva aquí adentro — nunca como argumento ni como query param —
 * es lo que hace imposible timbrar en producción por accidente desde cualquier call
 * site (ver Decisiones tomadas, spec 28). El modo Live en sí no se habilita hasta el
 * spec 30: `is_live` permanece en `0` en todas las filas de este spec.
 */
export async function getOrgClient(uid: string, idEmpresa: number): Promise<Facturapi> {
  const organization = await getOrganizationByUid(db, uid, idEmpresa);
  if (!organization) {
    throw new Error("Organización no encontrada en la base de datos");
  }

  if (organization.is_live) {
    if (!organization.hasLiveKey) {
      throw new Error(
        "Clave Live no configurada para esta organización. Renueva la clave Live desde Configuración."
      );
    }

    const remoteOrganization = await getRootClient().organizations.retrieve(uid);
    if (!remoteOrganization.certificate?.has_certificate) {
      throw new Error(
        "No hay un certificado de sello digital (CSD) cargado para esta organización. Súbelo desde Configuración antes de operar en modo Live."
      );
    }

    const liveKey = await getOrganizationKey(db, uid, idEmpresa, "live");
    if (!liveKey) {
      throw new Error(
        "Clave Live no configurada para esta organización. Renueva la clave Live desde Configuración."
      );
    }
    return new Facturapi(liveKey);
  }

  const testKey = await getOrganizationKey(db, uid, idEmpresa, "test");
  if (!testKey) {
    throw new Error("Clave Test no disponible para esta organización");
  }
  return new Facturapi(testKey);
}
