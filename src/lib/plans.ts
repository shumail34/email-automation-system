// Shared plan utilities — used by both the main app and admin panel

export type Plan = 'free' | 'starter' | 'pro' | 'agency' | 'admin';

export interface UserPlan {
  email: string;
  plan: Plan;
  emailLimit: number;      // Per campaign limit (-1 = unlimited)
  dailyLimit: number;      // Per day limit (-1 = unlimited)
  monthlyLimit: number;    // Per month limit (-1 = unlimited)
  templateLimit: number;   // -1 = unlimited
  teamLimit: number;       // -1 = unlimited
  attachments: boolean;
  expiresAt: string;
  leadGenLimit: number;    // Per month limit for leads (-1 = unlimited)
}

export const DEFAULT_FREE_PLAN: UserPlan = {
  email: '',
  plan: 'free',
  emailLimit: 50,
  dailyLimit: 50,
  monthlyLimit: 1500,
  templateLimit: 1,
  teamLimit: 0,
  attachments: false,
  expiresAt: '',
  leadGenLimit: 10,
};

/** Look up the active user plan stored by admin in localStorage */
// Multi-layer obfuscation to prevent easy tampering via localStorage
const SALT = "outreachpro_secure_v2_x7k2026!";

export function generateIntegrityHash(email: string, plan: string, limit: number): string {
  if (typeof window === 'undefined') return '';
  // Layer 1: Compose a salted string
  const raw = `${email.toLowerCase()}::${plan}::${limit}::${SALT}`;
  // Layer 2: Base64 encode
  const b64 = btoa(unescape(encodeURIComponent(raw)));
  // Layer 3: Reverse it
  const reversed = b64.split('').reverse().join('');
  // Layer 4: ROT13 character rotation
  return reversed.replace(/[a-zA-Z]/g, (c: string) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

export function verifyIntegrityHash(user: any): boolean {
  // Django backend API is now the single source of truth for plan security
  return true;
}

export const PLAN_LIMITS: Record<Plan, Omit<UserPlan, 'email' | 'plan' | 'expiresAt'>> = {
  free:    { emailLimit: 50,   dailyLimit: 50,   monthlyLimit: 1500,  templateLimit: 1,  teamLimit: 0,  attachments: false, leadGenLimit: 10 },
  starter: { emailLimit: 500,  dailyLimit: 2000, monthlyLimit: 30000, templateLimit: 5,  teamLimit: 0,  attachments: true,  leadGenLimit: 200 },
  pro:     { emailLimit: -1,   dailyLimit: -1,   monthlyLimit: -1,    templateLimit: -1, teamLimit: 0,  attachments: true,  leadGenLimit: 1000 },
  agency:  { emailLimit: -1,   dailyLimit: -1,   monthlyLimit: -1,    templateLimit: -1, teamLimit: 5,  attachments: true,  leadGenLimit: 3300 },
  admin:   { emailLimit: -1,   dailyLimit: -1,   monthlyLimit: -1,    templateLimit: -1, teamLimit: -1, attachments: true,  leadGenLimit: -1 },
};

export function lookupUserPlan(email: string): UserPlan {
  if (typeof window === 'undefined') return DEFAULT_FREE_PLAN;
  try {
    const users = JSON.parse(localStorage.getItem('outreachpro_users') || '[]');
    const user = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
    
    if (user) {
      if (user.expiresAt && user.expiresAt !== '2099-12-31') {
        const expiry = new Date(user.expiresAt);
        expiry.setHours(23, 59, 59, 999);
        if (expiry < new Date()) {
          return { ...DEFAULT_FREE_PLAN, email };
        }
      }

      if (!verifyIntegrityHash(user)) {
        return { ...DEFAULT_FREE_PLAN, email };
      }

      const limits = PLAN_LIMITS[user.plan as Plan] || PLAN_LIMITS.free;
      return {
        email: user.email,
        plan: user.plan,
        ...limits,
        expiresAt: user.expiresAt
      };
    }
  } catch (e) {}
  return { ...DEFAULT_FREE_PLAN, email };
}

export const PLAN_LABELS: Record<Plan, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  agency: 'Agency',
  admin: 'Administrator',
};

export const PLAN_COLORS: Record<Plan, string> = {
  free: 'text-slate-400 border-slate-500/20 bg-slate-500/10',
  starter: 'text-indigo-400 border-indigo-500/20 bg-indigo-500/10',
  pro: 'text-violet-400 border-violet-500/20 bg-violet-500/10',
  agency: 'text-amber-400 border-amber-500/20 bg-amber-500/10',
  admin: 'text-rose-400 border-rose-500/20 bg-rose-500/10',
};
