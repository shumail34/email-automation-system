"use client";
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, AlertCircle } from 'lucide-react';

const legalContent: any = {
  Privacy: {
    title: "Privacy Policy",
    content: "OutreachPro by A&S Solution takes your privacy seriously. All data uploaded (leads, email content) is processed locally in your browser and sent directly through your SMTP gateway. We do not store your lead lists on our servers. Your credentials are saved only in your browser's local storage."
  },
  Security: {
    title: "Security Infrastructure",
    content: "OutreachPro uses AES-256 encryption for secure handshakes. We recommend using App Passwords for all SMTP connections. Our system never has access to your master account passwords. All transmissions are encrypted via TLS v1.2+."
  },
  Terms: {
    title: "Terms of Service",
    content: "By using OutreachPro by A&S Solution, you agree to comply with anti-spam laws (CAN-SPAM, GDPR). You are responsible for ensuring you have consent to contact the leads in your lists. We reserve the right to limit access if our systems are used for malicious spamming."
  },
  Support: {
    title: "Technical Support",
    content: "Need help with OutreachPro? Reach out to our technical team for assistance with SMTP configuration, lead parsing, and delivery optimization directly through your dashboard for authenticated users."
  }
};

export default function Footer() {
  const [activeLegal, setActiveLegal] = useState<string | null>(null);

  return (
    <>
      {/* Legal Modal */}
      <AnimatePresence>
        {activeLegal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="card-saas max-w-2xl w-full relative bg-bg-card/90 border border-border-base p-8 rounded-3xl"
            >
              <button 
                onClick={() => setActiveLegal(null)}
                className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors"
              >
                <AlertCircle size={20} />
              </button>
              <h2 className="text-2xl font-black text-slate-200 mb-6 uppercase tracking-tight">{legalContent[activeLegal].title}</h2>
              <div className="text-slate-400 leading-relaxed font-medium">
                {legalContent[activeLegal].content}
              </div>
              <button 
                onClick={() => setActiveLegal(null)}
                className="mt-10 btn-saas w-full py-4 text-black font-bold bg-primary hover:bg-primary-hover rounded-xl"
              >
                Understood
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
 
      {/* Footer */}
      <footer className="pt-24 border-t border-border-base bg-bg-card/10">
        <div className="max-w-7xl mx-auto px-6 pb-20">
          <div className="flex flex-col items-center justify-between gap-12">
            <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
              <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-2xl shadow-emerald-500/20">
                <Zap size={28} className="text-black" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-black text-text-base tracking-tighter text-2xl uppercase">OutreachPro</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">by A&S Solution</span>
              </div>
            </div>
            <div className="flex flex-wrap justify-center items-center gap-6 md:gap-12">
              {['Privacy', 'Security', 'Terms', 'Support'].map(item => (
                <button 
                  key={item} 
                  onClick={() => setActiveLegal(item)}
                  className="text-xs font-bold text-slate-500 hover:text-white uppercase tracking-widest transition-colors bg-transparent border-none cursor-pointer"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Absolute Bottom Bar */}
        <div className="border-t border-border-base py-10 bg-bg-base/40">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
            <p className="text-[10px] text-slate-300 font-black uppercase tracking-[0.4em]">OutreachPro — Precision Engineered by A&S Solution</p>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.6em]">© 2026 A&S Solution | All Rights Reserved</p>
          </div>
        </div>
      </footer>
    </>
  );
}
