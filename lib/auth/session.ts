import "server-only";

import { getMeAction } from "@/app/actions/auth";
import { IAuthUser } from "@/interfaces/auth";

/**
 * Sesión activa a partir de la cookie `auth_token`, vía `getMeAction()` (que ya hace
 * el `jwtVerify`). Lanza si no hay sesión o si el usuario está pendiente de aprobación
 * (`status` false), en vez de devolver `null` — así cada caller no puede olvidar el chequeo.
 *
 * Primer helper de sesión compartido del repo: hoy existen 19 copias privadas de
 * `getActiveUser()` en distintos `actions.ts`, cada una reencodeando `JWT_SECRET_SEED`.
 * Migrar las existentes queda fuera de este spec (spec 28).
 */
export async function requireActiveUser(): Promise<IAuthUser> {
  const user = await getMeAction();
  if (!user || !user.status) {
    throw new Error("No autenticado");
  }
  return user;
}

/**
 * Exige que el usuario activo tenga uno de los roles permitidos. Gatea dentro del
 * propio server action, además del gate de rutas de `proxy.ts` — proteger solo en
 * cliente deja el endpoint expuesto (mismo criterio que `assertSupervisorRole` en
 * `app/dashboard/conteos/actions.ts`).
 */
export async function requireRole(allowed: number[]): Promise<IAuthUser> {
  const user = await requireActiveUser();
  if (!allowed.includes(user.id_role)) {
    throw new Error("No tienes permisos para esta operación");
  }
  return user;
}

/** Acceso al módulo de facturación: mismo criterio de rol que `/dashboard/usuarios` y `/dashboard/empleados`. */
export async function requireBillingAccess(): Promise<IAuthUser> {
  return requireRole([1, 4]);
}
