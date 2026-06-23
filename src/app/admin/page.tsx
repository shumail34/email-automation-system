"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Plus, Trash2, Crown, Rocket, Building2, Zap,
  Search, CheckCircle2, AlertCircle, Lock, Eye, EyeOff,
  Users, RefreshCw, LogOut, Edit2, X, Save, Image as ImageIcon, MessageSquare
} from 'lucide-react';

import { lookupUserPlan, DEFAULT_FREE_PLAN, PLAN_LABELS, PLAN_COLORS, generateIntegrityHash } from '../../lib/plans';
import { apiFetch } from '../../lib/api';
import ThemeToggle from '../../components/ThemeToggle';
import { BACKEND_URL } from '@/lib/backend';


type Plan = 'free' | 'starter' | 'pro' | 'agency' | 'admin';

interface UserRecord {
  id: string;
  email: string;
  plan: Plan;
  emailLimit: number;
  dailyLimit: number;
  templateLimit: number;
  teamLimit: number;
  attachments: boolean;
  activatedAt: string;
  expiresAt: string;
  notes: string;
  password?: string;
  hash?: string;
  owner?: string;
  isMember?: boolean;
  date_joined?: string;
}

const PLAN_CONFIG: Record<Plan, { label: string; color: string; emailLimit: number; dailyLimit: number; templateLimit: number; teamLimit: number; attachments: boolean; icon: React.ReactNode }> = {
  free:    { label: 'Free',    color: 'text-slate-400 bg-slate-500/10 border-slate-500/20', emailLimit: 50,  dailyLimit: 50,   templateLimit: 1,  teamLimit: 0,  attachments: false, icon: <Zap size={12} /> },
  starter: { label: 'Starter', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', emailLimit: 500, dailyLimit: 2000, templateLimit: 5,  teamLimit: 0,  attachments: true,  icon: <Rocket size={12} /> },
  pro:     { label: 'Pro',     color: 'text-violet-400 bg-violet-500/10 border-violet-500/20', emailLimit: -1,  dailyLimit: -1,   templateLimit: -1, teamLimit: 0,  attachments: true,  icon: <Crown size={12} /> },
  agency:  { label: 'Agency',  color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',   emailLimit: -1,  dailyLimit: -1,   templateLimit: -1, teamLimit: 5,  attachments: true,  icon: <Building2 size={12} /> },
  admin:   { label: 'Administrator', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', emailLimit: -1,  dailyLimit: -1,   templateLimit: -1, teamLimit: -1, attachments: true,  icon: <Shield size={12} /> },
};

function nextMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const router = useRouter();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [expandedAgencies, setExpandedAgencies] = useState<Set<string>>(new Set());
  const [newUser, setNewUser] = useState({ email: '', password: '', plan: 'free' as Plan, notes: '', expiresAt: '2099-12-31', isMember: false, owner: '' });
  const [activeTab, setActiveTab] = useState<'users' | 'payments' | 'support' | 'settings'>('users');
  const [payments, setPayments] = useState<any[]>([]);
  const [systemConfig, setSystemConfig] = useState({ host: 'smtp.gmail.com', port: '465', user: '', pass: '', senderName: 'OutreachPro Security' });
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedProof, setSelectedProof] = useState<string | null>(null);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpStatus, setSmtpStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [smtpError, setSmtpError] = useState('');
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  useEffect(() => {
    const ok = sessionStorage.getItem('admin_authed');
    
    if (ok === 'yes') { 
      setAuthed(true); 
      
      const fetchAll = async () => {
        try {
          const [usersData, paymentsData, ticketsData] = await Promise.all([
            apiFetch('/users/'),
            apiFetch('/payments/'),
            apiFetch('/tickets/')
          ]);
          setUsers(usersData);
          setPayments(paymentsData);
          setTickets(ticketsData);
        } catch (err) {
          showToast('Failed to load data from backend', 'error');
        }

        // Load SMTP config: prefer localStorage, fall back to Django backend
        const savedSys = localStorage.getItem('outreachpro_system_config');
        if (savedSys) {
          setSystemConfig(JSON.parse(savedSys));
        } else {
          try {
            const cfgData = await apiFetch('/config/');
            if (cfgData && cfgData.length > 0) {
              const cfg = cfgData[cfgData.length - 1];
              const mapped = { host: cfg.host, port: cfg.port, user: cfg.smtp_user, pass: cfg.smtp_pass, senderName: cfg.senderName };
              setSystemConfig(mapped);
              localStorage.setItem('outreachpro_system_config', JSON.stringify(mapped));
            }
          } catch (_) {}
        }
      };
      fetchAll();

      // Auto-refresh payments and tickets every 10 seconds to avoid manual reloads
      const pollInterval = setInterval(async () => {
        try {
          const [paymentsData, ticketsData] = await Promise.all([
            apiFetch('/payments/'),
            apiFetch('/tickets/')
          ]);
          setPayments(paymentsData);
          setTickets(ticketsData);
        } catch (err) {
          // ignore background polling errors
        }
      }, 10000);

      return () => clearInterval(pollInterval);
    } else {
      router.push('/auth');
    }
  }, [router]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const logout = () => {
    sessionStorage.removeItem('admin_authed');
    sessionStorage.removeItem('outreachpro_session');
    router.push('/auth');
  };

  const addUser = async () => {
    if (!newUser.email.includes('@')) { showToast('Enter a valid email', 'error'); return; }
    if (users.find(u => u.email.toLowerCase() === newUser.email.toLowerCase())) {
      showToast('User already exists', 'error'); return;
    }
    const cfg = PLAN_CONFIG[newUser.plan];
    const newHash = generateIntegrityHash(newUser.email.toLowerCase().trim(), newUser.plan, cfg.emailLimit);
    
    try {
      const createdUser = await apiFetch('/users/', {
        method: 'POST',
        body: JSON.stringify({
          email: newUser.email.toLowerCase().trim(),
          username: newUser.email.split('@')[0] + Date.now().toString().slice(-4),
          password: newUser.password || 'outreach123',
          plan: newUser.plan,
          emailLimit: cfg.emailLimit,
          dailyLimit: cfg.dailyLimit,
          templateLimit: cfg.templateLimit,
          teamLimit: cfg.teamLimit,
          attachments: cfg.attachments,
          expiresAt: newUser.expiresAt,
          isMember: newUser.isMember,
          owner: newUser.owner || null,
          hash: newHash
        })
      });

      setUsers([...users, createdUser]);
      setShowAddModal(false);
      setNewUser({ email: '', password: '', plan: 'free', notes: '', expiresAt: '2099-12-31', isMember: false, owner: '' });
      showToast(`✅ ${createdUser.email} added as ${createdUser.plan}`);
    } catch (err) {
      showToast('Failed to create user in database', 'error');
    }
  };

  const updateUser = async () => {
    if (!editUser) return;
    const cfg = PLAN_CONFIG[editUser.plan];
    const newHash = generateIntegrityHash(editUser.email.toLowerCase().trim(), editUser.plan, cfg.emailLimit);
    
    try {
      const updatedUser = await apiFetch(`/users/${editUser.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          plan: editUser.plan,
          emailLimit: cfg.emailLimit,
          dailyLimit: cfg.dailyLimit,
          templateLimit: cfg.templateLimit,
          teamLimit: cfg.teamLimit,
          attachments: cfg.attachments,
          isMember: editUser.isMember,
          owner: editUser.owner || null,
          hash: newHash
        })
      });

      const updated = users.map(u => u.id === editUser.id ? updatedUser : u);
      setUsers(updated);
      setEditUser(null);
      showToast('User updated');
    } catch (err) {
      showToast('Failed to update user', 'error');
    }
  };

  const deleteUser = async (id: string) => {
    try {
      await apiFetch(`/users/${id}/`, { method: 'DELETE' });
      setUsers(users.filter(u => u.id !== id));
      showToast('User deleted successfully', 'success');
    } catch (err) {
      showToast('Failed to delete user', 'error');
    }
  };

  const approvePayment = async (id: number) => {
    const payment = payments.find(p => p.id === id);
    if (!payment) return;

    try {
      // 1. Update payment status in Django
      await apiFetch(`/payments/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'accepted' })
      });
      setPayments(payments.map(p => p.id === id ? { ...p, status: 'accepted' } : p));

      // 2. Upgrade user plan in Django
      const cfg = PLAN_CONFIG[payment.plan as Plan];
      const existingUser = users.find(u => u.email.toLowerCase() === payment.email?.toLowerCase());
      const newHash = generateIntegrityHash((payment.email || '').toLowerCase().trim(), payment.plan, cfg.emailLimit);

      if (existingUser) {
        const updated = await apiFetch(`/users/${existingUser.id}/`, {
          method: 'PATCH',
          body: JSON.stringify({
            plan: payment.plan,
            emailLimit: cfg.emailLimit,
            dailyLimit: cfg.dailyLimit,
            templateLimit: cfg.templateLimit,
            teamLimit: cfg.teamLimit,
            attachments: cfg.attachments,
            expiresAt: nextMonth(),
            hash: newHash
          })
        });
        setUsers(users.map(u => u.id === existingUser.id ? updated : u));
      } else {
        // Create new user in Django
        const newUser = await apiFetch('/users/', {
          method: 'POST',
          body: JSON.stringify({
            email: (payment.email || '').toLowerCase().trim(),
            username: (payment.email || '').split('@')[0] + Date.now().toString().slice(-4),
            password: 'outreach123',
            plan: payment.plan,
            emailLimit: cfg.emailLimit,
            dailyLimit: cfg.dailyLimit,
            templateLimit: cfg.templateLimit,
            teamLimit: cfg.teamLimit,
            attachments: cfg.attachments,
            expiresAt: nextMonth(),
            hash: newHash
          })
        });
        setUsers([...users, newUser]);
      }

      showToast(`Payment approved & ${payment.email} upgraded!`);
    } catch (err) {
      showToast('Failed to approve payment', 'error');
    }
  };

  const rejectPayment = async (id: number) => {
    try {
      await apiFetch(`/payments/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected' })
      });
      setPayments(payments.map(p => p.id === id ? { ...p, status: 'rejected' } : p));
      showToast('Payment rejected', 'error');
    } catch (err) {
      showToast('Failed to reject payment', 'error');
    }
  };

  const isSearching = search.trim().length > 0;

  const filtered = users
    .filter(u => isSearching || !u.isMember)
    .filter(u =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.plan.toLowerCase().includes(search.toLowerCase())
    );

  const toggleAgency = (email: string) => {
    const next = new Set(expandedAgencies);
    if (next.has(email)) next.delete(email);
    else next.add(email);
    setExpandedAgencies(next);
  };

  const stats = {
    total: users.filter(u => !u.isMember).length,
    pro: users.filter(u => !u.isMember && (u.plan === 'pro' || u.plan === 'agency')).length,
    starter: users.filter(u => !u.isMember && u.plan === 'starter').length,
    expiring: users.filter(u => {
      const d = new Date(u.expiresAt); const now = new Date();
      const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 7 && diff >= 0;
    }).length,
  };

  /* ── Authorization Gate ── */
  if (!authed) return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center" suppressHydrationWarning>
      <div className="flex flex-col items-center gap-4">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
          <Shield size={32} className="text-indigo-500/50" />
        </motion.div>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Verifying Administrator Session...</p>
      </div>
    </div>
  );

  /* ── Admin Dashboard ── */
  return (
    <div className="min-h-screen bg-bg-base text-slate-200" style={{ fontFamily: "'Inter', sans-serif" }} suppressHydrationWarning>


      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-border-base bg-bg-nav backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Shield size={16} className="text-white" />
            </div>
            <div>
              <span className="font-black text-slate-100 text-sm">Admin Panel</span>
              <span className="text-slate-600 text-xs ml-2">OutreachPro</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all"
            >
              <Plus size={14} /> Add User
            </motion.button>
            <button onClick={logout} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100/5 hover:bg-slate-100/10 text-slate-400 hover:text-slate-100 text-xs font-bold transition-all">
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { label: 'Total Users', value: stats.total, icon: <Users size={18} />, color: 'indigo' },
            { label: 'Pro / Agency', value: stats.pro, icon: <Crown size={18} />, color: 'violet' },
            { label: 'Starter', value: stats.starter, icon: <Rocket size={18} />, color: 'blue' },
            { label: 'Expiring Soon', value: stats.expiring, icon: <AlertCircle size={18} />, color: 'amber' },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              className="p-5 rounded-2xl bg-slate-100/3 border border-slate-100/8">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${
                s.color === 'indigo' ? 'bg-indigo-500/15 text-indigo-400' :
                s.color === 'violet' ? 'bg-violet-500/15 text-violet-400' :
                s.color === 'blue' ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'}`}>
                {s.icon}
              </div>
              <p className="text-2xl font-black text-slate-100">{s.value}</p>
              <p className="text-slate-500 text-xs mt-0.5">{s.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6">
          <button 
            onClick={() => setActiveTab('users')} 
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'users' ? 'bg-indigo-600 text-white' : 'bg-slate-100/5 text-slate-400 hover:bg-slate-100/10 hover:text-slate-100'}`}
          >
            Users
          </button>
          <button 
            onClick={() => setActiveTab('payments')} 
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'payments' ? 'bg-indigo-600 text-white' : 'bg-slate-100/5 text-slate-400 hover:bg-slate-100/10 hover:text-slate-100'}`}
          >
            Pending Payments
            {payments.filter(p => p.status === 'pending').length > 0 && (
              <span className="bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full">{payments.filter(p => p.status === 'pending').length}</span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('support')} 
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'support' ? 'bg-indigo-600 text-white' : 'bg-slate-100/5 text-slate-400 hover:bg-slate-100/10 hover:text-slate-100'}`}
          >
            Support Tickets
            {tickets.filter(t => t.status !== 'resolved').length > 0 && (
              <span className="bg-indigo-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                {tickets.filter(t => t.status !== 'resolved').length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('settings')} 
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'settings' ? 'bg-indigo-600 text-white' : 'bg-slate-100/5 text-slate-400 hover:bg-slate-100/10 hover:text-slate-100'}`}
          >
            Settings
          </button>
        </div>

        {/* Tab Content */}
        <div className="mt-8">
          {activeTab === 'users' && (
            <>
              {/* Search */}
              <div className="relative mb-6">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by email or plan..."
                  className="w-full bg-slate-100/5 border border-slate-100/8 rounded-xl pl-10 pr-4 py-3 text-slate-100 text-sm outline-none focus:border-indigo-500/40 transition-colors"
                />
              </div>

              {/* Users Table */}
              {filtered.length === 0 ? (
                <div className="text-center py-20 text-slate-500">
                  <Users size={40} className="mx-auto mb-4 opacity-30" />
                  <p className="font-bold uppercase tracking-widest text-xs">No users found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((u, i) => {
                    const cfg = PLAN_CONFIG[u.plan];
                    const isExpired = new Date(u.expiresAt) < new Date();
                    const isExpiringSoon = !isExpired && (new Date(u.expiresAt).getTime() - Date.now()) / 86400000 <= 7;
                    const members = users.filter(m => m.owner === u.email);
                    const isExpanded = expandedAgencies.has(u.email);

                    return (
                      <div key={u.id} className="space-y-2">
                        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                          className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl border transition-all group ${
                            isExpanded ? 'bg-indigo-500/5 border-indigo-500/30' : 'bg-slate-100/3 border-slate-100/8 hover:border-indigo-500/20'
                          }`}>
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-sm ${
                              u.plan === 'agency' ? 'bg-amber-500/20 text-amber-400' : 'bg-indigo-500/15 text-indigo-400'
                            }`}>
                              {u.email[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-slate-100 font-bold text-sm truncate">{u.email}</p>
                                {u.plan === 'agency' && members.length > 0 && (
                                  <span className="text-[8px] font-black bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                                    {members.length} Members
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-500 text-[10px] mt-0.5">
                                <span>Joined: {u.date_joined ? new Date(u.date_joined).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Recently'}</span>
                                {' · '}Expires:{' '}
                                {u.expiresAt?.startsWith('2099') ? (
                                  <span className="text-emerald-400 font-black">Lifetime Access ∞</span>
                                ) : (
                                  <span className={isExpired ? 'text-red-400' : isExpiringSoon ? 'text-amber-400' : 'text-slate-500'}>{u.expiresAt}</span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {u.plan === 'agency' && (
                              <button 
                                onClick={() => toggleAgency(u.email)}
                                className={`flex items-center gap-2 px-3 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                                  isExpanded ? 'bg-indigo-500-white border-indigo-500' : 'bg-slate-100/5 text-slate-400 border-slate-100/10 hover:bg-slate-100/10'
                                }`}
                              >
                                <Users size={12} /> {isExpanded ? 'Hide Team' : 'View Team'}
                              </button>
                            )}
                            <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${cfg.color}`}>
                              {cfg.icon} {cfg.label}
                            </span>
                            <div className="flex items-center gap-1.5 pl-3 border-l border-border-base">
                              <button onClick={() => setEditUser(u)} className="w-9 h-9 rounded-xl bg-bg-card hover:bg-bg-hover text-slate-400 hover:text-slate-100 flex items-center justify-center transition-all">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={() => deleteUser(u.id)} className="w-9 h-9 rounded-xl bg-bg-card hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center transition-all">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                        {/* Nested Members List */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }} 
                              animate={{ opacity: 1, height: 'auto' }} 
                              exit={{ opacity: 0, height: 0 }}
                              className="ml-12 space-y-2 overflow-hidden"
                            >
                              {members.map((m, mi) => (
                                <div key={m.id} className="flex items-center justify-between p-3 pl-4 rounded-xl bg-bg-hover border border-border-base">
                                  <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                                      <Zap size={10} />
                                    </div>
                                    <div>
                                      <p className="text-slate-200 font-bold text-xs">{m.email}</p>
                                      <p className="text-[8px] text-slate-500 uppercase font-black tracking-widest mt-0.5">Agency Member · Shared Resources</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => setEditUser(m)} className="p-2 text-slate-500 hover:text-slate-100 transition-colors"><Edit2 size={12} /></button>
                                    <button onClick={() => deleteUser(m.id)} className="p-2 text-slate-500 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                                  </div>
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === 'payments' && (
            <div className="space-y-4">
              {payments.length === 0 ? (
                <div className="text-center py-20 text-slate-500 border-2 border-dashed border-border-base rounded-3xl">
                  <p className="font-bold uppercase tracking-widest text-xs">No payments submitted yet.</p>
                </div>
              ) : (
                payments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((p, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-bg-card border border-border-base hover:border-indigo-500/20 transition-all">
                    <div className="flex flex-col min-w-0">
                      <p className="text-slate-100 font-bold text-sm truncate">{p.email} <span className="text-slate-400 font-normal ml-2">requested</span> <span className="text-indigo-400">{(p.plan || '').toUpperCase()}</span></p>
                      <p className="text-slate-500 text-xs mt-1">Tx ID: <span className="text-slate-100 font-mono bg-bg-hover px-2 py-0.5 rounded">{p.amount || '—'}</span></p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {p.proof && (
                        <button onClick={() => setSelectedProof(p.proof)} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs font-bold transition-all border border-indigo-500/20">
                          <ImageIcon size={14} /> View Proof
                        </button>
                      )}
                      {p.status === 'pending' ? (
                        <>
                          <button onClick={() => approvePayment(p.id)} className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-bold text-xs transition-all border border-emerald-500/20">Approve</button>
                          <button onClick={() => rejectPayment(p.id)} className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-xs transition-all border border-red-500/20">Reject</button>
                        </>
                      ) : (
                        <span className={`px-3 py-1 rounded-xl text-xs font-bold border ${p.status === 'accepted' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                          {p.status.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}



          {activeTab === 'settings' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="bg-bg-card border border-border-base rounded-3xl p-8">
                <h2 className="text-xl font-black text-slate-100 mb-2">Global SMTP Configuration</h2>
                <p className="text-slate-400 text-sm mb-2">This SMTP account will be used to send all system emails, including OTPs and Password Recovery codes.</p>
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-indigo-500/8 border border-indigo-500/20 mb-8">
                  <AlertCircle size={14} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                  <p className="text-indigo-300/80 text-xs leading-relaxed">
                    <strong>Gmail users:</strong> Use an <strong>App Password</strong> (not your account password). Enable 2FA on your Google account, then go to Google Account → Security → App Passwords to generate one.
                    <br />
                    <strong>Custom / cPanel / Hosting mail:</strong> Use your regular email account password.
                  </p>
                </div>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">SMTP Host</label>
                    <input type="text" value={systemConfig.host} onChange={e => { setSystemConfig({...systemConfig, host: e.target.value}); setSmtpStatus('idle'); }} className="modal-input" placeholder="smtp.gmail.com" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Port</label>
                    <input type="text" value={systemConfig.port} onChange={e => { setSystemConfig({...systemConfig, port: e.target.value}); setSmtpStatus('idle'); }} className="modal-input" placeholder="465" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">System Email</label>
                    <input type="email" value={systemConfig.user} onChange={e => { setSystemConfig({...systemConfig, user: e.target.value}); setSmtpStatus('idle'); }} className="modal-input" placeholder="system@yourdomain.com" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                      Password
                      {systemConfig.host.toLowerCase().includes('gmail') ? (
                        <span className="ml-2 normal-case text-amber-400 font-semibold">(Gmail: use App Password)</span>
                      ) : (
                        <span className="ml-2 normal-case text-emerald-400/70 font-semibold">(use your email account password)</span>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        type={showSmtpPass ? 'text' : 'password'}
                        value={systemConfig.pass}
                        onChange={e => { setSystemConfig({...systemConfig, pass: e.target.value}); setSmtpStatus('idle'); }}
                        className="modal-input pr-10"
                        placeholder={systemConfig.host.toLowerCase().includes('gmail') ? 'Google App Password (16 chars)' : 'Email account password'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSmtpPass(!showSmtpPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                        tabIndex={-1}
                      >
                        {showSmtpPass ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Sender Name</label>
                    <input type="text" value={systemConfig.senderName} onChange={e => { setSystemConfig({...systemConfig, senderName: e.target.value}); setSmtpStatus('idle'); }} className="modal-input" placeholder="OutreachPro Security" />
                  </div>
                </div>

                {/* SMTP Connection Status Banner */}
                {smtpStatus === 'ok' && (
                  <div className="mt-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-bold">
                    <CheckCircle2 size={16} /> SMTP connection verified — settings are ready to save.
                  </div>
                )}
                {smtpStatus === 'error' && (
                  <div className="mt-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30">
                    <div className="flex items-center gap-3 text-red-400 text-sm font-bold mb-1">
                      <AlertCircle size={16} /> SMTP Connection Failed
                    </div>
                    <p className="text-red-400/80 text-xs font-medium">{smtpError}</p>
                    <p className="text-slate-500 text-[10px] mt-2">
                      {systemConfig.host.toLowerCase().includes('gmail') ? (
                        "Check your App Password, port, and that 2FA + App Passwords are enabled on Google."
                      ) : systemConfig.host.toLowerCase().includes('hostinger') ? (
                        "For Hostinger: 1. Confirm your password is correct (try logging into mail.hostinger.com webmail). 2. Check if your mail account is suspended in Hostinger hPanel (Emails -> Manage). 3. Ensure 'Suspend sending' is disabled."
                      ) : (
                        "Check your port, verify the password (or App Password if using 2FA/OAuth), and make sure SMTP access is enabled on your email provider."
                      )}
                    </p>
                  </div>
                )}

                <div className="mt-8 pt-8 border-t border-border-base flex items-center justify-between gap-4">
                  <button
                    onClick={async () => {
                      const { host, port, user, pass, senderName } = systemConfig;
                      if (!host || !port || !user || !pass || !senderName) {
                        setSmtpStatus('error');
                        setSmtpError('Please fill in all fields before testing.');
                        return;
                      }
                      setSmtpTesting(true);
                      setSmtpStatus('idle');
                      try {
                        const res = await fetch('/api/send-email', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ config: systemConfig, to: user, subject: 'SMTP Test', body: 'test', testOnly: true })
                        });
                        const data = await res.json();
                        if (res.ok) {
                          setSmtpStatus('ok');
                          setSmtpError('');
                        } else {
                          setSmtpStatus('error');
                          setSmtpError(data.message || 'Unknown SMTP error');
                        }
                      } catch (e) {
                        setSmtpStatus('error');
                        setSmtpError('Network error — could not reach the email server.');
                      }
                      setSmtpTesting(false);
                    }}
                    disabled={smtpTesting}
                    className="px-6 py-3 rounded-xl bg-slate-100/5 hover:bg-slate-100/10 border border-slate-100/10 text-slate-300 hover:text-white font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {smtpTesting ? <><RefreshCw size={14} className="animate-spin" /> Testing...</> : <><Shield size={14} /> Test Connection</>}
                  </button>

                  <button
                    onClick={async () => {
                      const { host, port, user, pass, senderName } = systemConfig;
                      if (!host || !port || !user || !pass || !senderName) {
                        setSmtpStatus('error');
                        setSmtpError('Please fill in all fields before saving.');
                        return;
                      }
                      const portNum = Number(port);
                      if (isNaN(portNum) || portNum <= 0 || portNum > 65535) {
                        setSmtpStatus('error');
                        setSmtpError('Invalid port number (use 465 or 587).');
                        return;
                      }
                      if (!user.includes('@') || !user.includes('.')) {
                        setSmtpStatus('error');
                        setSmtpError('Invalid email address.');
                        return;
                      }
                      // Auto-test before saving
                      setSmtpTesting(true);
                      let testPassed = false;
                      try {
                        const res = await fetch('/api/send-email', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ config: systemConfig, to: user, subject: 'SMTP Test', body: 'test', testOnly: true })
                        });
                        const data = await res.json();
                        if (res.ok) {
                          testPassed = true;
                          setSmtpStatus('ok');
                          setSmtpError('');
                        } else {
                          setSmtpStatus('error');
                          setSmtpError(data.message || 'SMTP verification failed.');
                        }
                      } catch (e) {
                        setSmtpStatus('error');
                        setSmtpError('Network error during SMTP verification.');
                      }

                      setSmtpTesting(false);
                      
                      // Save to localStorage for fast access
                      localStorage.setItem('outreachpro_system_config', JSON.stringify(systemConfig));
                      // Also persist to Django backend so all browsers/sessions can read it
                      try {
                        const existingList = await apiFetch('/config/');
                        const payload = { host: systemConfig.host, port: systemConfig.port, smtp_user: systemConfig.user, smtp_pass: systemConfig.pass, senderName: systemConfig.senderName };
                        if (existingList && existingList.length > 0) {
                          // Update the last config record
                          await apiFetch(`/config/${existingList[existingList.length - 1].id}/`, {
                            method: 'PUT',
                            body: JSON.stringify(payload)
                          });
                        } else {
                          // Create a new config record
                          await apiFetch('/config/', {
                            method: 'POST',
                            body: JSON.stringify(payload)
                          });
                        }
                      } catch (_) {}

                      if (testPassed) {
                        showToast('✅ SMTP verified & configuration saved!', 'success');
                      } else {
                        showToast('⚠️ Settings saved, but SMTP connection failed. Check credentials.', 'error');
                      }
                    }}
                    disabled={smtpTesting}
                    className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {smtpTesting ? <><RefreshCw size={14} className="animate-spin" /> Verifying...</> : 'Save Global Settings'}
                  </button>
                </div>
              </div>

              {/* Dedicated Admin Management */}
              <div className="mt-8 bg-bg-card border border-border-base rounded-3xl p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-black text-slate-100">Platform Administrators</h2>
                    <p className="text-slate-400 text-sm mt-1">Manage staff accounts with full system access.</p>
                  </div>
                  <button 
                    onClick={() => {
                      setNewUser({...newUser, plan: 'admin', expiresAt: '2099-12-31'});
                      setShowAddModal(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs transition-all border border-rose-500/20"
                  >
                    <Plus size={14} /> Provision New Admin
                  </button>
                </div>

                <div className="space-y-3">
                  {users.filter(u => u.plan === 'admin').map((admin, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-bg-card border border-border-base hover:border-rose-500/10 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center text-rose-400">
                          <Shield size={18} />
                        </div>
                        <div>
                          <p className="text-slate-100 font-bold text-sm">{admin.email}</p>
                          <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mt-0.5">Staff Member · Full Access</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => deleteUser(admin.id)}
                        className="w-9 h-9 rounded-xl bg-slate-100/5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 flex items-center justify-center transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {users.filter(u => u.plan === 'admin').length === 0 && (
                    <div className="text-center py-12 text-slate-600 border border-dashed border-slate-100/5 rounded-2xl text-[10px] font-bold uppercase tracking-widest">
                      No additional staff accounts provisioned
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'support' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-xl font-bold text-slate-100 uppercase tracking-tighter">Direct Support Hub</h2>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Queries for: ceo@a-s-solution.online</p>
                </div>
                <span className="badge-saas bg-indigo-500/10 text-indigo-400 border-indigo-500/20 px-3 py-1 rounded-full text-xs font-bold">
                  {tickets.filter(t => t.status !== 'resolved').length} Pending Queries
                </span>
              </div>
              
              <div className="grid gap-4">
                {tickets.length > 0 ? (
                  [...tickets]
                    .sort((a, b) => {
                      const aPending = a.status !== 'resolved';
                      const bPending = b.status !== 'resolved';
                      if (aPending && !bPending) return -1;
                      if (!aPending && bPending) return 1;
                      return new Date(b.date).getTime() - new Date(a.date).getTime();
                    })
                    .map((ticket, i) => {
                      const isPending = ticket.status !== 'resolved';
                      return (
                        <div key={ticket.id || i} className="card-saas border-slate-100/5 p-6 hover:border-indigo-500/20 transition-all bg-slate-100/3 rounded-2xl border border-slate-100/8">
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-slate-100/5 flex items-center justify-center text-indigo-400">
                                <AlertCircle size={20} />
                              </div>
                              <div>
                                <h3 className="text-slate-100 font-bold">{ticket.name || 'Anonymous'}</h3>
                                <p className="text-xs text-slate-500">{ticket.email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest border ${
                                isPending ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                              }`}>
                                {isPending ? 'pending' : 'resolved'}
                              </span>
                              {isPending && (
                                <button 
                                  onClick={async () => {
                                    try {
                                      await apiFetch(`/tickets/${ticket.id}/`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) });
                                      setTickets(tickets.map(t => t.id === ticket.id ? { ...t, status: 'resolved' } : t));
                                      showToast('Ticket marked resolved', 'success');
                                    } catch (e) {
                                      showToast('Failed to resolve ticket', 'error');
                                    }
                                  }}
                                  className="px-3 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-[10px] font-bold transition-all border border-emerald-500/20"
                                >
                                  Resolve
                                </button>
                              )}
                              <button 
                                onClick={async () => {
                                  try {
                                    await apiFetch(`/tickets/${ticket.id}/`, { method: 'DELETE' });
                                    setTickets(tickets.filter(t => t.id !== ticket.id));
                                    showToast('Ticket deleted', 'success');
                                  } catch (e) {
                                    showToast('Failed to delete ticket', 'error');
                                  }
                                }}
                                className="p-2 text-slate-600 hover:text-red-400 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                          <div className="bg-black/20 rounded-xl p-4 border border-slate-100/5">
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">{ticket.subject}</p>
                            <p className="text-sm text-slate-300 leading-relaxed">{ticket.message}</p>
                          </div>
                          <p className="mt-4 text-[9px] text-slate-600 font-bold uppercase tracking-widest text-right">
                            Received: {new Date(ticket.date).toLocaleString()}
                          </p>
                        </div>
                      );
                    })
                ) : (
                  <div className="text-center py-20 border-2 border-dashed border-slate-100/5 rounded-3xl">
                    <AlertCircle size={40} className="text-slate-700 mx-auto mb-4" />
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No active support queries</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      <AnimatePresence>
        {showAddModal && (
          <Modal onClose={() => setShowAddModal(false)} title="Add / Upgrade User">
            <div className="space-y-4">
              <Field label="User Email">
                <input type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="user@example.com" className="modal-input" />
              </Field>
              <Field label="Initial Password">
                <input type="text" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="e.g. welcome2026" className="modal-input" />
              </Field>
              <Field label="Plan">
                <PlanSelect value={newUser.plan} onChange={v => {
                  const p = v as Plan;
                  const isLifetime = p === 'admin' || p === 'free';
                  setNewUser({ ...newUser, plan: p, expiresAt: isLifetime ? '2099-12-31' : nextMonth() });
                }} />
              </Field>
              <Field label="Expires On">
                <input type="date" value={newUser.expiresAt} onChange={e => setNewUser({ ...newUser, expiresAt: e.target.value })}
                  className="modal-input" />
              </Field>
              <Field label="Notes (optional)">
                <input type="text" value={newUser.notes} onChange={e => setNewUser({ ...newUser, notes: e.target.value })}
                  placeholder="e.g. Paid via EasyPaisa $19" className="modal-input" />
              </Field>
              <div className="flex items-center gap-2 py-2">
                <input type="checkbox" checked={newUser.isMember} onChange={e => setNewUser({...newUser, isMember: e.target.checked})} className="w-4 h-4 rounded border-slate-100/10 bg-slate-100/5" />
                <label className="text-xs text-slate-400 font-bold">Is Team Member?</label>
              </div>
              {newUser.isMember && (
                <Field label="Agency Owner (Email)">
                  <input type="text" value={newUser.owner} onChange={e => setNewUser({ ...newUser, owner: e.target.value })}
                    placeholder="agency@example.com" className="modal-input" />
                </Field>
              )}
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={addUser}
                className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 mt-2">
                <Save size={16} /> Save & Grant Access
              </motion.button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Edit User Modal */}
      <AnimatePresence>
        {editUser && (
          <Modal onClose={() => setEditUser(null)} title="Edit User">
            <div className="space-y-4">
              <Field label="Email"><p className="text-indigo-400 font-bold text-sm py-2">{editUser.email}</p></Field>
              <Field label="Plan">
                <PlanSelect value={editUser.plan} onChange={v => setEditUser({ ...editUser, plan: v as Plan })} />
              </Field>
              <Field label="Expires On">
                <input type="date" value={editUser.expiresAt} onChange={e => setEditUser({ ...editUser, expiresAt: e.target.value })}
                  className="modal-input" />
              </Field>
              <Field label="Notes">
                <input type="text" value={editUser.notes} onChange={e => setEditUser({ ...editUser, notes: e.target.value })}
                  className="modal-input" />
              </Field>
              <div className="flex items-center gap-2 py-2">
                <input type="checkbox" checked={editUser.isMember} onChange={e => setEditUser({...editUser, isMember: e.target.checked})} className="w-4 h-4 rounded border-slate-100/10 bg-slate-100/5" />
                <label className="text-xs text-slate-400 font-bold">Is Team Member?</label>
              </div>
              {editUser.isMember && (
                <Field label="Agency Owner (Email)">
                  <input type="text" value={editUser.owner || ''} onChange={e => setEditUser({ ...editUser, owner: e.target.value })}
                    placeholder="agency@example.com" className="modal-input" />
                </Field>
              )}
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={updateUser}
                className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 mt-2">
                <Save size={16} /> Update User
              </motion.button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedProof && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-bg-base/90 backdrop-blur-md" onClick={() => setSelectedProof(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setSelectedProof(null)}
                className="absolute -top-12 right-0 p-2 text-slate-100/50 hover:text-slate-100 transition-colors"
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

      <AnimatePresence>{toast && <Toast msg={toast.msg} type={toast.type} />}</AnimatePresence>

      <style>{`.modal-input { width:100%; background:var(--bg-input); border:1px solid var(--border-base); border-radius:12px; padding:10px 14px; color:var(--text-base); font-size:13px; outline:none; transition:border-color 0.2s; } .modal-input:focus { border-color:rgba(99,102,241,0.5); }`}</style>
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-bg-base/80 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.93, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.93 }}
        className="bg-bg-card border border-slate-100/10 rounded-3xl p-8 max-w-md w-full shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-black text-slate-100">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100/5 hover:bg-slate-100/10 flex items-center justify-center text-slate-400 hover:text-slate-100 transition-all">
            <X size={14} />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function PlanSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const handlePlanChange = (newPlan: string) => {
    onChange(newPlan);
  };

  return (
    <select value={value} onChange={e => handlePlanChange(e.target.value)}
      className="w-full bg-slate-100/5 border border-slate-100/10 rounded-xl px-4 py-2.5 text-slate-100 text-sm outline-none focus:border-indigo-500/50 transition-colors appearance-none cursor-pointer">
      <option value="free" className="bg-bg-base">Basic — $0</option>
      <option value="starter" className="bg-bg-base">Starter — $24/mo</option>
      <option value="pro" className="bg-bg-base">Pro — $54/mo</option>
      <option value="agency" className="bg-bg-base">Agency — $104/mo</option>
      <option value="admin" className="bg-bg-base">Administrator — Full Access</option>
    </select>
  );
}

function Toast({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -20, x: 20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, y: -20, x: 20 }}
      className={`fixed top-6 right-6 z-[300] min-w-[300px] max-w-sm px-5 py-4 rounded-xl shadow-2xl backdrop-blur-xl flex items-center gap-3 border ${
        type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
      }`}
    >
      {type === 'success' ? <CheckCircle2 size={18} className="flex-shrink-0" /> : <AlertCircle size={18} className="flex-shrink-0" />}
      <span className="text-xs font-bold leading-tight">{msg}</span>
    </motion.div>
  );
}
