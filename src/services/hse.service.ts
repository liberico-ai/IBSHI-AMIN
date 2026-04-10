import prisma from "@/lib/prisma";

export async function reportIncident(data: {
  reportedBy: string;
  incidentDate: string;
  type: string;
  severity: string;
  location: string;
  description: string;
  injuredPerson?: string;
}) {
  return prisma.hSEIncident.create({
    data: {
      ...data,
      incidentDate: new Date(data.incidentDate),
      type: data.type as any,
      severity: data.severity as any,
      status: "REPORTED",
    },
  });
}

export async function createBriefing(data: {
  date: string;
  topic: string;
  presenter: string;
  departmentId: string;
  totalAttendees?: number;
  totalTarget?: number;
  notes?: string;
}) {
  return prisma.safetyBriefing.create({
    data: {
      ...data,
      date: new Date(data.date),
      totalAttendees: data.totalAttendees ?? 0,
      totalTarget: data.totalTarget ?? 1,
    },
  });
}

export async function trackInduction(data: {
  employeeId?: string;
  visitorRegId?: string;
  personType?: string;
  conductedBy?: string;
  inductionDate: string;
}) {
  return prisma.hSEInduction.create({
    data: {
      ...data,
      inductionDate: new Date(data.inductionDate),
      personType: data.personType ?? "EMPLOYEE",
    },
  });
}
