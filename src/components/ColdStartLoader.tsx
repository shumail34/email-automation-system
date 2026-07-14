import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Server } from 'lucide-react';

interface ColdStartLoaderProps {
  isOpen: boolean;
  message?: string;
  subtitle?: string;
}

export default function ColdStartLoader({ 
  isOpen, 
  message = "Starting server...",
  subtitle = "Our backend is waking up. This usually takes 30–60 seconds because it is hosted on Render's free plan." 
}: ColdStartLoaderProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-slate-900 border border-slate-700/50 rounded-2xl p-8 max-w-sm w-full shadow-2xl relative overflow-hidden"
          >
            {/* Animated background glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1/2 bg-primary/10 blur-[50px] pointer-events-none" />

            <div className="flex flex-col items-center text-center relative z-10">
              <div className="relative mb-6">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center shadow-lg">
                  <Server size={32} className="text-primary animate-pulse" />
                </div>
                <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
                  <Loader2 size={16} className="text-primary animate-spin" />
                </div>
              </div>

              <h3 className="text-xl font-bold text-white mb-2">{message}</h3>
              <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                {subtitle}
              </p>

              {/* Progress bar container */}
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-primary"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 10, ease: "linear", repeat: Infinity }}
                />
              </div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-4">
                Please don't close this window
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
