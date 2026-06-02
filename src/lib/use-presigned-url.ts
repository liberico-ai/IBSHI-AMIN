"use client";

import { useEffect, useState } from "react";

/**
 * Hook: nhận URL gốc của file MinIO private, trả về URL đã ký (1 giờ).
 * Trong khi đang xin link, trả về null. Nếu lỗi, fallback về URL gốc.
 *
 * Dùng cho <img src>, <iframe src>, hoặc <a href> khi cần hiển thị file
 * từ bucket private mà user đang login.
 */
export function usePresignedUrl(url?: string | null): string | null {
  const [signed, setSigned] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setSigned(null);
      return;
    }
    let alive = true;
    setSigned(null);
    fetch(`/api/v1/files/presign?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((res) => {
        if (!alive) return;
        setSigned(res?.data?.url || url);
      })
      .catch(() => {
        if (alive) setSigned(url);
      });
    return () => {
      alive = false;
    };
  }, [url]);

  return signed;
}

/** Hàm imperative (dùng trong event handler, không trong render). */
export async function getPresignedUrl(url: string): Promise<string> {
  try {
    const res = await fetch(`/api/v1/files/presign?url=${encodeURIComponent(url)}`);
    const json = await res.json();
    return json?.data?.url || url;
  } catch {
    return url;
  }
}
