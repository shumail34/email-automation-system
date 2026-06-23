"use client";
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Mail, Lock, Zap, ArrowRight, UserPlus, LogIn, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { generateIntegrityHash } from '../../lib/plans';
import ThemeToggle from '../../components/ThemeToggle';
import { BACKEND_URL } from '@/lib/backend';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isForgotPass, setIsForgotPass] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1: email, 2: otp, 3: new pass
  const [newPassword, setNewPassword] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [userOtp, setUserOtp] = useState('');
  const [otpExpiry, setOtpExpiry] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const router = useRouter();

  React.useEffect(() => {
    if (!otpExpiry) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((otpExpiry - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    setTimeLeft(Math.max(0, Math.floor((otpExpiry - Date.now()) / 1000)));
    return () => clearInterval(interval);
  }, [otpExpiry]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const startOtpFlow = async () => {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(otp);
    setOtpExpiry(Date.now() + 120000); // 2 minutes
    setIsVerifying(true);

    try {
      showToast('Sending verification code...', 'success');
      const res = await fetch(`${BACKEND_URL}/api/send-otp/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.toLowerCase(),
          otp: otp
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        showToast(`SMTP Error: ${errData.message || 'Failed to send code'}`, 'error');
        console.log('TEST OTP:', otp);
      } else {
        showToast(`Verification code successfully sent to ${email}`, 'success');
      }
    } catch (err) {
      console.error("Real OTP failed", err);
      showToast("Network error: Could not reach email server.", "error");
      console.log('TEST OTP:', otp); // Fallback for dev if no internet
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (forgotStep === 1) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/check-user/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.toLowerCase() })
        });
        if (!res.ok) {
           showToast('Account not found', 'error');
           return;
        }
        const data = await res.json();
        if (!data.exists) {
          showToast('Account not found', 'error');
          return;
        }
        
        sessionStorage.setItem('forgot_pass_user_id', data.id.toString());
        
        startOtpFlow();
        setForgotStep(2);
      } catch (err) {
        showToast('Failed to check account', 'error');
      }
    } else if (forgotStep === 2) {
      if (!otpExpiry || Date.now() > otpExpiry) {
        showToast('Code expired', 'error');
        setForgotStep(1);
        setIsVerifying(false);
        return;
      }
      if (userOtp !== generatedOtp) {
        showToast('Invalid code', 'error');
        return;
      }
      setForgotStep(3);
    } else if (forgotStep === 3) {
      if (newPassword.length < 6) {
        showToast('Password must be 6+ characters', 'error');
        return;
      }
      
      const userId = sessionStorage.getItem('forgot_pass_user_id');
      if (!userId) {
         showToast('Session expired, please try again', 'error');
         setForgotStep(1);
         return;
      }

      try {
        const updateRes = await fetch(`${BACKEND_URL}/api/reset-password/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.toLowerCase(), password: newPassword })
        });
        
        if (updateRes.ok) {
          sessionStorage.removeItem('forgot_pass_user_id');
          showToast('✅ Password reset successful! Redirecting to login...', 'success');
          setTimeout(() => {
            setIsForgotPass(false);
            setForgotStep(1);
            setIsLogin(true);
            setPassword('');
            setNewPassword('');
            setUserOtp('');
            setGeneratedOtp('');
            setOtpExpiry(null);
            setIsVerifying(false);
          }, 1500);
        } else {
          showToast('Failed to reset password', 'error');
        }
      } catch (err) {
         showToast('Failed to reach backend', 'error');
      }
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isForgotPass) {
      handleForgotPassword(e);
      return;
    }
    if (!otpExpiry || Date.now() > otpExpiry) {
      showToast('OTP has expired. Please try again.', 'error');
      setIsVerifying(false);
      return;
    }
    if (userOtp !== generatedOtp) {
      showToast('Invalid verification code', 'error');
      return;
    }

    // Success - Create account in Django backend
    const newUsername = email.split('@')[0] + Date.now().toString().slice(-4);
    const validHash = generateIntegrityHash(email.toLowerCase(), 'free', 50);
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.toLowerCase(),
          username: newUsername,
          password: password,
          plan: 'free',
          emailLimit: 50,
          dailyLimit: 50,
          templateLimit: 1,
          teamLimit: 0,
          attachments: false,
          expiresAt: '2099-12-31',
          hash: validHash
        })
      });

      if (!res.ok) {
        showToast('Failed to create account. Email might exist.', 'error');
        return;
      }

      showToast('Account verified and created! Please log in.', 'success');
      setTimeout(() => {
        setIsLogin(true);
        setIsVerifying(false);
        setPassword('');
        setConfirmPassword('');
        setUserOtp('');
        setGeneratedOtp('');
        setOtpExpiry(null);
      }, 1000);
    } catch (err) {
      showToast('Backend connection error', 'error');
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || password.length < 6) {
      showToast('Enter valid email and 6+ char password', 'error');
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    if (isLogin) {
      // Brute-force protection
      if (lockedUntil && Date.now() < lockedUntil) {
        const secsLeft = Math.ceil((lockedUntil - Date.now()) / 1000);
        showToast(`Too many attempts. Try again in ${secsLeft}s.`, 'error');
        return;
      }

      try {
        // Standard Django JWT Login
        const loginRes = await fetch(`${BACKEND_URL}/api/token/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.toLowerCase(), password })
        });

        if (loginRes.ok) {
          const tokens = await loginRes.json();
          sessionStorage.setItem('outreachpro_access', tokens.access);
          sessionStorage.setItem('outreachpro_refresh', tokens.refresh);
          sessionStorage.setItem('outreachpro_session', email.toLowerCase());
          
          setLoginAttempts(0);
          setLockedUntil(null);

          // Check if admin or free user for redirection
          let isFreePlan = false;
          const userRes = await fetch(`${BACKEND_URL}/api/users/?email=${encodeURIComponent(email)}`, {
            headers: { 'Authorization': `Bearer ${tokens.access}` }
          });
          
          if (userRes.ok) {
             const usersList = await userRes.json();
             const currentUser = usersList.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
             if (currentUser) {
                if (currentUser.plan === 'admin') {
                   sessionStorage.setItem('admin_authed', 'yes');
                   showToast('Administrator access granted!', 'success');
                   setTimeout(() => router.push('/admin'), 1000);
                   return;
                } else if (currentUser.plan === 'free') {
                   isFreePlan = true;
                }
             }
          }
          
          showToast('Login successful!');
          if (isFreePlan) {
            setTimeout(() => router.push('/pricing'), 1000);
          } else {
            setTimeout(() => router.push('/'), 1000);
          }
        } else {
          // Increment failed attempts
          const newAttempts = loginAttempts + 1;
          setLoginAttempts(newAttempts);
          if (newAttempts >= 5) {
            setLockedUntil(Date.now() + 30000); // 30s lockout
            setLoginAttempts(0);
            showToast('Too many failed attempts. Locked for 30 seconds.', 'error');
          } else {
            showToast(`Invalid email or password (${5 - newAttempts} attempts left)`, 'error');
          }
        }
      } catch (err) {
        showToast('Backend API is unreachable', 'error');
      }
    } else {
      // Start OTP Flow instead of immediate creation
      startOtpFlow();
    }
  };

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-6 text-slate-200 relative" style={{ fontFamily: "'Inter', sans-serif" }} suppressHydrationWarning>

      
      {/* Floating Theme Selector */}
      <div className="absolute top-6 right-6 z-50">
        <ThemeToggle />
      </div>

      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <Link href="/">
            <motion.div className="inline-flex items-center gap-3 mb-6" whileHover={{ scale: 1.05 }}>
              <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-2xl shadow-emerald-500/20">
                <Zap size={24} className="text-black" />
              </div>
              <div className="flex flex-col text-left leading-none">
                <span className="font-black text-text-base text-xl tracking-tight">OutreachPro</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">by A&S Solution</span>
              </div>
            </motion.div>
          </Link>
          <h1 className="text-3xl font-black text-text-base mb-2">
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h1>
          <p className="text-slate-400 text-sm">
            {isLogin ? 'Log in to manage your email campaigns' : 'Start sending automated emails for free'}
          </p>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="bg-bg-card/80 backdrop-blur-xl border border-border-base rounded-3xl p-8 shadow-2xl"
        >
          {isForgotPass ? (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 mx-auto mb-4 border border-amber-500/20">
                  <Lock size={32} />
                </div>
                <h2 className="text-xl font-bold text-text-base mb-2">
                  {forgotStep === 1 ? 'Reset Password' : forgotStep === 2 ? 'Verify Identity' : 'New Password'}
                </h2>
                <p className="text-slate-400 text-sm">
                  {forgotStep === 1 ? 'Enter your email to receive a recovery code' : forgotStep === 2 ? `Enter the code sent to ${email}` : 'Create a new secure password for your account'}
                </p>
              </div>

              <form onSubmit={handleForgotPassword} className="space-y-5">
                {forgotStep === 1 && (
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Email Address</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="email" required
                        value={email} onChange={e => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full bg-bg-input border border-border-base rounded-xl pl-11 pr-4 py-3.5 text-text-base text-sm outline-none focus:border-amber-500/50 focus:bg-white/10 transition-all"
                      />
                    </div>
                  </div>
                )}

                {forgotStep === 2 && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Verification Code</label>
                      <input
                        type="text" required maxLength={6}
                        value={userOtp} onChange={e => setUserOtp(e.target.value.replace(/\D/g,''))}
                        placeholder="000000"
                        className="w-full bg-bg-input border border-border-base rounded-xl px-4 py-4 text-center text-2xl font-black tracking-[0.5em] text-text-base outline-none focus:border-amber-500/50 focus:bg-white/10 transition-all"
                      />
                    </div>
                    <div className="flex justify-between items-center px-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Expires in: <span className="text-amber-400">{timeLeft}s</span>
                      </p>
                      <button 
                        type="button"
                        onClick={startOtpFlow}
                        disabled={timeLeft > 90}
                        className={`text-[10px] font-black uppercase tracking-widest transition-colors ${timeLeft > 90 ? 'text-slate-700 cursor-not-allowed' : 'text-amber-500 hover:text-amber-400'}`}
                      >
                        Resend {timeLeft > 90 ? `(${timeLeft - 90}s)` : ''}
                      </button>
                    </div>
                  </div>
                )}

                {forgotStep === 3 && (
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">New Password</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type={showPassword ? "text" : "password"} required minLength={6}
                        value={newPassword} onChange={e => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-bg-input border border-border-base rounded-xl pl-11 pr-12 py-3.5 text-text-base text-sm outline-none focus:border-amber-500/50 focus:bg-white/10 transition-all"
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  type="submit"
                  className="w-full py-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25"
                >
                  {forgotStep === 1 ? 'Send Recovery Code' : forgotStep === 2 ? 'Verify Code' : 'Update Password'}
                </motion.button>

                <button 
                  type="button"
                  onClick={() => { setIsForgotPass(false); setForgotStep(1); }}
                  className="w-full text-slate-500 hover:text-slate-300 text-[10px] font-black uppercase tracking-widest transition-colors"
                >
                  Back to Login
                </button>
              </form>
            </div>
          ) : isVerifying ? (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-4 border border-primary/20">
                  <Shield size={32} />
                </div>
                <h2 className="text-xl font-bold text-text-base mb-2">Verify your email</h2>
                <p className="text-slate-400 text-sm">We've sent a 6-digit code to <br /><span className="text-primary font-bold">{email}</span></p>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Verification Code</label>
                  <input
                    type="text" required maxLength={6}
                    value={userOtp} onChange={e => setUserOtp(e.target.value.replace(/\D/g,''))}
                    placeholder="000000"
                    className="w-full bg-bg-input border border-border-base rounded-xl px-4 py-4 text-center text-2xl font-black tracking-[0.5em] text-text-base outline-none focus:border-primary/50 focus:bg-white/10 transition-all"
                  />
                </div>

                <div className="text-center">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Code expires in: <span className="text-amber-400">
                      {timeLeft}s
                    </span>
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    type="submit"
                    className="w-full py-4 rounded-xl bg-primary hover:bg-primary-hover text-black font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                  >
                    Confirm & Create Account
                  </motion.button>

                  <div className="flex items-center justify-between px-1">
                    <button 
                      type="button"
                      onClick={() => setIsVerifying(false)}
                      className="text-slate-500 hover:text-slate-300 text-[10px] font-black uppercase tracking-widest transition-colors"
                    >
                      Change Email
                    </button>
                    
                    <button 
                      type="button"
                      onClick={startOtpFlow}
                      disabled={timeLeft > 90} // Disable for first 30s
                      className={`text-[10px] font-black uppercase tracking-widest transition-colors ${timeLeft > 90 ? 'text-slate-700 cursor-not-allowed' : 'text-primary hover:text-primary-hover'}`}
                    >
                      Resend Code {timeLeft > 90 ? `(${timeLeft - 90}s)` : ''}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          ) : (
            <>
              <div className="flex bg-black/10 dark:bg-black/40 rounded-xl p-1 mb-8">
                <button
                  onClick={() => { setIsLogin(true); setIsForgotPass(false); }}
                  className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${isLogin ? 'bg-primary text-black shadow-lg shadow-emerald-500/10' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Log In
                </button>
                <button
                  onClick={() => { setIsLogin(false); setIsForgotPass(false); }}
                  className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${!isLogin ? 'bg-primary text-black shadow-lg shadow-emerald-500/10' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Sign Up
                </button>
              </div>

              <form onSubmit={handleAuth} className="space-y-5">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Email Address</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="email" required
                      value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-bg-input border border-border-base rounded-xl pl-11 pr-4 py-3.5 text-text-base text-sm outline-none focus:border-primary/50 focus:bg-white/10 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Password</label>
                    {isLogin && (
                      <button 
                        type="button" 
                        onClick={() => setIsForgotPass(true)}
                        className="text-[10px] font-black text-primary hover:text-primary-hover uppercase tracking-widest transition-colors"
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type={showPassword ? "text" : "password"} required minLength={6}
                      value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-bg-input border border-border-base rounded-xl pl-11 pr-12 py-3.5 text-text-base text-sm outline-none focus:border-primary/50 focus:bg-white/10 transition-all"
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {!isLogin && (
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Confirm Password</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type={showPassword ? "text" : "password"} required minLength={6}
                        value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-bg-input border border-border-base rounded-xl pl-11 pr-12 py-3.5 text-text-base text-sm outline-none focus:border-primary/50 focus:bg-white/10 transition-all"
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  type="submit"
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-black font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 mt-4"
                >
                  {isLogin ? (
                    <><LogIn size={18} /> Access Dashboard</>
                  ) : (
                    <><UserPlus size={18} /> Create Free Account</>
                  )}
                </motion.button>
              </form>
            </>
          )}
        </motion.div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: -20, x: 20 }}
            className={`fixed top-6 right-6 z-[300] min-w-[300px] max-w-sm px-5 py-4 rounded-xl shadow-2xl backdrop-blur-xl flex items-center gap-3 border ${
              toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 size={18} className="flex-shrink-0" /> : <AlertCircle size={18} className="flex-shrink-0" />}
            <span className="text-xs font-bold leading-tight">{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
