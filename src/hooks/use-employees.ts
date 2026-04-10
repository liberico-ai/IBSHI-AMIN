"use client";
import { useState, useEffect } from "react";
import type { Employee } from "@/types";

export function useEmployees(filters?: { departmentId?: string; search?: string; status?: string; limit?: number }) {
  const [data, setData] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters?.departmentId) params.set("departmentId", filters.departmentId);
    if (filters?.search) params.set("search", filters.search);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.limit) params.set("limit", String(filters.limit));

    setLoading(true);
    setError(null);

    fetch(`/api/v1/employees?${params.toString()}`)
      .then((r) => r.json())
      .then((res) => {
        setData(res.data || []);
        setTotal(res.total ?? res.data?.length ?? 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters?.departmentId, filters?.search, filters?.status, filters?.limit]);

  return { data, total, loading, error };
}
