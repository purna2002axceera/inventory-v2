'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { config } from '@/lib/config';
import { useAuth } from '@/lib/auth-context';
import { LayoutDashboard, Package, LogOut, Factory, Users, ShoppingCart, Layers, RotateCcw, FileText, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/items/', label: 'Items', icon: Package },
  { href: '/production/', label: 'GRN', icon: Factory },
  { href: '/batches/', label: 'Batches', icon: Layers },
  { href: '/customers/', label: 'Customers', icon: Users },
  { href: '/sales-orders/', label: 'Sales Orders', icon: ShoppingCart },
  { href: '/returns/', label: 'Returns', icon: RotateCcw },
  { href: '/reports/', label: 'Reports', icon: FileText },
  { href: '/settings/', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();

  function handleLogout() {
    logout();
    router.push('/login/');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 shrink-0 border-r bg-muted/20 flex flex-col">
        <div className="p-4 flex justify-center border-b">
          <img src={config.logos.light} alt="Inventory App Logo" className="w-44 h-auto object-contain dark:hidden" />
          <img src={config.logos.dark} alt="Inventory App Logo" className="w-44 h-auto object-contain hidden dark:block" />
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                pathname === href 
                  ? 'bg-blue-500/15 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 font-medium' 
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t text-sm">
          <div className="mb-2 text-muted-foreground">{user?.fullName ?? user?.username}</div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-destructive hover:underline">
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
