'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Zap, Crown, LogOut, Menu, X, CreditCard } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { apiFetch } from '../lib/api';
import { PLAN_COLORS, PLAN_LABELS, PLAN_LIMITS, lookupUserPlan, DEFAULT_FREE_PLAN, type UserPlan, type Plan } from '../lib/plans';

export default function Navbar() {
  const pathname = usePathname();
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<UserPlan>(DEFAULT_FREE_PLAN);
  const [paymentDot, setPaymentDot] = useState<'accepted' | 'rejected' | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    
    const syncFromBackend = async () => {
      const user = sessionStorage.getItem('outreachpro_session');
      setSessionUser(user);
      
      if (!user) {
        setUserPlan(DEFAULT_FREE_PLAN);
        setPaymentDot(null);
        return;
      }

      // Step 1: Show cached plan immediately (fast)
      const cachedPlan = localStorage.getItem('outreachpro_plan_cache');
      if (cachedPlan) {
        try { setUserPlan(JSON.parse(cachedPlan)); } catch {}
      } else {
        setUserPlan(lookupUserPlan(user));
      }

      // Step 2: Sync from backend — always trust the DB plan directly
      try {
        const users = await apiFetch(`/users/?email=${encodeURIComponent(user)}`);
        if (Array.isArray(users) && users.length > 0) {
          const dbUser = users.find((u: any) => u.email.toLowerCase() === user.toLowerCase());
          if (dbUser && dbUser.plan) {
            const plan = (dbUser.plan || 'free') as Plan;
            const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
            const freshPlan: UserPlan = {
              email: user,
              plan,
              ...limits,
              expiresAt: dbUser.expiresAt || dbUser.expires_at || '',
            };
            setUserPlan(freshPlan);
            localStorage.setItem('outreachpro_plan_cache', JSON.stringify(freshPlan));

            // Also update localStorage so other pages benefit
            const localUsers = JSON.parse(localStorage.getItem('outreachpro_users') || '[]');
            const idx = localUsers.findIndex((u: any) => u.email.toLowerCase() === user.toLowerCase());
            if (idx >= 0) localUsers[idx] = { ...localUsers[idx], ...dbUser };
            else localUsers.push(dbUser);
            localStorage.setItem('outreachpro_users', JSON.stringify(localUsers));
          }
        }
      } catch {}

      // Step 3: Check payment notification dot
      try {
        const payments = await apiFetch(`/payments/?email=${encodeURIComponent(user)}`);
        if (payments && payments.length > 0) {
          const latest = payments[0];
          const lastSeenId = localStorage.getItem('outreachpro_last_seen_payment');
          if (
            (latest.status === 'accepted' || latest.status === 'rejected') &&
            String(latest.id) !== lastSeenId
          ) {
            setPaymentDot(latest.status);
          } else {
            setPaymentDot(null);
          }
        } else {
          setPaymentDot(null);
        }
      } catch {}
    };

    syncFromBackend();
    const interval = setInterval(syncFromBackend, 3000);
    return () => clearInterval(interval);
  }, [pathname]);

  const handleLogout = () => {
    sessionStorage.removeItem('outreachpro_session');
    sessionStorage.removeItem('outreachpro_access');
    sessionStorage.removeItem('outreachpro_refresh');
    setSessionUser(null);
    window.location.href = '/';
  };

  const navLinks = [
    { label: 'Home', href: '/' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Contact Us', href: '/contact' },
  ];

  if (!isMounted) {
    return (
      <nav className="sticky top-0 z-50 border-b border-border-base bg-bg-nav backdrop-blur-lg h-20" />
    );
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-border-base bg-bg-nav backdrop-blur-lg">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        {/* Logo */}
        <Link href="/">
          <motion.div className="flex items-center gap-3" whileHover={{ scale: 1.02 }}>
            <motion.div
              className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center"
              whileHover={{ rotate: [0, -10, 10, 0], scale: 1.1 }}
              transition={{ duration: 0.4 }}
            >
              <Zap size={20} className="text-black dark:text-black" />
            </motion.div>
            <div className="flex flex-col leading-none">
              <span className="font-black text-text-base tracking-tight text-base">OutreachPro</span>
              <span className="text-[9px] font-bold text-text-muted uppercase tracking-[0.2em]">by A&S Solution</span>
            </div>
          </motion.div>
        </Link>

        {/* Mobile toggle */}
        <div className="flex md:hidden items-center gap-3">
          <ThemeToggle />
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 text-text-muted hover:text-text-base transition-colors"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center space-x-6">
          <div className="flex items-center space-x-8 pr-6 border-r border-border-base">
            {navLinks.map((item, i) => (
              <motion.div key={item.href} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }}>
                <Link
                  href={item.href}
                  className={`text-sm font-medium transition-colors ${pathname === item.href ? 'text-text-base font-semibold' : 'text-text-muted hover:text-text-base'}`}
                >
                  {item.label}
                </Link>
              </motion.div>
            ))}

            {/* Billing link — only when logged in */}
            {sessionUser && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="relative"
              >
                <Link
                  href="/billing"
                  className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${pathname === '/billing' ? 'text-text-base font-semibold' : 'text-text-muted hover:text-text-base'}`}
                >
                  <CreditCard size={14} />
                  Billing
                  {paymentDot && (
                    <span className={`absolute -top-1 -right-2.5 w-2 h-2 rounded-full animate-pulse ${paymentDot === 'accepted' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  )}
                </Link>
              </motion.div>
            )}
          </div>

          <ThemeToggle />

          {sessionUser ? (
            <div className="flex items-center gap-4">
              <Link href="/pricing">
                <motion.span
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wider cursor-pointer ${PLAN_COLORS[userPlan.plan]}`}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  title="Click to upgrade"
                >
                  <Crown size={10} /> {PLAN_LABELS[userPlan.plan]}
                </motion.span>
              </Link>
              <motion.button
                onClick={handleLogout}
                className="text-sm font-medium text-text-muted hover:text-text-base flex items-center gap-2 transition-colors"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
              >
                <LogOut size={16} />
              </motion.button>
            </div>
          ) : (
            <Link href="/auth">
              <motion.span
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-5 py-2 rounded-xl transition-all shadow-lg shadow-indigo-500/25 cursor-pointer"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                Log In
              </motion.span>
            </Link>
          )}
        </div>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="md:hidden border-t border-border-base bg-bg-nav px-6 py-4 space-y-4"
        >
          {navLinks.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`block text-sm font-medium py-2 transition-colors ${pathname === item.href ? 'text-text-base' : 'text-text-muted hover:text-text-base'}`}
            >
              {item.label}
            </Link>
          ))}
          {sessionUser && (
            <Link
              href="/billing"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-2 text-sm font-medium py-2 text-text-muted hover:text-text-base transition-colors"
            >
              <CreditCard size={14} />
              Billing
              {paymentDot && (
                <span className={`w-2 h-2 rounded-full animate-pulse ${paymentDot === 'accepted' ? 'bg-emerald-400' : 'bg-red-400'}`} />
              )}
            </Link>
          )}
          {sessionUser ? (
            <button onClick={handleLogout} className="flex items-center gap-2 text-sm text-red-400 font-medium py-2">
              <LogOut size={14} /> Logout
            </button>
          ) : (
            <Link href="/auth" onClick={() => setIsMobileMenuOpen(false)} className="block text-sm font-medium py-2 text-indigo-400">
              Log In
            </Link>
          )}
        </motion.div>
      )}
    </nav>
  );
}
