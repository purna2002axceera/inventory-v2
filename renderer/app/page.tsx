'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function RootPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    router.replace(user ? '/dashboard/' : '/login/');
  }, [user, router]);

  return null;
}
