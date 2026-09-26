'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export interface UseAsyncSearchOptions<T> {
  /** Function that fetches a page of results from the backend */
  fetcher: (params: { page: number; pageSize: number; search: string }) => Promise<{ data: T[]; total: number }>;
  /** Which field on T is the unique ID */
  idKey: keyof T;
  /** How many results per page (default 30) */
  pageSize?: number;
}

export interface UseAsyncSearchReturn<T> {
  /** Current visible options (accumulated via infinite scroll) */
  options: T[];
  /** Current search term */
  searchTerm: string;
  /** Update search term (triggers debounced fetch, resets to page 1) */
  setSearchTerm: (term: string) => void;
  /** True while a fetch is in progress */
  isLoading: boolean;
  /** True if there are more pages to load */
  hasMore: boolean;
  /** Fetch the next page and append results */
  loadMore: () => void;
  /** Look up any previously-fetched record by its ID (cache lookup) */
  getById: (id: string | number) => T | undefined;
  /** Clear all state (call when dialog closes) */
  reset: () => void;
  /** Reload the current search results */
  reload: () => void;
}

export function useAsyncSearch<T extends Record<string, any>>({
  fetcher,
  idKey,
  pageSize = 30,
}: UseAsyncSearchOptions<T>): UseAsyncSearchReturn<T> {
  const [searchTerm, setSearchTermState] = useState('');
  const [options, setOptions] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Cache: stores every record we've ever fetched so selected items keep their labels
  const cacheRef = useRef<Map<string | number, T>>(new Map());
  // Track the latest search to ignore stale responses
  const latestSearchRef = useRef('');
  // Debounce timer
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prevent double-fetch on initial mount
  const initialFetchDone = useRef(false);

  const hasMore = options.length < total;

  const doFetch = useCallback(
    async (searchValue: string, pageNum: number, append: boolean) => {
      latestSearchRef.current = searchValue;
      setIsLoading(true);
      try {
        const result = await fetcher({ page: pageNum, pageSize, search: searchValue });
        // Ignore response if a newer search was fired
        if (latestSearchRef.current !== searchValue) return;

        // Add every record to the cache
        for (const record of result.data) {
          cacheRef.current.set(String(record[idKey]), record);
        }

        if (append) {
          setOptions((prev) => {
            const existingIds = new Set(prev.map((r) => String(r[idKey])));
            const newItems = result.data.filter((r) => !existingIds.has(String(r[idKey])));
            return [...prev, ...newItems];
          });
        } else {
          setOptions(result.data);
        }
        setTotal(result.total);
      } catch (err) {
        console.error('useAsyncSearch fetch error:', err);
      } finally {
        if (latestSearchRef.current === searchValue) {
          setIsLoading(false);
        }
      }
    },
    [fetcher, idKey, pageSize]
  );

  // Initial fetch on mount
  useEffect(() => {
    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      doFetch('', 1, false);
    }
  }, [doFetch]);

  const setSearchTerm = useCallback(
    (term: string) => {
      setSearchTermState(term);
      // Debounce: clear previous timer and set a new one
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setPage(1);
        doFetch(term, 1, false);
      }, 300);
    },
    [doFetch]
  );

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    doFetch(searchTerm, nextPage, true);
  }, [isLoading, hasMore, page, searchTerm, doFetch]);

  const getById = useCallback((id: string | number): T | undefined => {
    return cacheRef.current.get(String(id));
  }, []);

  const reset = useCallback(() => {
    setSearchTermState('');
    setOptions([]);
    setPage(1);
    setTotal(0);
    cacheRef.current.clear();
    latestSearchRef.current = '';
    if (timerRef.current) clearTimeout(timerRef.current);

    // Consumers that keep this hook mounted across dialog open/close cycles (rather than
    // unmounting it) call reset() on close to clear stale options. The one-time mount fetch
    // below only ever fires once per component lifetime, so without an explicit re-fetch here,
    // the dropdown would stay empty forever after the first close — refetch now so fresh data
    // is already in place by the time the dialog reopens.
    doFetch('', 1, false);
  }, [doFetch]);

  const reload = useCallback(() => {
    setPage(1);
    doFetch(searchTerm, 1, false);
  }, [doFetch, searchTerm]);

  return {
    options,
    searchTerm,
    setSearchTerm,
    isLoading,
    hasMore,
    loadMore,
    getById,
    reset,
    reload,
  };
}
