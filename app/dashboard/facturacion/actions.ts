"use server";

/**
 * Server actions del módulo de facturación. Porta `app/actions/organizations.ts`
 * del proyecto `factura` original (spec 28) — administración de organizaciones
 * (listar, crear, editar datos legales, eliminar, certificado CSD, API keys) y,
 * desde el spec 30, el cambio de modo (`setOrgMode`). `uploadOrganizationLogo` y
 * `updateOrganizationCustomization` quedan para el spec 31 (Personalización).
 *
 * Todas las llamadas a Facturapi usan `getRootClient()` (la clave de plataforma),
 * no `getOrgClient()`: administrar organizaciones es una operación de cuenta, no
 * de facturación en nombre de una organización — `getOrgClient` se reserva para
 * las llamadas de dominio (clientes, productos, facturas) de los specs 29 y 30.
 *
 * Filtro por tenant: toda función valida que `orgId` pertenezca a `id_empresa`
 * del JWT (`assertOwnedOrganization`) antes de tocar Facturapi, que no tiene
 * noción de tenant. Deliberadamente **no** se filtra además por `id_sucursal`:
 * una organización de Facturapi es una entidad fiscal de la empresa completa
 * (el RFC, el certificado CSD y las series de folios son únicos por razón
 * social), no de una sucursal — no "corregir" esto agregando `id_sucursal`.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ApiKeys, Organization } from "facturapi";

import db from "@/database/connection";
import { ActionResult } from "@/app/actions/auth";
import { requireBillingAccess } from "@/lib/auth/session";
import { getRootClient } from "@/lib/billing/facturapiClient";
import { toUserMessage } from "@/lib/billing/errors";
import {
  CreateOrganizationSchema,
  UpdateOrganizationLegalSchema,
  UploadCertificateSchema,
  SetOrgModeSchema,
} from "@/lib/billing/schemas";
import {
  getOrganizationByUid,
  getOrganizationKey,
  listOrganizationUids,
  insertOrganization,
  updateOrganizationLegal as updateOrganizationLegalRecord,
  setTestKey,
  setLiveKey,
  setLiveMode,
  deleteOrganizationByUid,
  writeAuditEntry,
} from "@/lib/billing/organizationsRepository";

const OrgIdSchema = z.string().trim().min(1, "Organización inválida");

/**
 * Confirma que `uid` pertenece a `idEmpresa` antes de tocar Facturapi. Facturapi
 * es una cuenta compartida por toda la app: sin este chequeo, cualquier usuario
 * con acceso al módulo podría operar sobre la organización de otra empresa con
 * solo conocer su `uid`.
 */
async function assertOwnedOrganization(uid: string, idEmpresa: number) {
  const organization = await getOrganizationByUid(db, uid, idEmpresa);
  if (!organization) {
    throw new Error("Organización no encontrada en la base de datos");
  }
  return organization;
}

// ---------------------------------------------------------------------------
// Detalle
// ---------------------------------------------------------------------------

/** Datos combinados para la pestaña General: legales frescos de Facturapi + estado local de las claves. */
export interface IOrganizationDetail {
  organization: Organization;
  hasTestKey: boolean;
  hasLiveKey: boolean;
  isLive: boolean;
}

/**
 * El detalle siempre lee de Facturapi con `organizations.retrieve` — la copia local
 * es solo para el listado. Así el detalle nunca muestra datos desincronizados si
 * alguien edita la organización directamente desde el panel de Facturapi.
 */
export async function getOrganizationDetail(orgId: string): Promise<ActionResult<IOrganizationDetail>> {
  try {
    const { id_empresa } = await requireBillingAccess();

    const orgIdCheck = OrgIdSchema.safeParse(orgId);
    if (!orgIdCheck.success) return { ok: false, message: orgIdCheck.error.issues[0].message };
    const uid = orgIdCheck.data;

    const localRecord = await assertOwnedOrganization(uid, id_empresa);
    const organization = await getRootClient().organizations.retrieve(uid);

    return {
      ok: true,
      data: {
        organization,
        hasTestKey: localRecord.hasTestKey,
        hasLiveKey: localRecord.hasLiveKey,
        isLive: localRecord.is_live,
      },
    };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

/** Metadata de las claves Live activas (id, `first_12`, fecha) — nunca la clave completa. */
export async function listLiveApiKeys(orgId: string): Promise<ActionResult<ApiKeys[]>> {
  try {
    const { id_empresa } = await requireBillingAccess();

    const orgIdCheck = OrgIdSchema.safeParse(orgId);
    if (!orgIdCheck.success) return { ok: false, message: orgIdCheck.error.issues[0].message };
    const uid = orgIdCheck.data;
    await assertOwnedOrganization(uid, id_empresa);

    const keys = await getRootClient().organizations.listLiveApiKeys(uid);
    return { ok: true, data: keys };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Listado
// ---------------------------------------------------------------------------

/**
 * Cruza el listado de Facturapi (fuente de verdad de los datos legales) con los
 * `uid` locales de la empresa del usuario, para no depender de que Facturapi
 * sepa nada de tenants. Se listan con `limit: 50`, sin paginación real (ver
 * spec 28, "No incluye").
 */
export async function listOrganizations(): Promise<ActionResult<Organization[]>> {
  try {
    const { id_empresa } = await requireBillingAccess();

    const allowedUids = new Set(await listOrganizationUids(db, id_empresa));
    const result = await getRootClient().organizations.list({ limit: 50 });
    const organizations = result.data.filter((org) => allowedUids.has(org.id));

    return { ok: true, data: organizations };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------

export async function createOrganization(input: unknown): Promise<ActionResult<Organization>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const parsed = CreateOrganizationSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }
    const data = parsed.data;

    // Facturapi v2 solo acepta `name` al crear; el resto de los datos legales se
    // fija en un segundo paso con `updateLegal` (ver nota en CreateOrganizationSchema:
    // `tax_id`/`country` no pueden fijarse por organización, quedan a cargo de la cuenta).
    const created = await getRootClient().organizations.create({ name: data.name });

    try {
      const org = await getRootClient().organizations.updateLegal(created.id, {
        name: data.name,
        legal_name: data.legal_name,
        tax_system: data.tax_system,
        address: {
          street: data.street,
          exterior: data.exterior,
          neighborhood: data.neighborhood,
          zip: data.zip,
          city: data.city,
          municipality: data.municipality,
          state: data.state,
        },
      });

      const testKey = await getRootClient().organizations.getTestApiKey(org.id);

      await db.transaction(async (tx) => {
        await insertOrganization(tx, {
          uid: org.id,
          id_empresa,
          testKey,
          name: org.legal.name,
          legal_name: org.legal.legal_name,
          tax_id: org.legal.tax_id,
          tax_system: org.legal.tax_system,
          phone: org.legal.phone ?? null,
          website: org.legal.website ?? null,
          support_email: org.legal.support_email ?? null,
          street: org.legal.address.street ?? null,
          exterior: org.legal.address.exterior ?? null,
          interior: org.legal.address.interior ?? null,
          neighborhood: org.legal.address.neighborhood ?? null,
          zip: org.legal.address.zip ?? null,
          city: org.legal.address.city ?? null,
          municipality: org.legal.address.municipality ?? null,
          state: org.legal.address.state ?? null,
          country: org.legal.address.country ?? null,
        });
        await writeAuditEntry(tx, {
          id_empresa,
          id_user,
          action: "org.create",
          org_uid: org.id,
          mode: "test",
        });
      });

      revalidatePath("/dashboard/facturacion");
      return { ok: true, data: org };
    } catch (stepError) {
      // El `create({ name })` inicial ya dejó una organización real en Facturapi; si
      // cualquier paso posterior falla, hay que borrarla para no dejarla huérfana
      // (visible en Facturapi pero sin fila local ni datos legales).
      try {
        await getRootClient().organizations.del(created.id);
      } catch (cleanupError) {
        console.error("[billing] No se pudo revertir la organización huérfana", created.id, cleanupError);
      }
      throw stepError;
    }
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Edición de datos legales
// ---------------------------------------------------------------------------

export async function updateOrganizationLegal(
  orgId: string,
  input: unknown
): Promise<ActionResult<Organization>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const orgIdCheck = OrgIdSchema.safeParse(orgId);
    if (!orgIdCheck.success) return { ok: false, message: orgIdCheck.error.issues[0].message };
    const uid = orgIdCheck.data;
    await assertOwnedOrganization(uid, id_empresa);

    const parsed = UpdateOrganizationLegalSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }
    const data = parsed.data;

    // Sin `tax_id` ni `address.country`: Facturapi v2 los rechaza en `updateLegal`
    // (ver nota en CreateOrganizationSchema) — quedan fijos a los de la cuenta.
    const org = await getRootClient().organizations.updateLegal(uid, {
      name: data.name,
      legal_name: data.legal_name,
      tax_system: data.tax_system,
      phone: data.phone,
      website: data.website,
      support_email: data.support_email,
      address: {
        street: data.street,
        exterior: data.exterior,
        interior: data.interior,
        neighborhood: data.neighborhood,
        zip: data.zip,
        city: data.city,
        municipality: data.municipality,
        state: data.state,
      },
    });

    // `tax_id`/`country` no vienen del formulario (ver arriba): se toman de la respuesta
    // de Facturapi, que es la autoridad sobre esos dos campos.
    await db.transaction(async (tx) => {
      await updateOrganizationLegalRecord(tx, uid, id_empresa, {
        ...data,
        tax_id: org.legal.tax_id,
        country: org.legal.address.country,
      });
      await writeAuditEntry(tx, {
        id_empresa,
        id_user,
        action: "org.update_legal",
        org_uid: uid,
      });
    });

    revalidatePath(`/dashboard/facturacion/${uid}/general`);
    return { ok: true, data: org };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Eliminar organización
// ---------------------------------------------------------------------------

/** Elimina en Facturapi **y** la fila local, para no dejar una fila huérfana (corrige el original). */
export async function deleteOrganization(orgId: string): Promise<ActionResult<void>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const orgIdCheck = OrgIdSchema.safeParse(orgId);
    if (!orgIdCheck.success) return { ok: false, message: orgIdCheck.error.issues[0].message };
    const uid = orgIdCheck.data;
    await assertOwnedOrganization(uid, id_empresa);

    await getRootClient().organizations.del(uid);

    await db.transaction(async (tx) => {
      await deleteOrganizationByUid(tx, uid, id_empresa);
      await writeAuditEntry(tx, {
        id_empresa,
        id_user,
        action: "org.delete",
        org_uid: uid,
      });
    });

    revalidatePath("/dashboard/facturacion");
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Certificado CSD
// ---------------------------------------------------------------------------

/**
 * La contraseña del CSD se reenvía a Facturapi y se descarta: no se persiste, no
 * se registra en `audit_log`, no se loguea.
 */
export async function uploadCertificate(formData: FormData): Promise<ActionResult<Organization>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const parsed = await UploadCertificateSchema.safeParseAsync({
      orgId: formData.get("orgId"),
      password: formData.get("password"),
      cerFile: formData.get("cer"),
      keyFile: formData.get("key"),
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Archivo inválido" };
    }
    const { orgId, password, cerFile, keyFile } = parsed.data;
    await assertOwnedOrganization(orgId, id_empresa);

    const org = await getRootClient().organizations.uploadCertificate(orgId, cerFile, keyFile, password);

    await writeAuditEntry(db, {
      id_empresa,
      id_user,
      action: "cert.upload",
      org_uid: orgId,
    });

    revalidatePath(`/dashboard/facturacion/${orgId}/general`);
    return { ok: true, data: org };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

export async function deleteCertificate(orgId: string): Promise<ActionResult<Organization>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const orgIdCheck = OrgIdSchema.safeParse(orgId);
    if (!orgIdCheck.success) return { ok: false, message: orgIdCheck.error.issues[0].message };
    const uid = orgIdCheck.data;
    await assertOwnedOrganization(uid, id_empresa);

    const org = await getRootClient().organizations.deleteCertificate(uid);

    await writeAuditEntry(db, {
      id_empresa,
      id_user,
      action: "cert.delete",
      org_uid: uid,
    });

    revalidatePath(`/dashboard/facturacion/${uid}/general`);
    return { ok: true, data: org };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// API keys — ninguna función de esta sección devuelve la clave completa
// ---------------------------------------------------------------------------

export async function renewTestApiKey(orgId: string): Promise<ActionResult<{ first_12: string }>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const orgIdCheck = OrgIdSchema.safeParse(orgId);
    if (!orgIdCheck.success) return { ok: false, message: orgIdCheck.error.issues[0].message };
    const uid = orgIdCheck.data;
    await assertOwnedOrganization(uid, id_empresa);

    const newKey = await getRootClient().organizations.renewTestApiKey(uid);

    let first12 = "";
    await db.transaction(async (tx) => {
      first12 = await setTestKey(tx, uid, id_empresa, newKey);
      await writeAuditEntry(tx, {
        id_empresa,
        id_user,
        action: "key.renew_test",
        org_uid: uid,
        mode: "test",
      });
    });

    revalidatePath(`/dashboard/facturacion/${uid}/general`);
    return { ok: true, data: { first_12: first12 } };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

export async function renewLiveApiKey(orgId: string): Promise<ActionResult<{ first_12: string }>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const orgIdCheck = OrgIdSchema.safeParse(orgId);
    if (!orgIdCheck.success) return { ok: false, message: orgIdCheck.error.issues[0].message };
    const uid = orgIdCheck.data;
    await assertOwnedOrganization(uid, id_empresa);

    const newKey = await getRootClient().organizations.renewLiveApiKey(uid);

    let first12 = "";
    await db.transaction(async (tx) => {
      first12 = (await setLiveKey(tx, uid, id_empresa, newKey)) ?? "";
      await writeAuditEntry(tx, {
        id_empresa,
        id_user,
        action: "key.renew_live",
        org_uid: uid,
        mode: "live",
      });
    });

    revalidatePath(`/dashboard/facturacion/${uid}/general`);
    return { ok: true, data: { first_12: first12 } };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

/**
 * Revoca una clave Live. Corrige el bug del original (`organizations.ts:237`): antes
 * solo limpiaba la clave guardada cuando ya no quedaba ninguna (`remaining.length === 0`),
 * así que revocar una de varias claves dejaba guardada una clave muerta. Aquí se
 * limpia siempre que la clave revocada sea la que tenemos almacenada — se identifica
 * comparando el `first_12` de la clave a revocar (leído de Facturapi antes de borrarla)
 * contra el `first_12` de la clave local descifrada.
 */
export async function deleteLiveApiKey(orgId: string, keyId: string): Promise<ActionResult<ApiKeys[]>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const orgIdCheck = OrgIdSchema.safeParse(orgId);
    const keyIdCheck = OrgIdSchema.safeParse(keyId);
    if (!orgIdCheck.success || !keyIdCheck.success) {
      return { ok: false, message: "Solicitud inválida" };
    }
    const uid = orgIdCheck.data;
    const targetKeyId = keyIdCheck.data;
    await assertOwnedOrganization(uid, id_empresa);

    const storedLiveKey = await getOrganizationKey(db, uid, id_empresa, "live");
    const keysBeforeDeletion = await getRootClient().organizations.listLiveApiKeys(uid);
    const targetKey = keysBeforeDeletion.find((key) => key.id === targetKeyId);

    const remaining = await getRootClient().organizations.deleteLiveApiKey(uid, targetKeyId);

    const revokedKeyWasStored = Boolean(
      storedLiveKey && targetKey && storedLiveKey.startsWith(targetKey.first_12)
    );

    await db.transaction(async (tx) => {
      if (revokedKeyWasStored) {
        await setLiveKey(tx, uid, id_empresa, null);
      }
      await writeAuditEntry(tx, {
        id_empresa,
        id_user,
        action: "key.revoke_live",
        org_uid: uid,
        target_id: targetKeyId,
        mode: "live",
      });
    });

    revalidatePath(`/dashboard/facturacion/${uid}/general`);
    return { ok: true, data: remaining };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Modo Live (spec 30)
// ---------------------------------------------------------------------------

/**
 * Activa o desactiva el modo Live de una organización. **No basta con escribir
 * `is_live`**: el original lo hacía directo (`setOrgMode` de la referencia) y el
 * error de "falta CSD" o "falta clave Live" aparecía después, al primer intento
 * de timbrar — con el usuario ya creyendo estar en producción. Aquí, activar
 * falla *antes* de tocar la base de datos si falta cualquiera de las dos
 * precondiciones, y `is_live` no cambia cuando eso ocurre.
 *
 * Desactivar Live (`isLive: false`) no tiene precondiciones: siempre es seguro
 * volver a Test.
 */
export async function setOrgMode(orgId: string, isLive: boolean): Promise<ActionResult<{ isLive: boolean }>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const parsed = SetOrgModeSchema.safeParse({ orgId, isLive });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }
    const uid = parsed.data.orgId;
    const nextIsLive = parsed.data.isLive;

    const localRecord = await assertOwnedOrganization(uid, id_empresa);

    if (nextIsLive) {
      if (!localRecord.hasLiveKey) {
        return {
          ok: false,
          message:
            "No se puede activar el modo Live: no hay una clave Live configurada. Renuévala desde Configuración.",
        };
      }
      const remoteOrganization = await getRootClient().organizations.retrieve(uid);
      if (!remoteOrganization.certificate?.has_certificate) {
        return {
          ok: false,
          message:
            "No se puede activar el modo Live: falta el certificado de sello digital (CSD). Súbelo desde Configuración.",
        };
      }
    }

    await db.transaction(async (tx) => {
      await setLiveMode(tx, uid, id_empresa, nextIsLive);
      await writeAuditEntry(tx, {
        id_empresa,
        id_user,
        action: nextIsLive ? "mode.set_live" : "mode.set_test",
        org_uid: uid,
        mode: nextIsLive ? "live" : "test",
      });
    });

    // `type: "layout"` porque el indicador de modo Live vive en `[id]/layout.tsx`
    // y debe reflejarse en las cinco pestañas de la organización, no solo en una.
    revalidatePath(`/dashboard/facturacion/${uid}`, "layout");
    return { ok: true, data: { isLive: nextIsLive } };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}
