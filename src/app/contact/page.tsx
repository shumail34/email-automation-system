"use client";
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, MessageSquare, Send, CheckCircle2, AlertCircle, LifeBuoy, Zap, Globe, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import { BACKEND_URL } from '@/lib/backend';

export default function ContactPage() {
  const [sessionUser, setSessionUser] = React.useState<string | null>(null);
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
    const user = sessionStorage.getItem('outreachpro_session');
    if (user) {
      setSessionUser(user);
      setFormData(prev => ({ ...prev, email: user }));
    }
  }, []);

  const [formData, setFormData] = useState({ name: '', email: '', subject: 'Support', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.includes('@') || formData.message.length < 10) {
      showToast('Please provide a valid email and detailed message', 'error');
      return;
    }

    setIsSubmitting(true);
    
    try {
      // 1. Post to Django API so Admin can see it in the DB
      await fetch(`${BACKEND_URL}/api/tickets/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      // 2. Fetch System Config and Send Email to Admin
      let sysConfig = null;
      try {
        const localCfg = localStorage.getItem('outreachpro_system_config');
        if (localCfg) {
          sysConfig = JSON.parse(localCfg);
        } else {
          const cfgList = await fetch(`${BACKEND_URL}/api/smtp-config/`);
          if (cfgList.ok) {
            const cfgData = await cfgList.json();
            if (cfgData && cfgData.configured) {
              sysConfig = { host: cfgData.host, port: cfgData.port, user: cfgData.user, pass: cfgData.pass, senderName: cfgData.senderName };
            }
          }
        }
      } catch (_) {}

      if (sysConfig) {
        try {
          const mailRes = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              config: sysConfig,
              to: sysConfig.user, // send to admin's own email
              subject: `New Support Query: ${formData.subject}`,
              body: `You received a new query from ${formData.name} (${formData.email}):\n\n${formData.message}`
            })
          });
          if (!mailRes.ok) {
            const errBody = await mailRes.text();
            console.error('Email failed to send:', errBody);
          }
        } catch (mailErr) {
          console.error('Mail fetch error:', mailErr);
        }
      }

      showToast('Message sent! Our team will contact you soon.');
      setFormData({ name: '', email: sessionUser || '', subject: 'Support', message: '' });
    } catch (err) {
      showToast('Failed to send message', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-bg-base text-text-base selection:bg-indigo-500/30 selection:text-white" style={{ fontFamily: "'Inter', sans-serif" }} suppressHydrationWarning>

      
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/5 blur-[120px] rounded-full" />
      </div>


      <Navbar />


      <main className="container-saas px-6 py-20 md:py-32 relative z-10">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-16 md:gap-24 items-start">
          
          {/* Left Side: Info */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="badge-saas mb-6 inline-flex border-indigo-500/20 text-indigo-400">
              <LifeBuoy size={12} className="mr-2" /> Help Center
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-slate-100 mb-8 leading-tight">
              Share your <span className="text-indigo-500">Query</span> <br /> With our Experts.
            </h1>
            <p className="text-slate-400 text-lg mb-12 leading-relaxed max-w-md">
              Encountered a technical hurdle? Have a suggestion for the next infrastructure update? Our support engineers are standing by.
            </p>

            <div className="space-y-8">
              <div className="flex gap-6 items-start">
                <div className="w-12 h-12 rounded-2xl bg-slate-100/5 border border-slate-100/10 flex items-center justify-center text-indigo-400 flex-shrink-0">
                  <Mail size={24} />
                </div>
                <div>
                  <h4 className="text-slate-100 font-bold mb-1 uppercase text-xs tracking-widest">Email Support</h4>
                  <p className="text-slate-500 text-sm">ceo@a-s-solution.online</p>
                </div>
              </div>
              <div className="flex gap-6 items-start">
                <div className="w-12 h-12 rounded-2xl bg-slate-100/5 border border-slate-100/10 flex items-center justify-center text-emerald-400 flex-shrink-0">
                  <MessageSquare size={24} />
                </div>
                <div>
                  <h4 className="text-slate-100 font-bold mb-1 uppercase text-xs tracking-widest">Live Response</h4>
                  <p className="text-slate-500 text-sm">Typical response time: &lt; 12 Hours</p>
                </div>
              </div>
              <div className="flex gap-6 items-start">
                <div className="w-12 h-12 rounded-2xl bg-slate-100/5 border border-slate-100/10 flex items-center justify-center text-amber-400 flex-shrink-0">
                  <Globe size={24} />
                </div>
                <div>
                  <h4 className="text-slate-100 font-bold mb-1 uppercase text-xs tracking-widest">Global HQ</h4>
                  <p className="text-slate-500 text-sm">Powered by A&S Solution Ecosystem</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Side: Form */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="card-saas p-8 md:p-12 border-slate-100/10 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/10 blur-[60px] rounded-full -mr-16 -mt-16" />
            
            <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
                  <input 
                    type="text" 
                    required
                    className="input-saas" 
                    placeholder="John Doe" aria-label="John Doe"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Your Email</label>
                  <input 
                    type="email" 
                    required
                    className={`input-saas ${sessionUser ? 'opacity-70 cursor-not-allowed' : ''}`}
                    placeholder="john@company.com" aria-label="john@company.com"
                    value={formData.email}
                    readOnly={!!sessionUser}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Query Subject</label>
                <select 
                  className="input-saas appearance-none cursor-pointer"
                  value={formData.subject}
                  onChange={(e) => setFormData({...formData, subject: e.target.value})}
                >
                  <option value="Support" className="bg-bg-base">Technical Support</option>
                  <option value="Billing" className="bg-bg-base">Billing & Plans</option>
                  <option value="Agency" className="bg-bg-base">Agency Partnership</option>
                  <option value="Feedback" className="bg-bg-base">Feature Feedback</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Message Detail</label>
                <textarea 
                  required
                  rows={5}
                  className="input-saas py-4 resize-none" 
                  placeholder="Tell us about your problem or share your query..."
                  value={formData.message}
                  onChange={(e) => setFormData({...formData, message: e.target.value})}
                ></textarea>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-3 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isSubmitting ? (
                  <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><Zap size={18} /></motion.div> Transmitting...</>
                ) : (
                  <><Send size={18} /> Deploy Query</>
                )}
              </motion.button>
            </form>
          </motion.div>
        </div>
      </main>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 40, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 40, x: '-50%' }}
            className={`fixed bottom-10 left-1/2 z-[300] px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 border text-sm font-bold ${
              toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
            {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="py-12 border-t border-slate-100/5 text-center">
        <p className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.3em]">
          OutreachPro Support Infrastructure · Managed by A&S Solution
        </p>
      </footer>
    </div>
  );
}
