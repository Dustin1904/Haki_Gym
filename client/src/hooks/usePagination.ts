import { useEffect, useMemo, useState } from "react";

const DEFAULT_SIZE = 15;

export function usePagination<T>(items: T[], pageSize = DEFAULT_SIZE, resetKey?: string | number) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize) || 1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const slice = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const from = items.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, items.length);

  return {
    page,
    setPage,
    totalPages,
    pageSize,
    total: items.length,
    slice,
    from,
    to,
    showPager: items.length > pageSize,
  };
}