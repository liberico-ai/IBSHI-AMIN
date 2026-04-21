"use client";

import { useSession } from "next-auth/react";
import { MODULE_PERMISSIONS } from "@/lib/permissions";
import { ROLE_HIERARCHY } from "@/lib/constants";

type ModuleKey = keyof typeof MODULE_PERMISSIONS;
type ActionKey<M extends ModuleKey> = keyof (typeof MODULE_PERMISSIONS)[M];

function checkLevel(userRole: string, requiredRole: string): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
}

export function usePermission() {
  const { data: session } = useSession();
  const role: string = (session?.user as any)?.role ?? "";

  function canDo<M extends ModuleKey>(module: M, action: ActionKey<M>): boolean {
    const required = MODULE_PERMISSIONS[module][action] as string;
    return checkLevel(role, required);
  }

  function hasRole(...roles: string[]): boolean {
    return roles.includes(role);
  }

  return { role, canDo, hasRole };
}
