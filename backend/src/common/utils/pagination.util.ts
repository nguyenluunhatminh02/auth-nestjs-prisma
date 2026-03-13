export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
}

export function buildPageResponse<E, T>(
  items: E[],
  mapFn: (item: E) => T,
  page: number,
  size: number,
  total: number,
): PageResponse<T> {
  const totalPages = Math.ceil(total / size);
  return {
    content: items.map(mapFn),
    page,
    size,
    totalElements: total,
    totalPages,
    first: page === 0,
    last: page >= totalPages - 1,
    hasNext: page < totalPages - 1,
    hasPrevious: page > 0,
  };
}
