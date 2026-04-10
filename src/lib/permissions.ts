import { ROLE_HIERARCHY } from "@/lib/constants";

export function checkPermission(
  userRole: string,
  requiredRole: string
): boolean {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  return userLevel >= requiredLevel;
}

export function hasRole(userRole: string, roles: string[]): boolean {
  return roles.includes(userRole);
}
