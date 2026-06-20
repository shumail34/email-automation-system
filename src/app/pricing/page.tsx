"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, Check, X, ArrowRight, Shield, Crown, Rocket, Building2,
  Mail, MessageCircle, Copy, CheckCircle2, Star, Users, LogOut, Image as ImageIcon, Plus
} from 'lucide-react';
import Link from 'next/link';
import Footer from '../../components/Footer';
import { lookupUserPlan, DEFAULT_FREE_PLAN, PLAN_LABELS, PLAN_COLORS, PLAN_LIMITS, type Plan } from '../../lib/plans';
import { apiFetch } from '../../lib/api';
import ThemeToggle from '../../components/ThemeToggle';
import Navbar from '../../components/Navbar';

const plans = [
  {
    id: 'free',
    name: 'Basic',
    price: '$0',
    pkrPrice: '0 PKR',
    period: '/forever',
    badge: null,
    color: 'slate',
    icon: <Zap size={24} />,
    gradient: 'from-slate-500/20 to-slate-600/5',
    border: 'border-slate-100/10',
    buttonClass: 'bg-slate-100/10 hover:bg-slate-100/20 text-slate-100',
    features: [
      { text: '50 emails per campaign', included: true },
      { text: '50 emails per day', included: true },
      { text: '1 email template', included: true },
      { text: 'CSV/XLSX import', included: true },
      { text: 'Connect Email Accounts', included: true },
      { text: 'Lead Gen — 10 leads/month', included: true },
      { text: 'Email enrichment (web crawl)', included: true },
      { text: 'Attachments', included: false },
      { text: 'Multiple templates', included: false },
      { text: 'Priority SMTP queue', included: false },
      { text: 'Analytics dashboard', included: false },
      { text: 'Team members', included: false },
      { text: 'Email support', included: false },
    ],
    cta: 'Start Free',
    href: '/',
    emailLimit: 50,
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '$24',
    pkrPrice: '7,000 PKR',
    period: '/month',
    badge: null,
    color: 'indigo',
    icon: <Rocket size={24} />,
    gradient: 'from-indigo-500/20 to-indigo-600/5',
    border: 'border-indigo-500/30',
    buttonClass: 'bg-indigo-600 hover:bg-indigo-500 text-white',
    features: [
      { text: '500 emails per campaign', included: true },
      { text: '2,000 emails per day', included: true },
      { text: '5 email templates', included: true },
      { text: 'CSV/XLSX import', included: true },
      { text: 'Connect Email Accounts', included: true },
      { text: 'Lead Gen — 200 leads/month', included: true },
      { text: 'Email enrichment (web crawl)', included: true },
      { text: 'Attachments', included: true },
      { text: 'Multiple templates', included: true },
      { text: 'Priority SMTP queue', included: false },
      { text: 'Analytics dashboard', included: true },
      { text: 'Team members', included: false },
      { text: 'Email support', included: true },
    ],
    cta: 'Get Starter',
    emailLimit: 500,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$54',
    pkrPrice: '15,500 PKR',
    period: '/month',
    badge: 'MOST POPULAR',
    color: 'violet',
    icon: <Crown size={24} />,
    gradient: 'from-violet-500/20 to-purple-600/5',
    border: 'border-violet-500/40',
    buttonClass: 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-white shadow-lg shadow-violet-500/25',
    features: [
      { text: 'Unlimited emails', included: true },
      { text: 'Unlimited daily sending', included: true },
      { text: 'Unlimited templates', included: true },
      { text: 'CSV/XLSX import', included: true },
      { text: 'Connect Email Accounts', included: true },
      { text: 'Lead Gen — 1,000 leads/month', included: true },
      { text: 'Email enrichment (web crawl)', included: true },
      { text: 'Attachments', included: true },
      { text: 'Multiple templates', included: true },
      { text: 'Priority SMTP queue', included: true },
      { text: 'Analytics dashboard', included: true },
      { text: 'Team members', included: false },
      { text: 'Priority email support', included: true },
    ],
    cta: 'Get Pro',
    emailLimit: -1,
  },
  {
    id: 'agency',
    name: 'Agency',
    price: '$104',
    pkrPrice: '29,500 PKR',
    period: '/month',
    badge: 'ENTERPRISE',
    color: 'amber',
    icon: <Building2 size={24} />,
    gradient: 'from-amber-500/20 to-orange-600/5',
    border: 'border-amber-500/30',
    buttonClass: 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white shadow-lg shadow-amber-500/25',
    features: [
      { text: 'Unlimited emails', included: true },
      { text: 'Unlimited daily sending', included: true },
      { text: 'Unlimited templates', included: true },
      { text: 'CSV/XLSX import', included: true },
      { text: 'Connect Email Accounts', included: true },
      { text: 'Lead Gen — 3,300 leads/month', included: true },
      { text: 'Email enrichment (web crawl)', included: true },
      { text: 'Attachments', included: true },
      { text: 'Multiple templates', included: true },
      { text: 'Priority SMTP queue', included: true },
      { text: 'Analytics dashboard', included: true },
      { text: '5 team members', included: true },
      { text: 'Priority support', included: true },
    ],
    cta: 'Get Agency',
    emailLimit: -1,
  },
];

const paymentMethods = [
  { icon: '🏦', name: 'Bank Transfer', detail: 'IBAN / Account details provided on request' },
  { icon: '💳', name: 'EasyPaisa', detail: '03392009917 — Muhammad Shumail' },
  { icon: '💚', name: 'JazzCash', detail: '03104672445 — Muhammad Arslan' },
];

export default function PricingPage() {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [paymentTxId, setPaymentTxId] = useState('');
  const [paymentProof, setPaymentProof] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [userPlan, setUserPlan] = useState(DEFAULT_FREE_PLAN);

  useEffect(() => {
    setIsMounted(true);
    
    const syncFromBackend = async () => {
      const user = sessionStorage.getItem('outreachpro_session');
      setSessionUser(user);
      
      if (!user) {
        setUserPlan(DEFAULT_FREE_PLAN);
        return;
      }

      // Show cached plan first
      const cachedPlan = localStorage.getItem('outreachpro_plan_cache');
      if (cachedPlan) {
        try { setUserPlan(JSON.parse(cachedPlan)); } catch {}
      } else {
        setUserPlan(lookupUserPlan(user));
      }
      
      try {
        const users = await apiFetch(`/users/?email=${encodeURIComponent(user)}`);
        if (Array.isArray(users) && users.length > 0) {
          const dbUser = users.find((u: any) => u.email.toLowerCase() === user.toLowerCase());
          if (dbUser && dbUser.plan) {
            const plan = (dbUser.plan || 'free') as Plan;
            const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
            const freshPlan = {
              email: user,
              plan,
              ...limits,
              expiresAt: dbUser.expiresAt || dbUser.expires_at || '',
            };
            setUserPlan(freshPlan);
            localStorage.setItem('outreachpro_plan_cache', JSON.stringify(freshPlan));

            const localUsers = JSON.parse(localStorage.getItem('outreachpro_users') || '[]');
            const idx = localUsers.findIndex((u: any) => u.email.toLowerCase() === user.toLowerCase());
            if (idx >= 0) localUsers[idx] = { ...localUsers[idx], ...dbUser };
            else localUsers.push(dbUser);
            localStorage.setItem('outreachpro_users', JSON.stringify(localUsers));
          }
        }
      } catch (err) {
        console.error("Failed to sync pricing plan:", err);
      }
    };

    syncFromBackend();
    const interval = setInterval(syncFromBackend, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!isMounted) return <div className="min-h-screen bg-[#020617]" />;

  const submitPayment = async () => {
    if (!paymentTxId.trim() || !sessionUser || !selectedPlan) return;
    
    const payload = {
      email: sessionUser,
      plan: selectedPlan,
      amount: paymentTxId, // Using amount field to store the Transaction ID
      proof: paymentProof,
      status: 'pending'
    };

    try {
      await apiFetch('/payments/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setIsSubmitted(true);
    } catch (err) {
      console.error("Failed to submit payment:", err);
      alert("Failed to submit payment. Please ensure you are logged in or try again later.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPaymentProof(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const copyEmail = () => {
    navigator.clipboard.writeText('ceo@a-s-solution.online');
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  return (
    <div className="min-h-screen bg-bg-base text-text-base transition-colors duration-300" style={{ fontFamily: "'Inter', sans-serif" }} suppressHydrationWarning>


      {/* Hero Gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-violet-500/5 blur-[100px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-amber-500/5 blur-[100px] rounded-full" />
      </div>

      <Navbar />


      {/* Header */}
      <header className="pt-20 pb-10 text-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-[0.3em] mb-6"
            animate={{ boxShadow: ['0 0 0px rgba(79,70,229,0)', '0 0 20px rgba(79,70,229,0.3)', '0 0 0px rgba(79,70,229,0)'] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          >
            <Star size={10} /> Simple & Transparent Pricing
          </motion.div>
          <h1 className="text-4xl md:text-6xl font-black text-slate-100 mb-4 tracking-tight leading-tight">
            Choose Your<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">Growth Plan</span>
          </h1>
          <p className="text-slate-400 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            Pay once, get upgraded manually. No hidden fees, no auto-renewals. Just pure email automation power.
          </p>
        </motion.div>
      </header>

      {/* Pricing Cards */}
      <section className="py-10 px-4 md:px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {plans.map((plan, i) => {
            const isActive = sessionUser && userPlan.plan === plan.id;
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={`relative flex flex-col rounded-3xl border ${
                  isActive
                    ? 'border-emerald-500/50 ring-2 ring-emerald-500/30 shadow-2xl shadow-emerald-500/10'
                    : plan.id === 'pro'
                      ? 'border-violet-500/40 ring-2 ring-violet-500/30 shadow-2xl shadow-violet-500/10'
                      : plan.border
                } bg-gradient-to-b ${plan.gradient} p-7 backdrop-blur-sm`}
              >
                {/* Active Plan Badge */}
                {isActive && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.3em] bg-emerald-500 text-black shadow-lg shadow-emerald-500/30 flex items-center gap-1">
                    <Check size={10} className="stroke-[3]" /> Active
                  </div>
                )}

                {/* Badge */}
                {plan.badge && !isActive && (
                  <div className={`absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.3em] flex items-center justify-center whitespace-nowrap shadow-lg ${
                    plan.id === 'starter' ? 'bg-indigo-600 text-white shadow-indigo-600/30' :
                    plan.id === 'pro' ? 'bg-violet-600 text-white shadow-violet-600/30' :
                    plan.id === 'agency' ? 'bg-amber-500 text-black shadow-amber-500/30' :
                    'bg-slate-600 text-white'
                  }`}>
                    {plan.badge}
                  </div>
                )}

                {/* Plan Header */}
                <div className="mb-7 flex flex-col items-center text-center">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 ${
                    plan.id === 'free' ? 'bg-slate-500/20 text-slate-400' :
                    plan.id === 'starter' ? 'bg-indigo-500/20 text-indigo-400' :
                    plan.id === 'pro' ? 'bg-violet-500/20 text-violet-400' :
                    'bg-amber-500/20 text-amber-400'
                  }`}>
                    {plan.icon}
                  </div>
                  <h2 className="text-xl font-black text-slate-100 mb-1">{plan.name}</h2>
                  <div className="flex flex-col items-center justify-center">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black text-slate-100">{plan.price}</span>
                      <span className="text-slate-500 text-sm font-medium">{plan.period}</span>
                    </div>
                    {plan.id !== 'free' && (
                      <span className="text-indigo-400/80 text-xs font-bold mt-1">~ {plan.pkrPrice} {plan.period}</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 uppercase tracking-widest font-bold">
                    {plan.emailLimit === -1 ? '∞ Unlimited emails' : `${plan.emailLimit} emails / campaign`}
                  </p>
                </div>

                {/* Features */}
                <ul className="space-y-3 flex-1 mb-8 w-full">
                  {plan.features.map((f, fi) => (
                    <li key={fi} className="flex items-center justify-center gap-3">
                      <div className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${f.included ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-100/5 text-slate-600'}`}>
                        {f.included ? <Check size={10} /> : <X size={10} />}
                      </div>
                      <span className={`text-xs font-medium ${f.included ? 'text-slate-300' : 'text-slate-600'}`}>{f.text}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isActive ? (
                  <motion.button
                    disabled
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="w-full py-3.5 rounded-2xl font-bold text-sm bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 cursor-default flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={14} className="stroke-[3]" /> Active Plan
                  </motion.button>
                ) : !sessionUser ? (
                  <Link href="/auth">
                    <motion.button
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all ${plan.buttonClass}`}
                    >
                      {plan.cta} <ArrowRight size={14} className="inline ml-1" />
                    </motion.button>
                  </Link>
                ) : plan.id === 'free' ? (
                  <Link href="/">
                    <motion.button
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all ${plan.buttonClass}`}
                    >
                      {plan.cta} <ArrowRight size={14} className="inline ml-1" />
                    </motion.button>
                  </Link>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all ${plan.buttonClass}`}
                  >
                    {plan.cta} <ArrowRight size={14} className="inline ml-1" />
                  </motion.button>
                )}
              </motion.div>
            );
          })}
        </div>
      </section>
      {/* Lead Gen Feature Highlight */}
      <section className="py-16 px-6 border-t border-slate-100/5">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-3xl bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent border border-indigo-500/20 p-10 md:p-14 relative overflow-hidden"
          >
            {/* Background glow */}
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-violet-500/10 blur-[80px] rounded-full pointer-events-none" />

            <div className="relative z-10">
              <div className="flex flex-col md:flex-row items-start gap-10">
                <div className="flex-1">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-[0.3em] mb-5">
                    <Zap size={10} /> New Feature
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black text-slate-100 mb-4 tracking-tight leading-tight">
                    AI-Powered<br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">Lead Generation</span>
                  </h2>
                  <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-md">
                    Stop importing CSVs manually. OutreachPro now discovers real local businesses, enriches them with contact data by crawling their websites, and pushes them straight into your campaign — all automatically.
                  </p>
                  <ul className="space-y-3">
                    {[
                      { icon: '🔍', text: 'Search businesses by category & location' },
                      { icon: '🌐', text: 'Auto-crawl websites to extract real emails' },
                      { icon: '⭐', text: 'Smart lead scoring for prioritization' },
                      { icon: '⚡', text: '1-click push directly into Launch Engine' },
                      { icon: '📊', text: 'Export to CSV or Excel at any time' },
                    ].map((item, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm text-slate-300">
                        <span className="text-base">{item.icon}</span> {item.text}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Plan tiers */}
                <div className="flex-shrink-0 w-full md:w-64 space-y-3">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] mb-4">Lead Gen Limits by Plan</p>
                  {[
                    { plan: 'Basic', limit: '10 leads/month', color: 'bg-slate-500/20 text-slate-400 border-slate-500/20' },
                    { plan: 'Starter', limit: '200 leads/month', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20' },
                    { plan: 'Pro', limit: '1,000 leads/month', color: 'bg-violet-500/20 text-violet-400 border-violet-500/20' },
                    { plan: 'Agency', limit: '3,300 leads/month', color: 'bg-amber-500/20 text-amber-400 border-amber-500/20' },
                  ].map((tier, i) => (
                    <div key={i} className={`flex items-center justify-between px-4 py-3 rounded-2xl border ${tier.color}`}>
                      <span className="text-xs font-black">{tier.plan}</span>
                      <span className="text-xs font-bold opacity-80">{tier.limit}</span>
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-600 text-center pt-2">
                    Email enrichment included on all plans
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-[0.3em] mb-4">
              <Shield size={10} /> How It Works
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-slate-100 mb-3">Get Access in 4 Simple Steps</h2>
            <p className="text-slate-400">No credit card required. Pay manually, upload proof, and get started.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: '01',
                title: 'Choose Your Plan',
                desc: 'Pick the plan that fits your outreach needs above and click get started.',
                icon: <Star size={20} />,
                color: 'indigo',
              },
              {
                step: '02',
                title: 'Send Payment',
                desc: 'Transfer the amount via EasyPaisa, JazzCash, or Bank Transfer.',
                icon: <Zap size={20} />,
                color: 'violet',
              },
              {
                step: '03',
                title: 'Submit Proof',
                desc: 'Enter your Transaction ID and upload a screenshot proof in the dashboard.',
                icon: <ImageIcon size={20} />,
                color: 'indigo',
              },
              {
                step: '04',
                title: 'Start Sending',
                desc: "We'll activate your plan within 24hrs once your payment is verified.",
                icon: <Rocket size={20} />,
                color: 'emerald',
              },
            ].map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative p-7 rounded-3xl bg-slate-100/3 border border-slate-100/8 hover:border-indigo-500/20 transition-all group"
              >
                <div className="text-5xl font-black text-slate-100/5 absolute top-5 right-6 group-hover:text-indigo-500/10 transition-colors">{step.step}</div>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 ${
                  step.color === 'indigo' ? 'bg-indigo-500/15 text-indigo-400' :
                  step.color === 'violet' ? 'bg-violet-500/15 text-violet-400' :
                  'bg-emerald-500/15 text-emerald-400'
                }`}>
                  {step.icon}
                </div>
                <h3 className="text-slate-100 font-bold text-base mb-2">{step.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Payment Methods */}
      <section className="py-16 px-6 border-t border-slate-100/5">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="text-2xl md:text-3xl font-black text-slate-100 mb-3">Accepted Payment Methods</h2>
            <p className="text-slate-400 text-sm">Select a plan above to submit your payment proof directly on the platform</p>
          </motion.div>

          <div className="flex flex-wrap justify-center gap-4 mb-10">
            {paymentMethods.map((pm, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="p-5 rounded-2xl bg-slate-100/3 border border-slate-100/8 hover:border-indigo-500/20 transition-all text-center w-full sm:w-[calc(50%-1rem)] md:w-[calc(33.33%-1rem)] lg:w-[calc(25%-1rem)] min-w-[200px]"
              >
                <div className="text-3xl mb-3">{pm.icon}</div>
                <h4 className="text-slate-100 font-bold text-sm mb-1">{pm.name}</h4>
                <p className="text-slate-500 text-[10px] leading-relaxed">{pm.detail}</p>
              </motion.div>
            ))}
          </div>

          {/* Submission Hint */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-3xl bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border border-indigo-500/20 p-10 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center mx-auto mb-6 border border-indigo-500/30">
              <Zap size={32} className="text-indigo-400" />
            </div>
            <h3 className="text-slate-100 font-black text-xl mb-3 tracking-tight">Ready to Upgrade?</h3>
            <p className="text-slate-400 text-sm mb-8 max-w-lg mx-auto leading-relaxed">
              Simply click <strong>"Get Started"</strong> on your preferred plan above. You'll be able to see payment details and upload your transaction proof instantly.
            </p>
            <div className="flex justify-center">
              <button 
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="flex items-center gap-2 px-8 py-4 rounded-xl bg-indigo-600-white font-bold text-sm transition-all shadow-xl shadow-indigo-500/20"
              >
                Choose Your Plan Now
                <ArrowRight size={18} />
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-6 border-t border-slate-100/5">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-black text-slate-100 text-center mb-10">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {[
              { q: 'How fast will I get access after payment?', a: 'Typically within 2–24 hours after you send us your payment proof. We activate plans manually.' },
              { q: 'Is the subscription monthly?', a: 'Yes. You pay monthly and we renew your access each month. You can cancel anytime by simply not paying the next month.' },
              { q: 'What happens if I exceed my email limit?', a: 'The system will stop the campaign after reaching your plan limit and notify you to upgrade.' },
              { q: 'Can I upgrade my plan later?', a: 'Absolutely. Pay the difference for the new plan and we will upgrade your access immediately.' },
              { q: 'What if I need a refund?', a: 'We offer refunds within 48 hours if the system doesn\'t work for you. Contact us via email.' },
            ].map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="p-6 rounded-2xl bg-slate-100/3 border border-slate-100/8 hover:border-indigo-500/20 transition-all"
              >
                <h4 className="text-slate-100 font-bold text-sm mb-2">{faq.q}</h4>
                <p className="text-slate-400 text-sm leading-relaxed">{faq.a}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>



      {/* Plan Selection Modal */}
      <AnimatePresence>
        {selectedPlan && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-bg-base/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-bg-card border border-border-base rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button 
                onClick={() => setSelectedPlan(null)}
                className="absolute top-6 right-6 text-slate-500 hover:text-slate-100 transition-colors z-20"
              >
                <X size={20} />
              </button>

              {(() => {
                const plan = plans.find(p => p.id === selectedPlan)!;
                return (
                  <div className="relative">
                    <div className="text-center mb-6 pt-2">
                      <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center mx-auto mb-4 text-indigo-400">
                        {plan.icon}
                      </div>
                      <h2 className="text-2xl font-black text-slate-100 mb-1">Get {plan.name} Plan</h2>
                      <p className="text-3xl font-black text-indigo-400 mb-0.5">
                        {plan.price}
                        <span className="text-sm text-slate-500 ml-1">{plan.period}</span>
                      </p>
                      {plan.id !== 'free' && (
                        <p className="text-sm font-bold text-slate-400 mb-2">
                          ({plan.pkrPrice} {plan.period})
                        </p>
                      )}
                      <p className="text-slate-400 text-sm">Pay manually and get access within 24 hours</p>
                    </div>

                    <div className="space-y-3 mb-8">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 text-center">Accepted Payment Methods</p>
                      {paymentMethods.map((pm, i) => (
                        <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-slate-100/5 border border-slate-100/10 hover:border-indigo-500/30 transition-all group">
                          <div className="flex items-center gap-4 text-left">
                            <div className="w-10 h-10 rounded-xl bg-black/20 flex flex-shrink-0 items-center justify-center text-xl group-hover:bg-indigo-500/10 group-hover:scale-110 transition-all border border-slate-100/5">
                              {pm.icon}
                            </div>
                            <div>
                              <p className="text-slate-100 font-black text-sm tracking-tight">{pm.name}</p>
                              <p className="text-slate-400 text-[11px] mt-0.5">{pm.detail}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-start gap-3 p-5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-8 relative overflow-hidden">
                      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
                      <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex flex-shrink-0 items-center justify-center relative z-10 border border-indigo-500/30">
                        <CheckCircle2 size={16} className="text-indigo-400" />
                      </div>
                      <div className="relative z-10 text-left">
                        <strong className="text-slate-100 block text-sm mb-1 tracking-tight">Next Step: Verification</strong>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          Pay using one of the methods above, then enter your Transaction ID / Reference Number below. Our team will verify and upgrade your account!
                        </p>
                      </div>
                    </div>

                    {!isSubmitted ? (
                      <div className="flex flex-col gap-3">
                        <input
                          type="text"
                          placeholder="Enter Transaction ID / Reference No." aria-label="Enter Transaction ID / Reference No."
                          value={paymentTxId}
                          onChange={(e) => setPaymentTxId(e.target.value)}
                          className="w-full bg-black/20 border border-slate-100/10 rounded-xl px-4 py-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
                        />
                        
                        <div className="relative group">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          />
                          <div className={`w-full bg-black/20 border-2 border-dashed rounded-xl px-4 py-4 text-center transition-all ${paymentProof ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-100/10 group-hover:border-indigo-500/30'}`}>
                            {paymentProof ? (
                              <div className="flex items-center justify-center gap-2 text-emerald-400">
                                <Check size={16} />
                                <span className="text-xs font-bold uppercase tracking-widest">Proof Attached</span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-1 text-slate-500">
                                <Plus size={20} />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Upload Payment Proof</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={submitPayment}
                          disabled={!paymentTxId.trim() || !paymentProof}
                          className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-600-white font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                        >
                          Submit Payment for Verification
                        </button>
                        <button
                          onClick={() => { setSelectedPlan(null); setPaymentTxId(''); setPaymentProof(null); }}
                          className="py-3 text-slate-500 hover:text-slate-100 text-sm font-bold transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 text-center">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-2 border border-emerald-500/30">
                          <CheckCircle2 size={32} className="text-emerald-400" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-100 mb-1">Payment Submitted!</h3>
                        <p className="text-xs text-slate-400 mb-6">We're verifying your transaction. Your account will be upgraded within 24 hours.</p>
                        <button
                          onClick={() => { setSelectedPlan(null); setIsSubmitted(false); setPaymentTxId(''); setPaymentProof(null); }}
                          className="py-3.5 rounded-xl bg-slate-100/5 hover:bg-slate-100/10 text-slate-100 text-sm font-bold transition-colors border border-slate-100/10"
                        >
                          Return to Pricing
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}
