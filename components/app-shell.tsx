'use client';

import { BarChart3, FileText, LineChart, Menu, Newspaper, Search, Star, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useState } from 'react';

const navigation = [
  { label: 'Dashboard', href: '/', icon: BarChart3 },
  { label: 'Markets', href: '/markets', icon: LineChart },
  { label: 'Watchlist', href: '/watchlist', icon: Star },
  { label: 'News', href: '/news', icon: Newspaper },
  { label: 'Analysis', href: '/analysis', icon: FileText },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col border-r border-line bg-panel">
      <div className="flex h-20 items-center gap-3 border-b border-line px-5">
        <div className="grid h-10 w-10 place-items-center rounded border border-cyan-300/40 bg-cyan-400/10">
          <Search className="h-5 w-5 text-cyan-200" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold uppercase text-cyan-300">PSX Insight</p>
          <p className="text-xs text-gray-500">Market terminal</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded px-3 py-3 text-sm font-medium transition ${
                active
                  ? 'border border-cyan-300/30 bg-cyan-400/10 text-cyan-100'
                  : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-100'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-canvas text-gray-100 lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] lg:block">
        <SidebarContent />
      </aside>

      <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-panel/95 px-4 backdrop-blur lg:hidden">
        <p className="text-sm font-semibold uppercase text-cyan-300">PSX Insight</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded border border-line p-2 text-gray-200"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/70"
            onClick={() => setOpen(false)}
          />
          <aside className="relative h-full w-[280px]">
            <SidebarContent onNavigate={() => setOpen(false)} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 rounded border border-line bg-black/20 p-2 text-gray-200"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </aside>
        </div>
      ) : null}

      <div className="lg:col-start-2">{children}</div>
    </div>
  );
}
