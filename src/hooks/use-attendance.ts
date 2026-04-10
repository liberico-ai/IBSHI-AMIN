"use client";
import { useState, useEffect } from "react";
import type { AttendanceSummary } from "@/types";

export function useAttendanceSummary() {
  const [data, setData] = useState<AttendanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    setError(null);
    fetch("/api/v1/attendance?summary=true")
      .then((r) => r.json())
      .then((res) => setData(res.data || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { refresh(); }, []);

  return { data, loading, error, refresh };
}

export function useAttendanceRecords(filters?: { month?: number; year?: number; departmentId?: string; employeeId?: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters?.month) params.set("month", String(filters.month));
    if (filters?.year) params.set("year", String(filters.year));
    if (filters?.departmentId) params.set("departmentId", filters.departmentId);
    if (filters?.employeeId) params.set("employeeId", filters.employeeId);

    setLoading(true);
    fetch(`/api/v1/attendance?${params.toString()}`)
      .then((r) => r.json())
      .then((res) => setData(res.data || []))
      .finally(() => setLoading(false));
  }, [filters?.month, filters?.year, filters?.departmentId, filters?.employeeId]);

  return { data, loading };
}
