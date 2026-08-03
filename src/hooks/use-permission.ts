"use client";

import { useSession } from "next-auth/react";
import { MODULE_PERMISSIONS } from "@/lib/permissions";
import { ROLE_HIERARCHY } from "@/lib/constants";
import { sessionPermSet } from "@/lib/permission-catalog";

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
    if (role === "ADMIN") return true; // Quản trị hệ thống = superset, qua mọi gate
    return roles.includes(role);
  }

  return { role, canDo, hasRole };
}

// Kiểm tra 1 ô quyền trong MA TRẬN ("feature:action", vd "m10.xe:edit").
// Đọc quyền hiệu lực đã tính sẵn trong session (perms). ADMIN = luôn có.
export function useCan() {
  const { data: session } = useSession();
  const role: string = (session?.user as any)?.role ?? "";
  // Quyền hiệu lực từ bitmask (pbits) mới hoặc mảng perms cũ; không tùy chỉnh → gói mẫu của role.
  const set = sessionPermSet(session?.user as any);
  return (perm: string) => role === "ADMIN" || set.has(perm);
}
