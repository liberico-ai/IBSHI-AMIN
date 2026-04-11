import prisma from "@/lib/prisma";

/**
 * Write an audit log entry.
 * Fire-and-forget — never throws, never blocks the response.
 */
export function logAudit(data: {
  userId: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "REJECT";
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
}): void {
  prisma.auditLog
    .create({
      data: {
        userId: data.userId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        oldValue: data.oldValue !== undefined ? JSON.stringify(data.oldValue) : undefined,
        newValue: data.newValue !== undefined ? JSON.stringify(data.newValue) : undefined,
        ipAddress: data.ipAddress,
      },
    })
    .catch((err) => console.error("[AuditLog] Failed to write:", err));
}
