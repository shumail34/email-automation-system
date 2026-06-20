'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Clock, CreditCard, RefreshCw, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { PLAN_LABELS, type Plan } from '../../lib/plans';
import Navbar from '../../components/Navbar';

interface Payment {
  id: number;
  plan: string;
  amount: string;
  status: 'pending' | 'accepted' | 'approved' | 'rejected';
  created_at: string;
  proof?: string;
}

const STATUS_CONFIG = {
  pending: {
    label: 'Pending Review',
    icon: Clock,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    dot: 'bg-amber-400',
    badge: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
  accepted: {
    label: 'Accepted',
    icon: Check,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-400',
    badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  approved: {
    label: 'Accepted',
    icon: Check,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-400',
    badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  rejected: {
    label: 'Rejected',
    icon: X,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    dot: 'bg-red-400',
    badge: 'text-red-400 bg-red-500/10 border-red-500/20',
  },
};

export default function BillingPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [selectedProof, setSelectedProof] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPayments = async (email: string, silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await apiFetch(`/payments/?email=${encodeURIComponent(email)}`);
      if (Array.isArray(data)) {
        setPayments(data);
        if (data.length > 0) {
          localStorage.setItem('outreachpro_last_seen_payment', String(data[0].id));
        }
      }
    } catch (err) {
      // silent fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    const user = sessionStorage.getItem('outreachpro_session');
    if (user) {
      setSessionUser(user);
      fetchPayments(user);
    } else {
      setLoading(false);
    }
  }, []);

  if (!isMounted) return <div className="min-h-screen bg-[#020617]" />;

  return (
    <div className="min-h-screen text-slate-100 transition-colors duration-300" style={{ fontFamily: "'Inter', sans-serif", background: 'var(--bg-base)' }}>


      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-indigo-500/8 blur-[140px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[400px] bg-violet-500/5 blur-[120px] rounded-full" />
      </div>

      <Navbar />


      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-16">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <CreditCard size={22} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-100 tracking-tight">Billing History</h1>
              <p className="text-slate-500 text-sm mt-0.5">Track your payment submissions and plan upgrades</p>
            </div>
          </div>
          {sessionUser && (
            <p className="text-xs text-slate-600 mt-4 font-mono">{sessionUser}</p>
          )}
        </motion.div>

        {/* Not logged in */}
        {!sessionUser && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-24 rounded-3xl border border-white/5 bg-white/2"
          >
            <AlertTriangle size={48} className="text-amber-500 mx-auto mb-4" />
            <h3 className="text-xl font-black text-slate-200 mb-2">Not Logged In</h3>
            <p className="text-slate-500 text-sm mb-6">Please log in to view your billing history.</p>
            <Link href="/auth">
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all"
              >
                Log In
              </motion.button>
            </Link>
          </motion.div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-2xl bg-white/3 border border-white/5 animate-pulse" />
            ))}
          </div>
        )}

        {/* Payments list */}
        {!loading && sessionUser && (
          <>
            <div className="flex items-center justify-between mb-6">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                {payments.length} {payments.length === 1 ? 'record' : 'records'} found
              </span>
              <motion.button
                onClick={() => fetchPayments(sessionUser, true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                disabled={refreshing}
                className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-100 transition-colors px-3 py-2 rounded-xl border border-white/5 hover:bg-white/5"
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                Refresh
              </motion.button>
            </div>

            {payments.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-24 rounded-3xl border border-white/5 bg-white/2"
              >
                <CreditCard size={48} className="text-slate-700 mx-auto mb-4" />
                <h3 className="text-xl font-black text-slate-400 mb-2">No Payments Yet</h3>
                <p className="text-slate-600 text-sm mb-6">Submit a payment to upgrade your plan.</p>
                <Link href="/pricing">
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                    className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all"
                  >
                    View Plans
                  </motion.button>
                </Link>
              </motion.div>
            ) : (
              <div className="space-y-4">
                {payments.map((payment, idx) => {
                  const cfg = STATUS_CONFIG[payment.status] || STATUS_CONFIG.pending;
                  const Icon = cfg.icon;
                  const date = new Date((payment as any).date || payment.created_at);
                  const formattedDate = date.toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  });
                  const formattedTime = date.toLocaleTimeString('en-US', {
                    hour: '2-digit', minute: '2-digit',
                  });
                  return (
                    <motion.div
                      key={payment.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.07 }}
                      className={`relative p-5 rounded-2xl border backdrop-blur-sm ${cfg.bg} ${cfg.border} flex flex-col sm:flex-row sm:items-center gap-4`}
                    >
                      {/* Status icon */}
                      <div className={`flex-shrink-0 w-12 h-12 rounded-xl border flex items-center justify-center ${cfg.bg} ${cfg.border}`}>
                        <Icon size={20} className={cfg.color} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-black text-slate-100 text-sm uppercase tracking-wide">
                            {PLAN_LABELS[payment.plan as Plan] || payment.plan} Plan
                          </span>
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-mono truncate">
                          TX: {payment.amount}
                        </p>
                        <p className="text-[11px] text-slate-600 mt-1">
                          {formattedDate} at {formattedTime}
                        </p>
                      </div>

                      {/* Status message */}
                      <div className="text-right hidden md:block">
                        <p className={`text-xs font-bold ${cfg.color}`}>
                          {payment.status === 'accepted' || payment.status === 'approved'
                            ? '✓ Plan Activated'
                            : payment.status === 'rejected'
                            ? '✗ Payment Declined'
                            : '⏳ Under Review'}
                        </p>
                        <p className="text-[10px] text-slate-600 mt-0.5">
                          {payment.status === 'accepted' || payment.status === 'approved'
                            ? 'Your plan has been upgraded'
                            : payment.status === 'rejected'
                            ? 'Contact support if needed'
                            : 'Allow up to 24 hours'}
                        </p>
                      </div>

                      {/* Proof image */}
                      {payment.proof && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setSelectedProof(payment.proof!)}
                          className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-all"
                          title="View proof"
                        >
                          <img src={payment.proof} alt="Payment proof" className="w-full h-full object-cover" />
                        </motion.button>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Proof Modal */}
      <AnimatePresence>
        {selectedProof && (
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
            onClick={() => setSelectedProof(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedProof(null)}
                className="absolute -top-12 right-0 p-2 text-slate-400 hover:text-slate-100 transition-colors"
              >
                <X size={24} />
              </button>
              <img
                src={selectedProof}
                alt="Payment Proof"
                className="w-full h-full object-contain rounded-2xl shadow-2xl"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
