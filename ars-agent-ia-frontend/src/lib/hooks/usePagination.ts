import { useState, useCallback } from 'react';

export function usePagination(initialLimit = 20) {
  const [page, setPage]   = useState(1);
  const [limit]           = useState(initialLimit);
  const [total, setTotal] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const goTo   = useCallback((p: number) => setPage(Math.max(1, Math.min(p, totalPages))), [totalPages]);
  const next   = useCallback(() => goTo(page + 1), [page, goTo]);
  const prev   = useCallback(() => goTo(page - 1), [page, goTo]);
  const reset  = useCallback(() => setPage(1), []);

  return { page, limit, total, totalPages, setTotal, goTo, next, prev, reset };
}