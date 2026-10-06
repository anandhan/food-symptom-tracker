'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getLocalCalendarDate } from '@/lib/dates';

/** If the URL has no date, set it from the browser's local calendar date. */
export function LocalDateRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('date')) return;
    const local = getLocalCalendarDate();
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', local);
    router.replace(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

  return null;
}
