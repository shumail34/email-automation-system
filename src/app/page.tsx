"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { 
  Upload, Mail, Send, Settings, FileSpreadsheet, CheckCircle2,
  AlertCircle, Loader2, Eye, EyeOff, Zap, ShieldCheck,
  Globe, Layout, PieChart, Users, UserPlus, ArrowRight, Paperclip, Trash2, Menu, X,
  Crown, Lock, LogOut, Search, Download, Plus, Star
} from 'lucide-react';
import { motion, AnimatePresence, useInView, useScroll, useTransform } from 'framer-motion';
import * as XLSX from 'xlsx';
import dynamic from 'next/dynamic';
const Editor = dynamic(() => import('react-simple-wysiwyg'), { ssr: false, loading: () => <div className="animate-pulse bg-slate-800 rounded-xl h-64 w-full border border-slate-700"></div> });
import { lookupUserPlan, DEFAULT_FREE_PLAN, PLAN_LABELS, PLAN_COLORS, type UserPlan, generateIntegrityHash, PLAN_LIMITS, type Plan } from '../lib/plans';
import { apiFetch } from '../lib/api';
import { saveUserData, loadUserData, removeUserData } from '../lib/storage';
import { useEmailSender } from '../lib/useEmailSender';
import { useLeadGen } from '../lib/useLeadGen';
import Footer from '../components/Footer';
import ThemeToggle from '../components/ThemeToggle';

interface EmailData {
  'Business Name': string;
  'Location Name': string;
  'First Name': string;
  'Last Name': string;
  'Email': string;
  [key: string]: string;
}

interface SendStatus {
  email: string;
  status: 'pending' | 'sending' | 'success' | 'error' | 'invalid';
  error?: string;
}

export default function EmailAutomator() {
  const [data, setData] = useState<EmailData[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [templates, setTemplates] = useState<any[]>([
    { id: '1', name: 'Default Mail', subject: 'Grow your {{business_name}}', body: 'Hi {{first_name}},\n\nI love your practice in {{location_name}}!' }
  ]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>('1');

  const [template, setTemplate] = useState(`Hi {{first_name}},\n\nI love your practice in {{location_name}}!\n\nAre you still working in the {{industry}} industry? Feel free to call us at {{phone number}}!`);
  const [subject, setSubject] = useState("Grow your {{business_name}}");

  const [config, setConfig] = useState({
    host: 'smtp.gmail.com', port: '465', user: '', pass: '', senderName: '',
    saveToSent: true
  });
  const [statuses, setStatuses] = useState<SendStatus[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [delay, setDelay] = useState(5);
  const [showPassword, setShowPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [attachments, setAttachments] = useState<{name: string, content: string, type: string}[]>([]);

  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [userPlan, setUserPlan] = useState<UserPlan>(DEFAULT_FREE_PLAN);

  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [paymentNotification, setPaymentNotification] = useState<{status: string, plan: string, id?: number} | null>(null);
  const [dailyUsage, setDailyUsage] = useState(0);
  const [monthlyUsage, setMonthlyUsage] = useState(0);
  const [monthlyLeadUsage, setMonthlyLeadUsage] = useState(0);
  const [lastSentDate, setLastSentDate] = useState("");
  
  // Dynamic Autocomplete States
  const [locationSuggestions, setLocationSuggestions] = useState<{display_name: string}[]>([]);
  const [locationQueryTimeout, setLocationQueryTimeout] = useState<NodeJS.Timeout | null>(null);
  const [lastSentMonth, setLastSentMonth] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());

  // Live System Clock & Auto-Reset
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      const today = now.toISOString().split('T')[0];
      const thisMonth = today.slice(0, 7); // "YYYY-MM"

      // Auto-reset daily usage if date flips while tab is open
      if (lastSentDate && lastSentDate !== today) {
        setDailyUsage(0);
        setLastSentDate(today);
        const usageKey = `outreachpro_usage_${sessionUser || 'guest'}`;
        localStorage.setItem(usageKey, JSON.stringify({ date: today, count: 0 }));
      }
      // Auto-reset monthly usage if month flips while tab is open
      if (lastSentMonth && lastSentMonth !== thisMonth) {
        setMonthlyUsage(0);
        setLastSentMonth(thisMonth);
        const mKey = `outreachpro_monthly_${sessionUser || 'guest'}`;
        localStorage.setItem(mKey, JSON.stringify({ month: thisMonth, count: 0 }));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lastSentDate, lastSentMonth, sessionUser]);
  const [activeTab, setActiveTab] = useState<'campaign' | 'analytics' | 'team' | 'leads'>('campaign');
  const [campaignHistory, setCampaignHistory] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [newMemberData, setNewMemberData] = useState({ email: '', password: '' });
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const PREBUILT_TEMPLATES = [
    { name: 'Cold Outreach', subject: 'Question about {{business_name}}', body: 'Hi {{first_name}},\n\nI was looking at your location in {{location_name}} and I am impressed. I have a question about how you handle your marketing...' },
    { name: 'Follow Up', subject: 'Re: {{business_name}} partnership', body: 'Hi {{first_name}},\n\nJust wanted to follow up on my previous email. I truly believe we can help {{business_name}} scale even faster...' },
    { name: 'Meeting Request', subject: 'Quick chat about {{business_name}}?', body: 'Hi {{first_name}},\n\nDo you have 10 minutes this week to discuss a potential collaboration for your branch in {{location_name}}?' },
  ];

  useEffect(() => {
    setIsMounted(true);
    const loggedUser = sessionStorage.getItem('outreachpro_session');
    if (loggedUser) {
      setSessionUser(loggedUser);
      setConfig(prev => ({ ...prev, user: loggedUser }));
    }
  }, []);

  // Sync config user with session user is handled inside loadAll now to prevent race conditions

  // Hydrate userPlan from localStorage cache immediately after mount
  // Only apply the cache if the email matches the current session to prevent stale plan data
  useEffect(() => {
    try {
      const cached = localStorage.getItem('outreachpro_plan_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        const loggedUser = sessionStorage.getItem('outreachpro_session') || '';
        const savedConfigRaw = localStorage.getItem('email_automator_config_saas_final');
        const savedEmail = savedConfigRaw ? (JSON.parse(savedConfigRaw).user || '') : '';
        const currentEmail = loggedUser || savedEmail;
        // Only restore cache if the email in the cache matches the current user
        if (parsed.email && currentEmail && parsed.email.toLowerCase() === currentEmail.toLowerCase()) {
          setUserPlan(parsed);
        } else if (!currentEmail) {
          // No email known yet — still apply cache so plan shows while API loads
          setUserPlan(parsed);
        }
        // If emails DON'T match, discard the stale cache and clear it
        else {
          localStorage.removeItem('outreachpro_plan_cache');
        }
      }
    } catch {}
  }, []);


  // Persist userPlan to localStorage whenever it changes so it survives page refresh
  useEffect(() => {
    // Only cache plans that have a real email (i.e. actually fetched from API, not defaults)
    if (userPlan?.email) {
      localStorage.setItem('outreachpro_plan_cache', JSON.stringify(userPlan));
    }
  }, [userPlan]);


  // Re-check plan whenever the session user or SMTP user email changes, with Shadow Migration to Django
  useEffect(() => {
    const emailToUse = sessionUser || config.user;
    const hasToken = typeof window !== 'undefined' ? !!sessionStorage.getItem('outreachpro_access') : false;
    
    if (isMounted && emailToUse.includes('@') && hasToken) {
      const fetchPlan = async () => {
        try {
          const res = await apiFetch(`/users/?email=${encodeURIComponent(emailToUse)}`);
          const user = res.find((u: any) => u.email.toLowerCase() === emailToUse.toLowerCase());
          
          if (user) {
            // Found in Django backend — update plan and persist to cache
            const freshPlan = {
              plan: user.plan,
              emailLimit: user.emailLimit,
              dailyLimit: user.dailyLimit,
              monthlyLimit: user.monthlyLimit ?? PLAN_LIMITS[user.plan as Plan]?.monthlyLimit ?? -1,
              templateLimit: user.templateLimit,
              teamLimit: user.teamLimit,
              attachments: user.attachments,
              leadGenLimit: user.leadGenLimit ?? PLAN_LIMITS[user.plan as Plan]?.leadGenLimit ?? -1,
              expiresAt: user.expiresAt,
              email: emailToUse
            };
            setUserPlan(freshPlan);
            localStorage.setItem('outreachpro_plan_cache', JSON.stringify(freshPlan));

            // ── Real-time monthly usage from backend ──
            const thisMonth = new Date().toISOString().slice(0, 7);
            if (user.emails_sent_month === thisMonth) {
              setMonthlyUsage(user.emails_sent_count || 0);
            } else {
              setMonthlyUsage(0);
            }
            if (user.leads_generated_month === thisMonth) {
              setMonthlyLeadUsage(user.leads_generated_count || 0);
            } else {
              setMonthlyLeadUsage(0);
            }
            setLastSentMonth(thisMonth);
          } else {
            // SHADOW MIGRATION: User exists in localStorage but not Django
            // This prevents old users from losing their plan
            const oldUsers = JSON.parse(localStorage.getItem('outreachpro_users') || '[]');
            const oldUser = oldUsers.find((u: any) => u.email.toLowerCase() === emailToUse.toLowerCase());
            
            if (oldUser) {
              // Migrate to Django
              const newHash = generateIntegrityHash(emailToUse, oldUser.plan, oldUser.emailLimit || 50);
              const migrated = await apiFetch('/users/', {
                method: 'POST',
                body: JSON.stringify({
                  email: oldUser.email.toLowerCase(),
                  username: oldUser.email.split('@')[0] + Date.now().toString().slice(-4),
                  password: 'migrated123!',
                  plan: oldUser.plan,
                  emailLimit: oldUser.emailLimit,
                  dailyLimit: oldUser.dailyLimit,
                  templateLimit: oldUser.templateLimit,
                  teamLimit: oldUser.teamLimit || 0,
                  attachments: oldUser.attachments,
                  expiresAt: oldUser.expiresAt || '2099-12-31',
                  isMember: !!oldUser.isMember,
                  owner: oldUser.owner || null,
                  hash: newHash
                })
              });
              const migratedPlan = {
                plan: migrated.plan,
                emailLimit: migrated.emailLimit,
                dailyLimit: migrated.dailyLimit,
                monthlyLimit: migrated.monthlyLimit,
                templateLimit: migrated.templateLimit,
                teamLimit: migrated.teamLimit,
                attachments: migrated.attachments,
                leadGenLimit: migrated.leadGenLimit ?? PLAN_LIMITS[migrated.plan as Plan]?.leadGenLimit ?? -1,
                expiresAt: migrated.expiresAt,
                email: emailToUse
              };
              setUserPlan(migratedPlan);
              localStorage.setItem('outreachpro_plan_cache', JSON.stringify(migratedPlan));
            } else {
              // Truly does not exist
              if (sessionUser) {
                sessionStorage.removeItem('outreachpro_session');
                localStorage.removeItem('outreachpro_plan_cache');
                setSessionUser(null);
                showToast("Session expired or account deactivated", "info");
              }
              // Do NOT reset to DEFAULT_FREE_PLAN here — keep cached plan until API confirms
            }
          }
        } catch (err) {
          // API is down: keep the cached plan, don't reset to Free
          const cached = localStorage.getItem('outreachpro_plan_cache');
          if (cached) {
            try { setUserPlan(JSON.parse(cached)); } catch {}
          } else {
            setUserPlan(lookupUserPlan(emailToUse));
          }
        }
      };

      const fetchPayment = async () => {
        try {
          const payments = await apiFetch(`/payments/?email=${encodeURIComponent(emailToUse)}`);
          if (payments && payments.length > 0) {
            const latest = payments[0];
            const lastSeenId = localStorage.getItem('outreachpro_last_seen_payment');
            if (
              (latest.status === 'accepted' || latest.status === 'rejected') &&
              String(latest.id) !== lastSeenId
            ) {
              setPaymentNotification({ status: latest.status, plan: latest.plan, id: latest.id });
            }
          }
        } catch (err) {}
      };

      fetchPlan();
      fetchPayment();
      
      // Load team members if agency
      const plan = lookupUserPlan(emailToUse);
      if (plan.plan === 'agency') {
        const savedTeam = localStorage.getItem(`outreachpro_team_${emailToUse}`);
        if (savedTeam) setTeamMembers(JSON.parse(savedTeam));
      }

      const interval = setInterval(() => {
        fetchPlan();
        fetchPayment();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [config.user, sessionUser, isMounted]);

  const isManualHost = useRef(false);

  // Permanent Solution: Smart SMTP Detection via DNS
  useEffect(() => {
    const user = config.user.toLowerCase();
    if (!user.includes('@') || user.split('@')[1].length < 3) return;
    if (isManualHost.current) return; // Don't overwrite if user manually changed it

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/detect-smtp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user })
        });
        const data = await res.json();
        if (data.host) {
          setConfig(prev => ({ ...prev, host: data.host, port: data.port }));
        }
      } catch (err) {
        console.error("Auto-detect failed", err);
      }
    }, 1000); // Debounce to avoid too many DNS lookups

    return () => clearTimeout(timer);
  }, [config.user]);

  const [isTesting, setIsTesting] = useState(false);
  const testConnection = async () => {
    if (!config.user || !config.pass) {
      showToast("Enter credentials first", "error");
      return;
    }
    setIsTesting(true);
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, testOnly: true })
      });
      const result = await res.json();
      if (res.ok) showToast("Connection Successful!", "success");
      else throw new Error(result.message);
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsTesting(false);
    }
  };
  const [showPrompt, setShowPrompt] = useState<{ title: string, onConfirm: (val: string) => void } | null>(null);
  const [promptValue, setPromptValue] = useState("");

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setNotification(null), 10000);
  };

  const isConfigLoaded = useRef(false);
  const isDataLoaded = useRef(false);

  useEffect(() => {
    // Only load if sessionUser is determined (either an email or 'guest')
    const userKey = sessionUser || 'guest';

    // Reset load flags so saves don't fire mid-load
    isConfigLoaded.current = false;
    isDataLoaded.current = false;

    const loadAll = async () => {
      // --- Templates (IndexedDB) ---
      const savedTemplates = await loadUserData<typeof PREBUILT_TEMPLATES>(userKey, 'email_automator_templates');
      if (savedTemplates && savedTemplates.length > 0) {
        const parsed: any[] = savedTemplates;
        setTemplates(parsed);
        setActiveTemplateId(parsed[0]?.id || 'default');
        setTemplate(parsed[0]?.body || '');
        setSubject(parsed[0]?.subject || '');
      } else {
        // Default templates for new user
        const defaults = PREBUILT_TEMPLATES.map((t, i) => ({ ...t, id: i.toString() }));
        setTemplates(defaults);
        setActiveTemplateId('0');
        setTemplate(PREBUILT_TEMPLATES[0].body);
        setSubject(PREBUILT_TEMPLATES[0].subject);
      }

      // --- CSV Lead Data (IndexedDB) ---
      const savedData = await loadUserData<EmailData[]>(userKey, 'email_automator_data');
      if (savedData && savedData.length > 0) {
        setData(savedData);
        setStatuses(savedData.map((d: EmailData) => ({ email: d['Email'], status: 'pending' as const })));
      } else {
        setData([]);
        setStatuses([]);
      }

      // --- Filename (IndexedDB) ---
      const savedFileName = await loadUserData<string>(userKey, 'email_automator_filename');
      setUploadedFileName(savedFileName || '');

      // --- Config (localStorage — small, needs to be sync-fast) ---
      const savedConfig = localStorage.getItem(`email_automator_config_saas_final_${userKey}`);
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed.senderName === 'Arslan | OutreachPro') parsed.senderName = '';
        const loggedUser = sessionStorage.getItem('outreachpro_session');
        if (loggedUser) parsed.user = loggedUser;
        setConfig(parsed);
      } else {
        const loggedUser = sessionStorage.getItem('outreachpro_session');
        if (loggedUser) {
          setConfig(prev => ({ ...prev, user: loggedUser }));
        }
      }

      // Mark as loaded so saves can safely fire
      setTimeout(() => {
        isConfigLoaded.current = true;
        isDataLoaded.current = true;
      }, 100);
    };

    loadAll();
  }, [sessionUser]); // Reload whenever user changes

  useEffect(() => {
    const usageKey = `outreachpro_usage_${sessionUser || 'guest'}`;
    const savedUsage = localStorage.getItem(usageKey);
    if (savedUsage) {
      const { date, count } = JSON.parse(savedUsage);
      const today = new Date().toISOString().split('T')[0];
      if (date === today) {
        setDailyUsage(count);
        setLastSentDate(date);
      } else {
        setDailyUsage(0);
        setLastSentDate(today);
      }
    } else {
      setLastSentDate(new Date().toISOString().split('T')[0]);
    }

    // Load monthly usage
    const thisMonth = new Date().toISOString().slice(0, 7);
    const mKey = `outreachpro_monthly_${sessionUser || 'guest'}`;
    const savedMonthly = localStorage.getItem(mKey);
    if (savedMonthly) {
      const { month, count } = JSON.parse(savedMonthly);
      if (month === thisMonth) {
        setMonthlyUsage(count);
        setLastSentMonth(month);
      } else {
        setMonthlyUsage(0);
        setLastSentMonth(thisMonth);
      }
    } else {
      setLastSentMonth(thisMonth);
    }
  }, [sessionUser]);

  useEffect(() => {
    if (isConfigLoaded.current) {
      const userKey = sessionUser || 'guest';
      localStorage.setItem(`email_automator_config_saas_final_${userKey}`, JSON.stringify(config));
    }
  }, [config, sessionUser]);

  useEffect(() => {
    if (isDataLoaded.current) {
      const userKey = sessionUser || 'guest';
      // IndexedDB via localforage — no size limit worries!
      saveUserData(userKey, 'email_automator_data', data);
    }
  }, [data, sessionUser]);

  useEffect(() => {
    // Fetch campaign history from Django (scoped to the logged-in user via email)
    if (sessionUser) {
      apiFetch(`/campaigns/?email=${encodeURIComponent(sessionUser)}`)
        .then((data) => setCampaignHistory(data))
        .catch(() => {
          const savedHistory = localStorage.getItem('outreachpro_campaign_history');
          if (savedHistory) setCampaignHistory(JSON.parse(savedHistory));
        });

      apiFetch(`/users/?owner=${encodeURIComponent(sessionUser)}`)
        .then((data) => setTeamMembers(data))
        .catch(() => {
          const savedTeam = localStorage.getItem(`outreachpro_team_${sessionUser}`);
          if (savedTeam) setTeamMembers(JSON.parse(savedTeam));
        });
    } else {
      const savedHistory = localStorage.getItem('outreachpro_campaign_history');
      if (savedHistory) setCampaignHistory(JSON.parse(savedHistory));
      const savedTeam = localStorage.getItem(`outreachpro_team_${sessionUser || 'guest'}`);
      if (savedTeam) setTeamMembers(JSON.parse(savedTeam));
    }
  }, [sessionUser]);

  // No longer saving campaignHistory to localStorage — Django handles it now
  // useEffect(() => {
  //   localStorage.setItem('outreachpro_campaign_history', JSON.stringify(campaignHistory));
  // }, [campaignHistory]);

  useEffect(() => {
    localStorage.setItem('outreachpro_team', JSON.stringify(teamMembers));
  }, [teamMembers]);

  // Sync editor back to templates array and save to IndexedDB
  useEffect(() => {
    if (activeTemplateId) {
      setTemplates(prev => {
        const next = prev.map(t => t.id === activeTemplateId ? { ...t, body: template, subject: subject } : t);
        const userKey = sessionUser || 'guest';
        saveUserData(userKey, 'email_automator_templates', next);
        return next;
      });
    }
  }, [template, subject, activeTemplateId, sessionUser]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const XLSX = await import('xlsx');
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(ws) as any[];
        
        const cleanedData = jsonData.map(row => {
          const newRow: any = {};
          Object.keys(row).forEach(key => {
            const lowKey = key.toLowerCase().trim();
            const val = row[key];
            if (lowKey.includes('business') || lowKey.includes('company')) newRow['Business Name'] = val;
            else if (lowKey.includes('location')) newRow['Location Name'] = val;
            else if (lowKey.includes('first')) newRow['First Name'] = val;
            else if (lowKey.includes('last')) newRow['Last Name'] = val;
            else if (lowKey.includes('email')) newRow['Email'] = typeof val === 'string' ? val.trim() : (val?.text || val);
            else newRow[key] = val;
          });
          return newRow as EmailData;
        }).filter(row => row['Email']);

        // Check if the uploaded file exceeds the user's plan limit
        if (userPlan.emailLimit !== -1 && cleanedData.length > userPlan.emailLimit) {
          showToast(`Plan limit exceeded: Your ${PLAN_LABELS[userPlan.plan]} plan allows a maximum of ${userPlan.emailLimit} leads per campaign. This file contains ${cleanedData.length}.`, 'error');
          if (fileInputRef.current) fileInputRef.current.value = ''; // Reset the file input
          return;
        }

        setData(cleanedData);
        setStatuses(cleanedData.map(d => ({ email: d['Email'], status: 'pending' as const })));
        setUploadedFileName(file.name);
        const userKey = sessionUser || 'guest';
        saveUserData(userKey, 'email_automator_filename', file.name);
        showToast(`✅ ${cleanedData.length} leads loaded from "${file.name}"`, 'success');
      } catch (err) { showToast("Error parsing file. Make sure it's a valid CSV or Excel file.", 'error'); }
    };
    reader.readAsArrayBuffer(file);
  };

  const fillTemplate = (text: string, row: EmailData) => {
    let parsedText = text.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/&nbsp;/g, ' ');

    // Match {{...}} or {...} containing anything except other braces
    parsedText = parsedText.replace(/\{{1,2}([^{}]+)\}{1,2}/g, (match, inner) => {
      // 1. Strip HTML tags from the inner content in case WYSIWYG injected a <span> or <b>
      let cleanInner = inner.replace(/<[^>]*>/g, '').trim().toLowerCase();

      // 2. Handle standard variables
      if (cleanInner === 'first_name' || cleanInner === 'first name') return row['First Name'] || '[First Name]';
      if (cleanInner === 'last_name' || cleanInner === 'last name') return row['Last Name'] || '[Last Name]';
      if (cleanInner === 'business_name' || cleanInner === 'business name' || cleanInner === 'company_name' || cleanInner === 'company name') return row['Business Name'] || '[Business Name]';
      if (cleanInner === 'location_name' || cleanInner === 'location name') return row['Location Name'] || '[Location Name]';

      // 3. Handle custom columns
      for (const key of Object.keys(row)) {
        if (key === 'Email') continue;
        const normalizedKey = key.toLowerCase().trim();
        const snakeKey = normalizedKey.replace(/\s+/g, '_');
        if (cleanInner === normalizedKey || cleanInner === snakeKey) {
          return row[key] || '';
        }
      }

      // 4. Handle Spintax
      if (cleanInner.includes('|')) {
        const list = inner.split('|'); // Use original inner (with HTML) for spintax choices!
        return list[Math.floor(Math.random() * list.length)];
      }

      // 5. If it matches nothing, leave it alone (e.g. might be legitimate CSS)
      return match;
    });

    return parsedText;
  };

  // ── Email Sender Hook ─────────────────────────────────────────────────────
  const {
    isSending,
    isStopped,
    sendAllEmails,
    continueSending,
    stopSending,
    resetSendState,
  } = useEmailSender({
    data,
    statuses,
    setStatuses,
    config,
    subject,
    template,
    attachments,
    userPlan,
    sessionUser,
    dailyUsage,
    monthlyUsage,
    setDailyUsage,
    setMonthlyUsage,
    setCampaignHistory,
    campaignHistory,
    fillTemplate,
    delay,
    showToast,
  });

  // ── Lead Generation Hook ──────────────────────────────────────────────────
  const {
    leadCategory, setLeadCategory,
    leadLocation, setLeadLocation,
    leadLimit, setLeadLimit,
    leadMinRating, setLeadMinRating,
    leadOnlyWebsite, setLeadOnlyWebsite,
    leadOnlyEmail, setLeadOnlyEmail,
    sourceMode, setSourceMode,

    generatedLeads,
    filteredLeads,
    qualityFilter, setQualityFilter,
    emailStatusFilter, setEmailStatusFilter,
    selectedLeadIds, setSelectedLeadIds,

    isGenerating,
    generationProgress,
    isEnriching,
    enrichmentProgress,
    isVerifying,
    verificationProgress,

    handleGenerateLeads,
    handleCancelGeneration,
    handleEnrichLeads,
    handleVerifyLeads,
    handleExportLeads,
    handlePushToCampaign,
    
    handleSelectAll,
    handleSelectLead,
  } = useLeadGen({
    userPlan,
    sessionUser,
    monthlyLeadUsage,
    setMonthlyLeadUsage,
    setData,
    setStatuses,
    setUploadedFileName,
    setActiveTab,
    showToast,
  });



  return (
    <div className="min-h-screen text-text-base transition-colors duration-300" suppressHydrationWarning>
      <div className="hero-gradient fixed inset-0 pointer-events-none" />
      
      {/* Navigation */}
      <motion.nav 
        initial={{ y: -20, opacity: 0 }} 
        animate={{ y: 0, opacity: 1 }} 
        transition={{ duration: 0.5 }}
        className="sticky top-0 z-50 border-b border-border-base bg-bg-nav backdrop-blur-lg"
      >
        <div className="container-saas h-20 flex items-center justify-between px-4 md:px-6">
          <motion.div className="flex items-center gap-3" whileHover={{ scale: 1.02 }} transition={{ type: 'spring', stiffness: 400 }}>
            <motion.div 
              className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center"
              whileHover={{ rotate: [0, -10, 10, 0], scale: 1.1 }}
              transition={{ duration: 0.4 }}
            >
              <Zap size={20} className="text-black" />
            </motion.div>
            <div className="flex flex-col leading-none">
              <span className="font-black text-text-base tracking-tight text-base">OutreachPro</span>
              <span className="text-[9px] font-bold text-text-muted uppercase tracking-[0.2em]">by A&S Solution</span>
            </div>
          </motion.div>

          {/* Mobile Menu Toggle */}
          <div className="flex md:hidden items-center gap-3">
            <ThemeToggle />
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-text-muted hover:text-text-base transition-colors"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          <div className="hidden md:flex items-center space-x-6">
            <div className="flex items-center space-x-8 pr-4 border-r border-border-base" suppressHydrationWarning>
              {['Home', 'Pricing', 'Contact Us'].map((item, i) => (
                <motion.a
                  key={item}
                  suppressHydrationWarning
                  href={item === 'Contact Us' ? '/contact' : item === 'Pricing' ? '/pricing' : '/'}
                  className="text-sm font-medium text-text-muted hover:text-text-base transition-colors"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                >
                  {item}
                </motion.a>
              ))}
              {isMounted && sessionUser && (
                <motion.a
                  href="/billing"
                  className="relative text-sm font-medium text-text-muted hover:text-text-base transition-colors"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  Billing
                  {paymentNotification && (
                    <span className={`absolute -top-1 -right-2.5 w-2 h-2 rounded-full animate-pulse ${
                      paymentNotification.status === 'accepted' ? 'bg-emerald-400' : 'bg-red-400'
                    }`} />
                  )}
                </motion.a>
              )}
            </div>

            <ThemeToggle />

            {isMounted && sessionUser ? (
              <div className="flex items-center gap-4" suppressHydrationWarning>
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
                <button onClick={() => { sessionStorage.removeItem('outreachpro_session'); setSessionUser(null); }} className="text-sm font-medium text-text-muted hover:text-text-base flex items-center gap-2 transition-colors">
                  <LogOut size={16} />
                </button>
              </div>
            ) : isMounted ? (
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
            ) : null}
            {sessionUser ? (
              <motion.button 
                onClick={() => document.getElementById('tool')?.scrollIntoView()} 
                className="btn-saas"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
              >
                Launch Engine
              </motion.button>
            ) : null}
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden border-t border-border-base bg-bg-base overflow-hidden"
            >
              <div className="flex flex-col p-6 gap-6">
                {['Home', 'Pricing', 'Contact Us'].map((item) => (
                  <a
                    key={item}
                    href={item === 'Contact Us' ? '/contact' : item === 'Pricing' ? '/pricing' : '/'}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="text-lg font-bold text-text-muted hover:text-text-base transition-colors flex items-center justify-between"
                  >
                    {item}
                    <ArrowRight size={16} />
                  </a>
                ))}
                {sessionUser ? (
                  <button 
                    onClick={() => {
                      document.getElementById('tool')?.scrollIntoView();
                      setIsMobileMenuOpen(false);
                    }} 
                    className="btn-saas w-full py-4 text-base"
                  >
                    Launch Engine
                  </button>
                ) : (
                  <Link href="/auth">
                    <button className="btn-saas w-full py-4 text-base">
                      Log In / Sign Up
                    </button>
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>
      
      {/* Premium Scrolling Ticker */}
      <div className="relative z-40 bg-primary/5 border-b border-border-base py-2 overflow-hidden flex items-center">
        <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-bg-base to-transparent z-10" />
        <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-bg-base to-transparent z-10" />
        
        <motion.div 
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="flex whitespace-nowrap gap-8 md:gap-12"
        >
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 md:gap-4">
              <span className="text-[9px] md:text-[10px] font-black text-primary uppercase tracking-[0.3em] md:tracking-[0.4em]">
                Made by A&S solution for email marketing
              </span>
              <div className="w-1 h-1 rounded-full bg-primary/40" />
              <Zap size={10} className="text-primary/40" />
              <div className="w-1 h-1 rounded-full bg-primary/40" />
            </div>
          ))}
        </motion.div>
      </div>

      {/* Hero */}
      <header className="pt-12 pb-12 md:pt-24 md:pb-20 relative overflow-hidden" suppressHydrationWarning>
        <div className="container-saas grid lg:grid-cols-2 gap-10 lg:gap-20 items-center !overflow-visible">
          <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}>
            <motion.div 
              className="badge-saas mb-6 inline-flex"
              animate={{ boxShadow: ['0 0 0px rgba(79,70,229,0)', '0 0 20px rgba(79,70,229,0.4)', '0 0 0px rgba(79,70,229,0)'] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              suppressHydrationWarning
            >
              {isMounted ? 'v5.0 PERFORMANCE UPDATE' : 'SYSTEM LOADING'}
            </motion.div>
            <h1 className="text-3xl md:text-5xl lg:text-7xl font-bold text-text-base leading-[1.1] mb-6 md:mb-8 text-center lg:text-left">
              <motion.span initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }} className="block">
                Enterprise Grade
              </motion.span>
              <motion.span initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.6 }} className="block text-primary">
                Email Automation
              </motion.span>
            </h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="text-base md:text-lg text-text-muted mb-8 md:mb-10 max-w-lg leading-relaxed text-center lg:text-left mx-auto lg:mx-0">
              Automate your business growth with our precision-engineered email delivery system. Built for speed, reliability, and high conversion.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="flex flex-wrap items-center justify-center lg:justify-start gap-6">
              <motion.button 
                onClick={() => document.getElementById('tool')?.scrollIntoView()} 
                className="btn-saas text-base px-8 py-4 group"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
              >
                Start Campaign <ArrowRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />
              </motion.button>
              <div className="flex items-center gap-3 text-sm text-text-muted">
                <ShieldCheck size={18} className="text-emerald-500" /> Infrastructure Secured
              </div>
            </motion.div>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }} 
            animate={{ opacity: 1, scale: 1, y: 0 }} 
            transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }} 
            className="relative"
          >
            {/* Background glow */}
            <motion.div 
              className="absolute inset-0 bg-emerald-500/10 blur-[100px] rounded-full"
              animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
            
            {/* Main Dashboard Image */}
            <motion.div 
              className="relative z-10 w-full rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(16,185,129,0.15)] border border-emerald-500/20 aspect-[4/3] md:aspect-video bg-bg-card"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Image 
                src="/hero_dashboard_mockup.png" 
                alt="OutreachPro Automation Dashboard"
                fill
                priority
                className="object-cover opacity-95 hover:opacity-100 transition-opacity duration-500" 
              />
            </motion.div>

            {/* Floating Animated UI Element 1: Leads Extracted */}
            <motion.div 
              className="absolute -left-6 top-1/4 z-20 bg-bg-card/90 backdrop-blur-md border border-border-base shadow-xl rounded-xl p-3 md:p-4 flex items-center gap-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0, y: [0, -10, 0] }}
              transition={{ 
                opacity: { delay: 1, duration: 0.5 },
                x: { delay: 1, duration: 0.5 },
                y: { duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }
              }}
            >
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                <Users size={18} />
              </div>
              <div>
                <p className="text-[10px] md:text-xs text-text-muted font-bold uppercase tracking-wider">Leads Found</p>
                <p className="text-sm md:text-base font-black text-text-base">+12,450</p>
              </div>
            </motion.div>

            {/* Floating Animated UI Element 2: Delivery Rate */}
            <motion.div 
              className="absolute -right-6 bottom-1/4 z-20 bg-bg-card/90 backdrop-blur-md border border-border-base shadow-xl rounded-xl p-3 md:p-4 flex items-center gap-3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0, y: [0, 10, 0] }}
              transition={{ 
                opacity: { delay: 1.2, duration: 0.5 },
                x: { delay: 1.2, duration: 0.5 },
                y: { duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }
              }}
            >
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-500">
                <Send size={18} />
              </div>
              <div>
                <p className="text-[10px] md:text-xs text-text-muted font-bold uppercase tracking-wider">Delivery Rate</p>
                <p className="text-sm md:text-base font-black text-text-base">99.8%</p>
              </div>
            </motion.div>

          </motion.div>
        </div>
      </header>

      {/* Features Grid */}
      <section id="how-it-works" className="py-16 md:py-24 border-y border-border-base bg-bg-card/40" suppressHydrationWarning>
        <div className="container-saas">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
            {[
              { icon: <Globe />, title: 'Global Grid', desc: 'Surgical delivery across every major email provider.' },
              { icon: <Layout />, title: 'Smart Parser', desc: 'Instant Excel data cleaning and field mapping.' },
              { icon: <PieChart />, title: 'Live Monitor', desc: 'Monitor your transmission status in real-time.' },
              { icon: <Users />, title: 'Liquid Vars', desc: 'Advanced variable engine for 1:1 human outreach.' },
            ].map((f, i) => (
              <motion.div 
                key={i} 
                className="space-y-4 cursor-default"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                whileHover={{ y: -4 }}
              >
                <motion.div 
                  className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary"
                  whileHover={{ scale: 1.15, backgroundColor: 'rgba(16,185,129,0.2)' }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  {f.icon}
                </motion.div>
                <h3 className="font-bold text-text-base uppercase text-xs tracking-widest">{f.title}</h3>
                <p className="text-sm text-text-muted leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Gmail Setup Guide */}
      <section className="py-24 bg-bg-card/20 border-b border-border-base" suppressHydrationWarning>
        <div className="container-saas">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="badge-saas mb-6 inline-flex border-emerald-500/20 text-emerald-500" suppressHydrationWarning>
                {isMounted ? 'SETUP GUIDE' : 'LOADING GUIDE'}
              </div>
              <h2 className="text-xl md:text-4xl font-bold text-text-base mb-6 uppercase tracking-tight leading-tight">
                How to Connect <br /><span className="text-primary">Your Gmail Account</span>
              </h2>
              <p className="text-text-muted mb-10 leading-relaxed max-w-md">
                For security, Google requires an <span className="text-text-base font-bold underline decoration-primary underline-offset-4">App Password</span> to connect external tools. Your master password will not work.
              </p>
              
              <div className="space-y-4">
                {[
                  { step: '01', title: 'Enable 2-Step Verification', desc: 'Visit your Google Account Security settings and ensure 2FA is active.' },
                  { step: '02', title: 'Generate App Password', desc: 'Search for "App Passwords", select "Other", and type "OutreachPro".' },
                  { step: '03', title: 'Copy & Paste Secure Key', desc: 'Copy the 16-character code and paste it into the Secure Key field below.' },
                ].map((s, i) => (
                  <motion.div 
                    key={i} 
                    className="relative flex gap-6 p-5 rounded-2xl bg-white dark:bg-white/5 border border-border-base hover:border-primary/40 hover:bg-emerald-50/50 dark:hover:bg-white/10 transition-all duration-300 cursor-default group shadow-sm hover:shadow-lg hover:shadow-primary/10 overflow-hidden"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    whileHover={{ scale: 1.02, x: 5 }}
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary scale-y-0 group-hover:scale-y-100 transition-transform origin-top duration-300 ease-out" />
                    
                    <span className="text-3xl font-black text-slate-200 dark:text-white/10 group-hover:text-primary transition-colors duration-300">{s.step}</span>
                    <div className="relative z-10">
                      <h4 className="font-bold text-text-base mb-1 tracking-wide group-hover:text-primary transition-colors duration-300">{s.title}</h4>
                      <p className="text-xs text-text-muted leading-relaxed">{s.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.div 
                className="mt-8 p-4 rounded-xl bg-primary/5 border border-primary/10"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Globe size={12} className="text-primary" />
                  <span className="text-[10px] font-black text-text-base uppercase tracking-widest">Business Emails</span>
                </div>
                <p className="text-[10px] text-text-muted leading-relaxed italic">
                  If you are using a <b>Custom Domain</b> (e.g., name@yourcompany.com) from Hostinger, Namecheap, or Outlook, you should typically use your <b>Standard Account Password</b>. App Passwords are primarily a Google-specific security requirement.
                </p>
              </motion.div>
            </motion.div>
            
            <motion.div 
              className="relative p-1 rounded-[2.5rem] bg-gradient-to-br from-primary/20 to-transparent shadow-2xl"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <div className="relative z-10 rounded-[2.2rem] overflow-hidden bg-[#18181b] border border-border-base aspect-square lg:aspect-square flex items-center justify-center p-4 md:p-8">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
                <div className="relative z-20 text-center">
                  <div className="w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-6 border border-primary/20 shadow-inner">
                    <ShieldCheck size={48} className="text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-text-base mb-3">Enterprise Security</h3>
                  <p className="text-xs text-text-muted max-w-[240px] mx-auto leading-relaxed">
                    Your credentials never leave your browser. All transmissions are encrypted via industry-standard TLS protocols.
                  </p>
                </div>
                
                {/* Decorative Elements */}
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/10 blur-[80px] rounded-full pointer-events-none" />
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Main Workspace */}
      <main id="tool" className="py-32 container-saas" suppressHydrationWarning>
        <motion.div 
          className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-24 max-w-6xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div>
            <h2 className="text-xl md:text-5xl font-bold text-text-base mb-6 tracking-tight uppercase text-center md:text-left">Campaign Command Center</h2>
            <p className="text-text-muted text-base md:text-lg text-center md:text-left">Configure your transmission gateway and deploy your outreach sequence from a single professional workspace.</p>
          </div>
          
          <div className="flex flex-col items-center md:items-end gap-1">
            <div className="flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-slate-100 dark:bg-white/5 border border-border-base backdrop-blur-md shadow-2xl" suppressHydrationWarning>
              <Globe size={16} className="text-indigo-400 animate-pulse" />
              <div className="flex flex-col">
                <span className="text-[14px] font-black text-text-base tabular-nums tracking-wider uppercase">
                  {isMounted ? currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
                </span>
                <span className="text-[9px] font-bold text-text-muted uppercase tracking-[0.2em]">
                  {isMounted ? currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Syncing Pulse...'}
                </span>
              </div>
            </div>
            <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mr-2">System Pulse: Online</p>
          </div>
        </motion.div>

        {!sessionUser && isMounted ? (
          <div className="flex flex-col items-center justify-center py-24 px-6 bg-slate-100 dark:bg-white/5 border border-border-base rounded-3xl text-center shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
            <div className="w-24 h-24 rounded-3xl bg-indigo-500/20 flex items-center justify-center mb-6 shadow-xl shadow-indigo-500/10 relative z-10 border border-indigo-500/20">
              <Lock size={40} className="text-indigo-400" />
            </div>
            <h3 className="text-3xl md:text-4xl font-black text-text-base mb-4 relative z-10">Access Restricted</h3>
            <p className="text-text-muted mb-8 max-w-md relative z-10 leading-relaxed text-sm md:text-base">
              Please sign in or create a free account to unlock the Campaign Command Center and start launching automated outreach.
            </p>
            <Link href="/auth" className="relative z-10">
              <motion.button 
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                className="px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm transition-all shadow-lg shadow-indigo-500/25 flex items-center gap-2"
              >
                <Lock size={16} /> Log In / Sign Up <ArrowRight size={16} />
              </motion.button>
            </Link>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Tab Navigation */}
            <div className="flex flex-wrap items-center gap-4 border-b border-border-base pb-6">
              {[
                { id: 'campaign', label: 'Launch Engine', icon: <Zap size={14} />, premium: false },
                { id: 'leads', label: 'Lead Gen', icon: <Search size={14} />, premium: false },
                { id: 'analytics', label: 'Intelligence', icon: <PieChart size={14} />, premium: userPlan.plan === 'free' },
                { id: 'team', label: 'Team Force', icon: <Users size={14} />, premium: userPlan.plan !== 'agency' },
              ].map(t => (
                <button 
                  key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all relative ${activeTab === t.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-100 dark:bg-white/5 text-text-muted hover:bg-slate-200 dark:hover:bg-white/10 hover:text-text-base'}`}
                >
                  {t.icon} {t.label}
                  {t.premium && <Crown size={10} className="ml-1 text-amber-500" />}
                </button>
              ))}
            </div>

            {activeTab === 'campaign' ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Sidebar Config */}
          <motion.aside 
            className="lg:col-span-4 space-y-8"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            {/* Account Intelligence */}
            <motion.div 
              className={`card-saas border-l-4 ${PLAN_COLORS[userPlan.plan].split(' ')[2]} border-opacity-50`}
              whileHover={{ y: -2 }}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Crown size={18} className="text-indigo-400" />
                  <h3 className="font-bold text-text-base text-xs uppercase tracking-wider">Account Pulse</h3>
                </div>
                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${PLAN_COLORS[userPlan.plan]}`}>
                  {PLAN_LABELS[userPlan.plan]}
                </span>
              </div>
              
              <div className="space-y-4">
                {/* Campaign Transmission Limit */}
                {(() => {
                  const used = data.length;
                  const limit = userPlan.emailLimit;
                  const pct = limit === -1 ? 100 : Math.min(100, (used / limit) * 100);
                  const remaining = limit === -1 ? '∞' : Math.max(0, limit - used);
                  const danger = limit !== -1 && used >= limit;
                  return (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                        <span className="text-text-muted">Campaign Limit</span>
                        <span className={danger ? 'text-red-400' : 'text-text-base'}>
                          {limit === -1 ? '∞ Unlimited' : `${used} / ${limit}`}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full transition-all duration-700 ${danger ? 'bg-red-500' : pct > 75 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </div>
                      <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest text-right">
                        {limit === -1 ? 'No limit on this plan' : danger ? '⚠ Limit reached' : `${remaining} slots remaining`}
                      </p>
                    </div>
                  );
                })()}

                {/* Daily Fuel */}
                {(() => {
                  const used = dailyUsage;
                  const limit = userPlan.dailyLimit;
                  const pct = limit === -1 ? Math.min(100, (used / 100) * 100) : Math.min(100, (used / limit) * 100);
                  const remaining = limit === -1 ? '∞' : Math.max(0, limit - used);
                  const danger = limit !== -1 && used >= limit;
                  const warning = limit !== -1 && pct > 75 && !danger;
                  return (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                        <span className="text-text-muted">Daily Fuel</span>
                        <span className={danger ? 'text-red-400' : warning ? 'text-amber-400' : 'text-text-base'}>
                          {limit === -1 ? `${used} sent (∞)` : `${used} / ${limit}`}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full transition-all duration-1000 ${danger ? 'bg-red-500' : warning ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </div>
                      <p className="text-[8px] font-bold uppercase tracking-widest text-right" style={{ color: danger ? 'rgb(248,113,113)' : warning ? 'rgb(251,191,36)' : 'rgb(100,116,139)' }}>
                        {limit === -1 ? 'Unlimited daily sending' : danger ? '⚠ Daily cap reached — resets tomorrow' : `${remaining} emails remaining today`}
                      </p>
                    </div>
                  );
                })()}

                {/* Monthly Fuel */}
                {(() => {
                  const used = monthlyUsage;
                  const limit = userPlan.monthlyLimit;
                  const pct = limit === -1 ? Math.min(100, (used / 1000) * 100) : Math.min(100, (used / limit) * 100);
                  const remaining = limit === -1 ? '∞' : Math.max(0, limit - used);
                  const danger = limit !== -1 && used >= limit;
                  const warning = limit !== -1 && pct > 75 && !danger;
                  return (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                        <span className="text-text-muted">Monthly Fuel</span>
                        <span className={danger ? 'text-red-400' : warning ? 'text-amber-400' : 'text-text-base'}>
                          {limit === -1 ? `${used} sent (∞)` : `${used} / ${limit}`}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full transition-all duration-1000 ${danger ? 'bg-red-500' : warning ? 'bg-amber-500' : 'bg-sky-500'}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </div>
                      <p className="text-[8px] font-bold uppercase tracking-widest text-right" style={{ color: danger ? 'rgb(248,113,113)' : warning ? 'rgb(251,191,36)' : 'rgb(100,116,139)' }}>
                        {limit === -1 ? 'Unlimited monthly sending' : danger ? '⚠ Monthly cap reached' : `${remaining} emails remaining this month`}
                      </p>
                    </div>
                  );
                })()}

                {/* Sending progress during campaign */}
                {isSending && statuses.length > 0 && (() => {
                  const done = statuses.filter(s => s.status === 'success' || s.status === 'error').length;
                  const pct = Math.round((done / statuses.length) * 100);
                  return (
                    <div className="space-y-1.5 p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                        <span className="text-indigo-400 animate-pulse">⚡ Live Transmission</span>
                        <span className="text-indigo-400">{done} / {statuses.length}</span>
                      </div>
                      <div className="h-1.5 w-full bg-indigo-500/10 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-indigo-500 rounded-full"
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-white/3 border border-border-base">
                    <p className="text-[9px] font-bold text-text-muted uppercase mb-1">Templates</p>
                    <p className="text-sm font-black text-text-base">
                      {templates.length} <span className="text-text-muted font-medium">/ {userPlan.templateLimit === -1 ? '∞' : userPlan.templateLimit}</span>
                    </p>
                    {userPlan.templateLimit !== -1 && (
                      <div className="mt-1.5 h-0.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (templates.length / userPlan.templateLimit) * 100)}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="p-3 rounded-xl bg-white/3 border border-border-base">
                    <p className="text-[9px] font-bold text-text-muted uppercase mb-1">Attachments</p>
                    <p className={`text-sm font-black ${userPlan.attachments ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {userPlan.attachments ? '✓ Active' : '✗ Locked'}
                    </p>
                    <p className="text-[8px] text-text-muted mt-1">
                      {userPlan.attachments ? `${attachments.length} attached` : 'Upgrade to unlock'}
                    </p>
                  </div>
                </div>

                {/* Lead Gen Pulse */}
                {(() => {
                  const used = monthlyLeadUsage;
                  const limit = userPlan.leadGenLimit;
                  const pct = limit === -1 ? Math.min(100, (used / 1000) * 100) : Math.min(100, (used / limit) * 100);
                  const remaining = limit === -1 ? '∞' : Math.max(0, limit - used);
                  const danger = limit !== -1 && used >= limit;
                  const warning = limit !== -1 && pct > 75 && !danger;
                  return (
                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                        <span className="text-text-muted">Lead Gen Fuel</span>
                        <span className={danger ? 'text-red-400' : warning ? 'text-amber-400' : 'text-emerald-400'}>
                          {limit === -1 ? `${used} generated (∞)` : `${used} / ${limit}`}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full transition-all duration-1000 ${danger ? 'bg-red-500' : warning ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </div>
                      <p className="text-[8px] font-bold uppercase tracking-widest text-right" style={{ color: danger ? 'rgb(248,113,113)' : warning ? 'rgb(251,191,36)' : 'rgb(16,185,129)' }}>
                        {limit === -1 ? 'Unlimited monthly leads' : danger ? '⚠ Cap reached — upgrade to unlock more' : `${remaining} leads remaining this month`}
                      </p>
                    </div>
                  );
                })()}

                {userPlan.plan === 'agency' && (
                  <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Users size={12} className="text-amber-400" />
                        <p className="text-[9px] font-bold text-text-muted uppercase">Team Members</p>
                      </div>
                      <span className="text-[10px] font-black text-amber-500">
                        {teamMembers.length} / {userPlan.teamLimit === -1 ? '∞' : (userPlan.teamLimit || 5)}
                      </span>
                    </div>
                    <div className="h-1 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-amber-500 rounded-full"
                        animate={{ width: `${Math.min(100, (teamMembers.length / (userPlan.teamLimit === -1 ? 100 : (userPlan.teamLimit || 5))) * 100)}%` }}
                        transition={{ duration: 0.7 }}
                      />
                    </div>
                    <p className="text-[8px] text-amber-600 mt-1 uppercase tracking-widest">
                      {(userPlan.teamLimit || 5) - teamMembers.length} slots available
                    </p>
                  </div>
                )}

                {userPlan.expiresAt && (
                  <div className="pt-2 border-t border-border-base">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest text-center">
                      Plan Status: <span className={`${
                        userPlan.expiresAt.startsWith('2099') ? 'text-emerald-400' :
                        isMounted && (() => {
                          const diff = new Date(userPlan.expiresAt).getTime() - new Date().getTime();
                          return Math.ceil(diff / (1000 * 60 * 60 * 24));
                        })() <= 7 ? 'text-red-400' : 'text-text-muted'
                      }`}>
                        {userPlan.expiresAt.startsWith('2099') ? '✓ Lifetime Access' : (
                          isMounted ? (() => {
                            const diff = new Date(userPlan.expiresAt).getTime() - new Date().getTime();
                            const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
                            return days > 0 ? `${days} Days Remaining` : '⚠ Expired';
                          })() : 'Checking...'
                        )}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
            <motion.div className="card-saas border-indigo-500/10" whileHover={{ borderColor: 'rgba(79,70,229,0.2)', y: -2 }} transition={{ duration: 0.2 }}>
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <Settings size={18} className="text-primary" />
                  <h3 className="font-bold text-text-base text-xs uppercase tracking-wider">Infrastructure</h3>
                </div>
                <div className="flex gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${config.host.includes('.') ? 'bg-emerald-500' : 'bg-red-500/30'}`} title="Host Status" />
                  <div className={`w-1.5 h-1.5 rounded-full ${config.user.includes('@') ? 'bg-emerald-500' : 'bg-red-500/30'}`} title="Email Status" />
                  <div className={`w-1.5 h-1.5 rounded-full ${config.pass ? 'bg-emerald-500' : 'bg-red-500/30'}`} title="Key Status" />
                </div>
              </div>
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-muted uppercase block mb-1.5 ml-1">Gateway Host</label>
                    <input type="text" className="input-saas" value={config.host} onChange={e => { isManualHost.current = true; setConfig({...config, host: e.target.value}); }} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-muted uppercase block mb-1.5 ml-1">Port</label>
                    <input type="text" className="input-saas" value={config.port} onChange={e => { isManualHost.current = true; setConfig({...config, port: e.target.value}); }} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-muted uppercase block mb-1.5 ml-1">User Email</label>
                  <input 
                    type="email" 
                    className={`input-saas ${sessionUser ? 'opacity-50 cursor-not-allowed' : ''}`} 
                    placeholder="abc@gmail.com" aria-label="abc@gmail.com" 
                    value={config.user} 
                    onChange={e => !sessionUser && setConfig({...config, user: e.target.value})} 
                    disabled={!!sessionUser}
                    title={sessionUser ? "Email is locked to your account email" : ""}
                  />
                  {config.user && !config.user.endsWith('@gmail.com') && !config.user.endsWith('@outlook.com') && !config.user.endsWith('@hotmail.com') && !config.user.includes('hostinger') && (
                    <p className="text-[8px] text-amber-400 mt-2 font-medium bg-amber-500/5 p-2 rounded border border-amber-500/10">
                      <Globe size={8} className="inline mr-1" /> Custom domain detected. Please verify your <b>Gateway Host</b> manually if the auto-guess is incorrect.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold text-text-muted uppercase block mb-1.5 ml-1">App Password</label>
                    <div className="group relative">
                      <AlertCircle size={10} className="text-slate-600 cursor-help mb-1.5" />
                      <div className="absolute bottom-full left-0 mb-2 w-48 p-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-border-base text-[9px] text-text-muted leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-2xl">
                        <p className="font-bold text-text-base mb-1">Gmail / Outlook Users:</p>
                        Do NOT use your login password. Use an <span className="text-indigo-400">App Password</span> from your account security settings.
                      </div>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      className="input-saas pr-12" 
                      placeholder="••••••••••••" aria-label="••••••••••••" 
                      value={config.pass} 
                      onChange={e => setConfig({...config, pass: e.target.value})} 
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-base transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {config.user.toLowerCase().endsWith('@gmail.com') && (
                    <p className="text-[8px] text-indigo-400 mt-2 font-medium bg-indigo-500/5 p-2 rounded border border-indigo-500/10">
                      <Zap size={8} className="inline mr-1" /> Gmail requires a 16-character <b>App Password</b> from your Google Account settings.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-muted uppercase block mb-1.5 ml-1">Sender Identity</label>
                  <input type="text" className="input-saas" placeholder="Your Name | Business Name" aria-label="Your Name | Business Name" value={config.senderName} onChange={e => setConfig({...config, senderName: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center mb-1.5 ml-1">
                    <label className="text-[10px] font-bold text-text-muted uppercase">Transmission Speed</label>
                    <span className="text-[10px] font-black text-primary">{delay}s Delay</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="20" 
                    step="1"
                    value={delay} 
                    onChange={e => setDelay(parseInt(e.target.value))}
                    className="w-full accent-primary h-2 bg-black/20 dark:bg-white/20 border border-black/10 dark:border-white/10 rounded-lg appearance-none cursor-pointer hover:accent-primary-hover transition-all shadow-inner" 
                  />
                  <div className="flex justify-between text-[8px] text-text-muted font-bold uppercase mt-2">
                    <span>1s (Risky)</span>
                    <span>20s (Safe/Anti-Spam)</span>
                  </div>
                  <p className="text-[9px] text-text-muted italic mt-2 text-center">Higher delays are required to mimic human behavior and protect your email account from being permanently blocked for spamming.</p>
                </div>
                <div className="flex items-center gap-3 py-2 px-1">
                  <input 
                    type="checkbox" 
                    id="saveToSent"
                    checked={config.saveToSent ?? true} 
                    onChange={e => setConfig({...config, saveToSent: e.target.checked})}
                    className="w-3 h-3 rounded border-border-base bg-slate-100 dark:bg-white/5 text-primary focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="saveToSent" className="text-[9px] font-bold text-text-muted uppercase tracking-widest cursor-pointer select-none">Sync to Sent Folder (IMAP)</label>
                </div>

                <div className="bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 size={12} className="text-emerald-500" />
                    <span className="text-[9px] font-black text-text-base uppercase tracking-widest">Delivery Pro-Tip</span>
                  </div>
                  <p className="text-[8px] text-text-muted leading-relaxed">
                    If your test is successful but mail isn't appearing, check your <b>SPAM folder</b>. For custom domains (Hostinger), ensure your <b>SPF & DKIM records</b> are correctly set in your DNS settings to prevent silent rejection.
                  </p>
                </div>

                <div className="pt-4 flex flex-col sm:flex-row gap-3">
                  <button 
                    onClick={testConnection}
                    disabled={isTesting}
                    className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-border-base text-[10px] font-black text-text-muted uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/10 hover:text-text-base transition-all flex items-center justify-center gap-2"
                  >
                    {isTesting ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={14} className="text-emerald-500" />}
                    {isTesting ? "Verifying..." : "Test Connection"}
                  </button>
                  <button 
                    onClick={() => {
                      if(window.confirm('Are you sure you want to clear your saved credentials?')) {
                        setConfig(prev => ({ ...prev, pass: '', senderName: '', host: 'smtp.gmail.com', port: '465' }));
                        showToast('Credentials cleared successfully', 'info');
                      }
                    }}
                    className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-border-base text-[10px] font-black text-text-muted uppercase tracking-widest hover:bg-red-500/10 dark:hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 size={14} /> Clear Settings
                  </button>
                </div>
              </div>
            </motion.div>

            <motion.div 
              className="card-saas border-emerald-500/10"
              whileHover={{ borderColor: 'rgba(16,185,129,0.2)', y: -2 }}
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.15 }}
            >
              <div className="flex items-center gap-3 mb-8">
                <FileSpreadsheet size={18} className="text-emerald-500" />
                <h3 className="font-bold text-text-base text-xs uppercase tracking-wider">Target Leads</h3>
              </div>
              <div onClick={() => fileInputRef.current?.click()} className="upload-zone-saas py-10 group cursor-pointer relative">
                <Upload size={32} className="mx-auto mb-4 text-slate-600 group-hover:text-emerald-500 transition-colors" />
                <p className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-1">
                  {uploadedFileName ? `📄 ${uploadedFileName}` : 'Import CSV / XLSX'}
                </p>
                <p className="text-[9px] text-text-muted max-w-[200px] md:max-w-none mx-auto leading-relaxed">
                  {uploadedFileName ? 'Click to replace with a new file' : 'Auto-detects: Email, First Name, Last Name, Business, Location'}
                </p>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv,.xlsx,.xls" />
              </div>
              <div className="mt-4 text-center flex flex-col sm:flex-row justify-center gap-4">
                <a href="/sample_leads.csv" download onClick={(e) => e.stopPropagation()} className="text-[9px] text-primary hover:text-text-base font-bold tracking-widest uppercase transition-colors inline-block border-b border-primary/30 hover:border-white pb-0.5" suppressHydrationWarning>Download Sample CSV</a>
                <a href="/sample_leads.xlsx" download onClick={(e) => e.stopPropagation()} className="text-[9px] text-emerald-500 hover:text-text-base font-bold tracking-widest uppercase transition-colors inline-block border-b border-emerald-500/30 hover:border-white pb-0.5" suppressHydrationWarning>Download Sample Excel</a>
              </div>
              {data.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] flex-shrink-0" />
                      <div>
                        <span className="text-xs font-black text-emerald-400 uppercase tracking-widest block">
                          {data.length} Leads Active
                        </span>
                        <span className="text-[9px] text-text-muted">Saved · Persists across refreshes</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('Clear the saved lead list?')) {
                          setData([]);
                          setStatuses([]);
                          setUploadedFileName('');
                          const userKey = sessionUser || 'guest';
                          removeUserData(userKey, 'email_automator_data');
                          removeUserData(userKey, 'email_automator_filename');
                          if (fileInputRef.current) fileInputRef.current.value = '';
                          showToast('Lead list cleared', 'info');
                        }
                      }}
                      className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[9px] font-black text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all uppercase tracking-widest"
                    >
                      <Trash2 size={10} /> Clear
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </motion.aside>

          {/* Main Content */}
          <motion.div 
            className="lg:col-span-8 space-y-8"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="card-saas">
              <div className="flex flex-col gap-6 mb-10 pb-6 border-b border-border-base">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <Mail size={18} className="text-primary" />
                    <h3 className="font-bold text-text-base text-xs uppercase tracking-wider whitespace-nowrap">Email Blueprint</h3>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {templates.map(t => (
                      <div key={t.id} className="relative group/tab flex items-center">
                        <button 
                          onClick={() => {
                            setActiveTemplateId(t.id);
                            setTemplate(t.body);
                            setSubject(t.subject);
                          }}
                          className={`pl-3 pr-6 py-1.5 rounded-lg text-[9px] font-bold transition-all uppercase tracking-widest ${activeTemplateId === t.id ? 'bg-primary text-black' : 'bg-slate-100 dark:bg-white/5 text-text-muted hover:text-text-base'}`}
                        >
                          {t.name}
                        </button>
                        {templates.length > 1 && t.id !== '1' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const remaining = templates.filter(x => x.id !== t.id);
                              setTemplates(remaining);
                              if (activeTemplateId === t.id) {
                                setActiveTemplateId(remaining[0].id);
                                setTemplate(remaining[0].body);
                                setSubject(remaining[0].subject);
                              }
                              showToast(`"${t.name}" deleted`, 'info');
                            }}
                            className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/tab:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center text-[10px] text-text-muted hover:text-red-400 font-black"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button 
                      onClick={() => setShowTemplateLibrary(true)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white text-[9px] font-bold transition-all flex items-center gap-1.5"
                    >
                      <Layout size={10} /> Library {userPlan.plan === 'free' && <Crown size={10} className="text-amber-500" />}
                    </button>
                    <button 
                      onClick={() => {
                        const tplLimit = userPlan.templateLimit;
                        if (tplLimit !== -1 && templates.length >= tplLimit) {
                          showToast(`Your ${PLAN_LABELS[userPlan.plan]} plan allows max ${tplLimit} template(s). Upgrade to add more.`, 'error');
                          return;
                        }
                        setShowPrompt({
                          title: "New Template Name",
                          onConfirm: (name) => {
                            const newT = { id: Date.now().toString(), name, subject: '', body: '' };
                            setTemplates([...templates, newT]);
                            setActiveTemplateId(newT.id);
                            setTemplate('');
                            setSubject('');
                          }
                        });
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-text-base text-[9px] font-bold transition-all flex items-center gap-1.5"
                    >
                      + {userPlan.plan === 'free' && <Crown size={10} className="text-amber-500" />}
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {['first_name', 'business_name', 'location_name', 'industry', 'phone number'].map(t => (
                    <button key={t} onClick={() => setTemplate(template + ` {{${t}}}`)} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 border border-border-base text-[9px] font-bold text-text-muted hover:text-text-base transition-all uppercase tracking-widest">{t}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-8">
                <div className="space-y-2">
                   <label className="text-[10px] font-bold text-text-muted uppercase block mb-1.5 ml-1">Subject Line</label>
                   <input type="text" className="input-saas font-bold" placeholder="Enter your campaign subject..." aria-label="Enter your campaign subject..." value={subject} onChange={e => setSubject(e.target.value)} />
                </div>
                <div className="space-y-2">
                   <div className="flex justify-between items-center mb-1.5 ml-1">
                     <div className="flex items-center gap-2">
                       <Layout size={14} className="text-emerald-500" />
                       <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Email Body</label>
                     </div>
                      {userPlan.attachments ? (
                        <button onClick={() => attachInputRef.current?.click()} className="text-[10px] font-bold text-primary flex items-center gap-1 hover:text-text-base transition-colors">
                          <Paperclip size={12} /> Add Attachment
                        </button>
                      ) : (
                        <a href="/pricing">
                          <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1 cursor-pointer hover:text-amber-400 transition-colors" title="Upgrade to Starter or above">
                            <Crown size={12} className="text-amber-500" /> Attachments (Upgrade)
                          </span>
                        </a>
                      )}
                     <input type="file" multiple ref={attachInputRef} className="hidden" onChange={(e) => {
                       const files = Array.from(e.target.files || []);
                       files.forEach(file => {
                         const reader = new FileReader();
                         reader.readAsDataURL(file);
                         reader.onload = () => {
                           const base64 = reader.result?.toString().split(',')[1] || '';
                           setAttachments(prev => [...prev, { name: file.name, content: base64, type: file.type }]);
                         };
                       });
                     }} />
                   </div>
                   
                   {attachments.length > 0 && (
                     <div className="flex flex-wrap gap-2 mb-4 p-3 rounded-lg bg-slate-100 dark:bg-white/5 border border-border-base">
                       {attachments.map((att, i) => (
                         <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-medium border border-emerald-500/20">
                           <Paperclip size={10} />
                           <span className="truncate max-w-[150px]">{att.name}</span>
                           <button onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))} className="hover:text-red-400 ml-1"><Trash2 size={12} /></button>
                         </div>
                       ))}
                     </div>
                   )}

                   <div className="bg-slate-100 dark:bg-zinc-900/30 text-text-muted rounded-xl overflow-hidden min-h-[350px] border border-border-base 
                     [&_.rsw-editor]:!bg-transparent [&_.rsw-editor]:!border-none 
                     [&_.rsw-ce]:!min-h-[300px] [&_.rsw-ce]:!bg-transparent [&_.rsw-ce]:!text-text-base 
                     [&_.rsw-toolbar]:!border-b [&_.rsw-toolbar]:!border-border-base [&_.rsw-toolbar]:!bg-bg-base [&_.rsw-dd]:!bg-bg-base [&_.rsw-dd]:!border [&_.rsw-dd]:!border-border-base [&_.rsw-btn_svg]:!fill-text-muted [&_.rsw-btn_svg]:!text-text-muted
                     [&_li]:!text-text-muted hover:[&_li]:!bg-emerald-500/20 hover:[&_li]:!text-text-base"
                   >
                     <Editor value={template} onChange={(e) => setTemplate(e.target.value)} containerProps={{ style: { height: '350px', border: 'none', backgroundColor: 'transparent', color: 'var(--text-base)' } }} />
                   </div>
                </div>
              </div>
              <div className="mt-12 pt-12 border-t border-border-base">
                <div className="flex items-center gap-2 mb-6 text-[10px] font-bold text-text-muted uppercase tracking-widest">
                  <Eye size={14} className="text-primary" /> Real-time System Preview
                </div>
                <div className="text-sm text-text-muted leading-relaxed bg-slate-100 dark:bg-slate-100 dark:bg-slate-900/50 p-6 md:p-10 rounded-2xl border border-border-base break-words w-full" dangerouslySetInnerHTML={{__html: data.length > 0 ? fillTemplate(template, data[previewIndex]) : "Import a target list to initialize render engine..."}}>
                </div>
              </div>
            </div>

            {/* Launch Control */}
            <div className="flex flex-col items-center gap-10 py-16 w-full">
              <motion.div 
                className="flex flex-col items-center gap-4 w-full md:w-auto"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                  {/* Launch Button — hidden while stopped (Continue takes over) */}
                  {!isStopped && (
                    <motion.button 
                      onClick={data.length === 0 ? () => fileInputRef.current?.click() : sendAllEmails}
                      disabled={isSending}
                      className={`btn-saas w-full md:w-auto px-8 md:px-12 py-4 md:py-5 text-lg shadow-2xl uppercase tracking-widest transition-all ${
                        data.length === 0 
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-emerald-500/25' 
                          : 'shadow-indigo-500/20'
                      }`}
                      whileHover={!isSending ? { scale: 1.05, boxShadow: data.length === 0 ? '0 20px 25px -5px rgba(16,185,129,0.3)' : '0 20px 25px -5px rgba(79,70,229,0.3)' } : {}}
                      whileTap={!isSending ? { scale: 0.98 } : {}}
                    >
                      {isSending ? (
                        <Loader2 className="animate-spin" />
                      ) : data.length === 0 ? (
                        <Upload size={18} />
                      ) : (
                        <Send size={18} />
                      )}
                      {isSending ? 'Transmitting...' : data.length === 0 ? 'Upload Leads to Start' : 'Initiate Launch'}
                    </motion.button>
                  )}

                  {/* Continue button — shown only when stopped mid-campaign */}
                  {isStopped && !isSending && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={continueSending}
                      className="w-full md:w-auto px-8 py-4 md:py-5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-lg shadow-2xl shadow-emerald-500/20 uppercase tracking-widest flex items-center justify-center gap-3 transition-all"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Send size={22} /> Continue
                    </motion.button>
                  )}

                  {/* Stop button — shown while transmitting */}
                  {isSending && (
                    <motion.button 
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={stopSending}
                      className="w-full md:w-auto px-8 py-4 md:py-5 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-black text-lg shadow-2xl shadow-red-500/20 uppercase tracking-widest flex items-center justify-center gap-3 transition-all"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <X size={24} /> Stop
                    </motion.button>
                  )}
                </div>
                {data.length === 0 && !isSending && (
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest animate-pulse">
                    Please import a lead list to enable the campaign engine
                  </p>
                )}
              </motion.div>

              <AnimatePresence>
                {statuses.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full card-saas border-indigo-500/20 overflow-hidden">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-widest text-text-base mb-2">Transmission Monitor</h3>
                        <p className="text-[10px] font-medium text-text-muted">Delivered {statuses.filter(s => s.status === 'success').length} / {data.length} messages</p>
                      </div>
                      <div className="text-4xl md:text-5xl font-bold text-primary tabular-nums tracking-tighter">
                        {Math.round((statuses.filter(s => s.status === 'success').length / data.length) * 100)}%
                      </div>
                    </div>
                    {/* Status Legend */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-6 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-border-base">
                      <span className="text-[8px] font-black uppercase tracking-widest text-text-muted mr-1">Legend:</span>
                      <span className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-500">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] flex-shrink-0" />
                        Delivered
                      </span>
                      <span className="flex items-center gap-1.5 text-[9px] font-bold text-text-muted">
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
                        Sending…
                      </span>
                      <span className="flex items-center gap-1.5 text-[9px] font-bold text-amber-400">
                        <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)] flex-shrink-0" />
                        Invalid — Skipped
                      </span>
                      <span className="flex items-center gap-1.5 text-[9px] font-bold text-red-400">
                        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                        Send Failed
                      </span>
                      <span className="flex items-center gap-1.5 text-[9px] font-bold text-text-muted">
                        <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700 flex-shrink-0" />
                        Pending
                      </span>
                      <span className="ml-auto text-[8px] font-bold text-text-muted italic hidden sm:block">
                        ⚡ Invalid emails don't consume your daily/monthly fuel
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                      {statuses.map((s, i) => (
                        <div key={i} className="p-4 rounded-xl bg-slate-100 dark:bg-black/20 border border-border-base flex items-center justify-between group hover:border-primary/40 transition-all duration-300 relative" title={s.error}>
                          <div className="flex flex-col truncate">
                            <span className="text-[10px] text-text-muted truncate max-w-[100px] font-medium">{s.email}</span>
                            {s.status === 'error' && <span className="text-[8px] text-red-500 truncate max-w-[80px]">{s.error}</span>}
                            {s.status === 'invalid' && <span className="text-[8px] text-amber-400 truncate max-w-[80px]">{s.error}</span>}
                          </div>
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            s.status === 'success' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' 
                            : s.status === 'sending' ? 'bg-primary animate-pulse' 
                            : s.status === 'error' ? 'bg-red-500' 
                            : s.status === 'invalid' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                            : 'bg-slate-100 dark:bg-slate-800'
                          }`} />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      ) : activeTab === 'analytics' ? (
        <div className="space-y-8">
          {userPlan.plan === 'free' ? (
            <div className="card-saas max-w-2xl mx-auto text-center py-20">
              <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-6 border border-indigo-500/20 shadow-xl shadow-indigo-500/5">
                <PieChart size={40} className="text-indigo-400" />
              </div>
              <h3 className="text-2xl font-black text-text-base mb-4">Intelligence Analytics</h3>
              <p className="text-text-muted text-sm mb-10 max-w-sm mx-auto leading-relaxed">
                Advanced campaign intelligence and transmission reporting is reserved for Starter, Pro and Agency infrastructures.
              </p>
              <Link href="/pricing">
                <button className="px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20">
                  Upgrade to Unlock Intelligence
                </button>
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card-saas bg-gradient-to-br from-indigo-500/10 to-transparent">
                  <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2">Total Transmissions</p>
                  <p className="text-4xl font-black text-text-base">
                    {campaignHistory.reduce((acc, curr) => {
                      if (curr.id === 'active') {
                        return acc + curr.success + curr.failed;
                      }
                      return acc + curr.leads;
                    }, 0)}
                  </p>
                </div>
                <div className="card-saas bg-gradient-to-br from-emerald-500/10 to-transparent">
                  <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2">Success Rate</p>
                  <p className="text-4xl font-black text-emerald-400">
                    {(() => {
                      const totalTransmissions = campaignHistory.reduce((acc, curr) => {
                        if (curr.id === 'active') {
                          return acc + curr.success + curr.failed;
                        }
                        return acc + curr.leads;
                      }, 0);
                      const totalSuccess = campaignHistory.reduce((acc, curr) => acc + curr.success, 0);
                      return totalTransmissions > 0 ? Math.round((totalSuccess / totalTransmissions) * 100) : 0;
                    })()}%
                  </p>
                </div>
                <div className="card-saas bg-gradient-to-br from-indigo-500/10 to-transparent">
                  <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2">Campaigns Run</p>
                  <p className="text-4xl font-black text-text-base">{campaignHistory.length}</p>
                </div>
              </div>

              <div className="card-saas">
                <div className="flex justify-between items-center mb-8 pb-4 border-b border-border-base">
                  <h3 className="text-sm font-black text-text-base uppercase tracking-widest">Launch History</h3>
                  {campaignHistory.length > 0 && (
                    <button 
                      onClick={() => {
                        if (confirm("Are you sure you want to wipe all campaign intelligence data?")) {
                          setCampaignHistory([]);
                          showToast("Intelligence Data Wiped", "info");
                        }
                      }}
                      className="text-[9px] font-black text-red-500 hover:text-red-400 uppercase tracking-[0.2em] transition-colors flex items-center gap-2"
                    >
                      <Trash2 size={12} /> Wipe All Logs
                    </button>
                  )}
                </div>
                <div className="space-y-4">
                  {campaignHistory.length === 0 ? (
                    <p className="text-center py-20 text-text-muted text-xs font-bold italic uppercase tracking-widest">No campaign data available yet.</p>
                  ) : (
                    campaignHistory.map((c, i) => (
                      <div key={i} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-white/3 border border-white/8 group relative overflow-hidden">
                        <div className="relative z-10">
                          <div className="flex items-center gap-2">
                            <p className="text-text-base font-bold text-sm truncate max-w-[300px]">{c.subject}</p>
                            {c.id === 'active' && (
                              isSending ? (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[8px] font-black uppercase tracking-wider animate-pulse">
                                  <span className="w-1 h-1 rounded-full bg-emerald-400"></span>
                                  Sending
                                </span>
                              ) : isStopped ? (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[8px] font-black uppercase tracking-wider">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                  Paused
                                </span>
                              ) : null
                            )}
                          </div>
                          <p className="text-text-muted text-[10px] mt-1 uppercase tracking-widest font-black">{new Date(c.date).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-6 relative z-10">
                          <div className="text-center">
                            <p className="text-text-base font-black text-sm">{c.leads}</p>
                            <p className="text-slate-600 text-[8px] uppercase font-bold tracking-widest">Leads</p>
                          </div>
                          <div className="text-center">
                            <p className="text-emerald-400 font-black text-sm">{c.success}</p>
                            <p className="text-slate-600 text-[8px] uppercase font-bold tracking-widest">Sent</p>
                          </div>
                          <div className="text-center">
                            <p className="text-red-400 font-black text-sm">
                              {c.id === 'active' ? (c.failed || 0) : (c.leads - c.success)}
                            </p>
                            <p className="text-slate-600 text-[8px] uppercase font-bold tracking-widest">Fail / Skip</p>
                          </div>
                          {c.id === 'active' && (
                            <div className="text-center">
                              <p className="text-indigo-400 font-black text-sm">{c.leads - c.success - c.failed}</p>
                              <p className="text-slate-600 text-[8px] uppercase font-bold tracking-widest">Pending</p>
                            </div>
                          )}
                          {c.id !== 'active' && (
                            <button 
                              onClick={async () => {
                                const camp = campaignHistory[i];
                                const newHistory = campaignHistory.filter((_, idx) => idx !== i);
                                setCampaignHistory(newHistory);
                                localStorage.setItem('outreachpro_campaign_history', JSON.stringify(newHistory));
                                if (camp.id) {
                                  try {
                                    // Backend now uses full queryset for destroy — no email param needed
                                    await apiFetch(`/campaigns/${camp.id}/`, { method: 'DELETE' });
                                  } catch (err) {}
                                }
                                showToast('Campaign log removed', 'info');
                              }}
                              className="p-2 rounded-lg bg-red-500/10 text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-text-base"
                              title="Delete Log"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      ) : activeTab === 'leads' ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Control Panel */}
            <div className="lg:col-span-4 space-y-6">
              <div className="card-saas">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                    <Search size={20} className="text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-text-base">Lead Discovery</h3>
                    <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold">Find Local Businesses</p>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2 block">Business Category</label>
                    <input 
                      type="text" 
                      list="category-suggestions"
                      placeholder="e.g. Restaurants, Solar, Clinics..." aria-label="e.g. Restaurants, Solar, Clinics..." 
                      className="input-saas"
                      value={leadCategory}
                      onChange={e => setLeadCategory(e.target.value)}
                    />
                    <datalist id="category-suggestions">
                      {["Accounting", "Acupuncture", "Advertising Agency", "Aerospace Company", "Agricultural Service", "Air Conditioning Repair", "Airline", "Airport", "Ambulance Service", "Amusement Park", "Animal Hospital", "Antique Store", "Apartment Complex", "Appliance Repair", "Aquarium", "Architecture Firm", "Art Gallery", "Art School", "Assisted Living Facility", "Astrologer", "Attorney", "Auction House", "Audio Visual Equipment Rental", "Auto Body Shop", "Auto Dealership", "Auto Parts Store", "Auto Repair", "Bail Bondsman", "Bakery", "Bank", "Banquet Hall", "Barber Shop", "Bar", "Beauty Salon", "Bed and Breakfast", "Bicycle Shop", "Billiards", "Bingo Hall", "Blood Bank", "Boat Dealer", "Boat Rental", "Body Piercing Shop", "Bookkeeping Service", "Bookstore", "Bowling Alley", "Boxing Gym", "Brewery", "Bridal Shop", "Bus Station", "Business Consultant", "Butcher Shop", "Cafe", "Campground", "Car Rental", "Car Wash", "Carpenter", "Carpet Cleaning", "Casino", "Catering Service", "Cemetery", "Child Care Agency", "Chiropractor", "Church", "Cigar Shop", "Cinema", "Cleaning Service", "Clothing Store", "Coffee Shop", "College", "Comedy Club", "Commercial Real Estate", "Computer Repair", "Construction Company", "Consultant", "Convenience Store", "Cosmetics Store", "Courier Service", "Coworking Space", "Credit Union", "Dance School", "Data Recovery Service", "Daycare", "Delivery Service", "Dentist", "Department Store", "Dermatologist", "Design Agency", "Detective Agency", "Dietitian", "Discount Store", "Distillery", "Dog Walker", "Driving School", "Dry Cleaner", "Electrician", "Electronics Store", "Embroidery Service", "Employment Agency", "Engineering Firm", "Event Planner", "Event Venue", "Excavation Contractor", "Fabric Store", "Farm", "Farmers Market", "Fencing Contractor", "Financial Advisor", "Fire Station", "Fitness Center", "Flea Market", "Florist", "Food Truck", "Funeral Home", "Furniture Store", "Gas Station", "General Contractor", "Gift Shop", "Glass Repair", "Golf Course", "Graphic Design", "Grocery Store", "Gun Shop", "Gym", "Hair Salon", "Hardware Store", "Health Clinic", "Heating Contractor", "Home Builder", "Home Inspector", "Hospital", "Hostel", "Hotel", "HVAC", "Ice Cream Shop", "Immigration Attorney", "Insurance Agency", "Interior Design", "Internet Service Provider", "IT Services", "Janitorial Service", "Jewelry Store", "Judo School", "Karate School", "Kennel", "Landscaping", "Laundromat", "Law Firm", "Lawn Care Service", "Lawyer", "Library", "Limousine Service", "Liquor Store", "Locksmith", "Logistics Company", "Lumber Store", "Machine Shop", "Magazine Publisher", "Maid Service", "Manufacturing Company", "Marina", "Marketing Agency", "Martial Arts School", "Massage Therapist", "Maternity Store", "Mattress Store", "Meat Market", "Mechanic", "Medical Clinic", "Medical Spa", "Mental Health Clinic", "Metal Fabricator", "Mobile Phone Repair", "Mortgage Broker", "Motel", "Motorcycle Dealer", "Motorcycle Repair", "Moving Company", "Museum", "Music School", "Music Store", "Nail Salon", "Night Club", "Notary Public", "Nursing Home", "Office Supply Store", "Optometrist", "Orphanage", "Orthodontist", "Painter", "Pawn Shop", "Pediatrician", "Pest Control", "Pet Grooming", "Pet Store", "Pharmacy", "Photography Studio", "Physical Therapy", "Pizza Place", "Plastic Surgeon", "Plumber", "Podiatrist", "Police Department", "Post Office", "Print Shop", "Private Investigator", "Property Management", "Psychiatrist", "Psychologist", "Public Relations", "Publisher", "Radio Station", "Real Estate Agency", "Real Estate Appraiser", "Record Store", "Recycling Center", "Rehabilitation Center", "Resort", "Restaurant", "Roofer", "RV Dealer", "RV Park", "Salvage Yard", "Scrapbooking Store", "Seafood Market", "Security Company", "Security Guard Service", "Self Storage", "Shoe Repair", "Shoe Store", "Sign Shop", "Skate Shop", "Ski Resort", "Skydiving Center", "Software Company", "Solar Provider", "Spa", "Sporting Goods", "Sports Bar", "Stadium", "Stationery Store", "Steakhouse", "Storage Facility", "Supermarket", "Surf Shop", "Sushi Restaurant", "Tailor", "Tanning Salon", "Tattoo Parlor", "Tax Preparation Service", "Taxi Service", "Telecommunications Company", "Television Station", "Tennis Court", "Theater", "Therapist", "Thrift Store", "Tire Shop", "Title Company", "Towing Service", "Toy Store", "Train Station", "Translation Service", "Travel Agency", "Tree Service", "Truck Rental", "Tutoring Service", "University", "Upholstery Shop", "Urgent Care Center", "Used Car Dealer", "Vegan Restaurant", "Veterinarian", "Video Game Store", "Video Production", "Vintage Clothing Store", "Waste Management Service", "Watch Repair", "Water Damage Restoration", "Water Treatment Service", "Web Design", "Wedding Bakery", "Wedding Photographer", "Wedding Planner", "Weight Loss Center", "Welder", "Wholesaler", "Window Installation", "Window Tinting Service", "Winery", "Women's Clothing Store", "Yoga Studio", "Zoo"].map(cat => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2 block">Location (City, State)</label>
                    <input 
                      type="text" 
                      list="location-suggestions"
                      placeholder="e.g. Austin, TX" aria-label="e.g. Austin, TX" 
                      className="input-saas"
                      value={leadLocation}
                      onChange={e => {
                        const val = e.target.value;
                        setLeadLocation(val);
                        if (locationQueryTimeout) clearTimeout(locationQueryTimeout);
                        if (val.length > 2) {
                          const timeout = setTimeout(async () => {
                            try {
                              const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=5&featuretype=city`);
                              if (res.ok) {
                                const data = await res.json();
                                setLocationSuggestions(data);
                              }
                            } catch (err) {}
                          }, 500);
                          setLocationQueryTimeout(timeout);
                        } else {
                          setLocationSuggestions([]);
                        }
                      }}
                    />
                    <datalist id="location-suggestions">
                      {locationSuggestions.length > 0 && (
                        locationSuggestions.map((loc, i) => (
                          <option key={i} value={loc.display_name} />
                        ))
                      )}
                    </datalist>
                  </div>


                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2 block">Max Results</label>
                      <input 
                        type="number" 
                        className="input-saas"
                        value={leadLimit}
                        onChange={e => setLeadLimit(parseInt(e.target.value) || 20)}
                        max={userPlan.leadGenLimit === -1 ? 10000 : userPlan.leadGenLimit}
                        title={
                          userPlan.plan === 'free' ? "Free plan limited to 10 leads per month" :
                          userPlan.plan === 'starter' ? "Starter plan limited to 200 leads per month" :
                          userPlan.plan === 'pro' ? "Pro plan limited to 1,000 leads per month" : 
                          "Agency plan limited to 3,300 leads per month"
                        }
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2 block">Min Rating</label>
                      <input 
                        type="number" 
                        step="0.5"
                        max="5"
                        min="0"
                        className="input-saas"
                        value={leadMinRating}
                        onChange={e => setLeadMinRating(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-black/20 border border-border-base cursor-pointer hover:border-primary/30 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={leadOnlyWebsite}
                        onChange={e => setLeadOnlyWebsite(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-white border-slate-300 dark:bg-slate-900 dark:border-slate-700"
                      />
                      <span className="text-xs font-bold text-text-base">Must have website</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-black/20 border border-border-base cursor-pointer hover:border-primary/30 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={leadOnlyEmail}
                        onChange={e => setLeadOnlyEmail(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-white border-slate-300 dark:bg-slate-900 dark:border-slate-700"
                      />
                      <span className="text-xs font-bold text-text-base">Must have email</span>
                    </label>
                  </div>

                  <button 
                    onClick={handleGenerateLeads}
                    disabled={isGenerating || !leadCategory || !leadLocation}
                    className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                  >
                    {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    {isGenerating ? 'Scanning...' : 'Discover Leads'}
                  </button>
                </div>
              </div>

              {/* Status Legend */}
              <div className="card-saas bg-slate-50 dark:bg-black/20 border border-border-base">
                <h4 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-4">Lead Score Legend</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded bg-orange-500/20 border border-orange-500/40"></div> Hot Lead</span>
                    <span className="text-text-muted">80-100</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded bg-indigo-500/20 border border-indigo-500/40"></div> Good Lead</span>
                    <span className="text-text-muted">60-79</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded bg-amber-500/20 border border-amber-500/40"></div> Weak Lead</span>
                    <span className="text-text-muted">40-59</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded bg-slate-500/20 border border-slate-500/40"></div> Needs Enrich</span>
                    <span className="text-text-muted">&lt; 40</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Results Panel */}
            <div className="lg:col-span-8">
              <div className="card-saas min-h-[500px] flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-base font-black text-text-base">Generated Leads</h3>
                    <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold">
                      {filteredLeads.length} of {generatedLeads.length} leads displayed
                    </p>
                  </div>
                  
                  {generatedLeads.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button 
                        onClick={() => {
                          const selected = filteredLeads.filter(l => selectedLeadIds.has(l.id));
                          handleEnrichLeads(selected.length > 0 ? selected : filteredLeads);
                        }}
                        disabled={isEnriching}
                        className="px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white font-black text-[10px] uppercase tracking-widest transition-all border border-emerald-500/20 disabled:opacity-50 flex items-center gap-2"
                      >
                        {isEnriching ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
                        {selectedLeadIds.size > 0 ? 'Enrich Selected' : 'Enrich All'}
                      </button>

                      <button 
                        onClick={() => {
                          const selected = filteredLeads.filter(l => selectedLeadIds.has(l.id));
                          handleVerifyLeads(selected.length > 0 ? selected : filteredLeads);
                        }}
                        disabled={isVerifying}
                        className="px-4 py-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500 hover:text-white font-black text-[10px] uppercase tracking-widest transition-all border border-blue-500/20 disabled:opacity-50 flex items-center gap-2"
                      >
                        {isVerifying ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                        {selectedLeadIds.size > 0 ? 'Verify Selected' : 'Verify All'}
                      </button>
                      
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            const selected = filteredLeads.filter(l => selectedLeadIds.has(l.id));
                            handleExportLeads('csv', selected.length > 0 ? selected : filteredLeads);
                          }}
                          className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-text-base transition-colors"
                          title="Export CSV"
                        >
                          <Download size={16} />
                        </button>
                        <button 
                          onClick={() => {
                            const selected = filteredLeads.filter(l => selectedLeadIds.has(l.id));
                            handleExportLeads('xlsx', selected.length > 0 ? selected : filteredLeads);
                          }}
                          className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-text-base transition-colors"
                          title="Export Excel"
                        >
                          <FileSpreadsheet size={16} />
                        </button>
                      </div>

                      <button 
                        onClick={() => {
                          const selected = filteredLeads.filter(l => selectedLeadIds.has(l.id));
                          handlePushToCampaign(selected.length > 0 ? selected : undefined);
                        }}
                        className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-black font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
                      >
                        <Zap size={12} /> Push to Campaign
                      </button>
                    </div>
                  )}
                </div>

                {/* Active Operations Monitor */}
                {(isGenerating || isEnriching || isVerifying) && (
                  <div className="mb-6 p-4 rounded-xl border border-indigo-500/20 bg-slate-100 dark:bg-white/[0.02] space-y-4 shadow-sm">
                    <h4 className="text-[10px] font-black text-text-base uppercase tracking-wider flex items-center gap-2">
                      <Loader2 size={12} className="animate-spin text-indigo-400" />
                      Active Operations Monitor
                    </h4>
                    
                    {isGenerating && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-bold text-text-muted uppercase tracking-widest">
                          <span className="flex items-center gap-1.5">
                            <Search size={12} className="text-indigo-400" /> Lead Discovery Job
                          </span>
                          <div className="flex items-center gap-2">
                            <span>{Math.round(generationProgress)}%</span>
                            <button
                              onClick={handleCancelGeneration}
                              className="text-[8px] font-black text-red-500 hover:text-red-400 uppercase tracking-widest px-2 py-0.5 rounded border border-red-500/20 hover:bg-red-500/10 transition-colors"
                            >
                              Cancel Job
                            </button>
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-indigo-500 transition-all duration-300 relative"
                            style={{ width: `${generationProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {isEnriching && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-bold text-text-muted uppercase tracking-widest">
                          <span className="flex items-center gap-1.5">
                            <Globe size={12} className="text-emerald-400" /> Website Enrichment Crawler
                          </span>
                          <span>{Math.round(enrichmentProgress)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 transition-all duration-300 relative"
                            style={{ width: `${enrichmentProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {isVerifying && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-bold text-text-muted uppercase tracking-widest">
                          <span className="flex items-center gap-1.5">
                            <ShieldCheck size={12} className="text-blue-400" /> Email Deliverability Verification
                          </span>
                          <span>{Math.round(verificationProgress)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 transition-all duration-300 relative"
                            style={{ width: `${verificationProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Filters Row */}
                {generatedLeads.length > 0 && (
                  <div className="flex flex-wrap gap-4 items-center mb-6 p-3 rounded-xl bg-slate-100/50 dark:bg-white/[0.02] border border-border-base">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Filter Quality:</span>
                      <select
                        value={qualityFilter}
                        onChange={e => setQualityFilter(e.target.value)}
                        className="bg-slate-200 dark:bg-zinc-900 border border-border-base rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none"
                      >
                        <option value="all">All Quality Scores</option>
                        <option value="hot">🔥 Hot Leads (80-100)</option>
                        <option value="good">👍 Good Leads (60-79)</option>
                        <option value="weak">⚠️ Weak Leads (40-59)</option>
                        <option value="enrich">🌐 Needs Enrichment (&lt;40)</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Filter Email:</span>
                      <select
                        value={emailStatusFilter}
                        onChange={e => setEmailStatusFilter(e.target.value)}
                        className="bg-slate-200 dark:bg-zinc-900 border border-border-base rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none"
                      >
                        <option value="all">All Email Statuses</option>
                        <option value="verified">✅ Verified Deliverable</option>
                        <option value="risky">⚠️ Risky / Catch-All</option>
                        <option value="inferred">🌐 Inferred / Guessed</option>
                        <option value="invalid">❌ Invalid / Dead</option>
                        <option value="unknown">❓ Unverified / Checked</option>
                      </select>
                    </div>

                    {selectedLeadIds.size > 0 && (
                      <div className="text-xs font-black text-primary ml-auto animate-pulse">
                        {selectedLeadIds.size} lead(s) selected
                      </div>
                    )}
                  </div>
                )}

                <div className="flex-1 border border-border-base rounded-xl overflow-hidden bg-slate-50 dark:bg-black/20">
                  {filteredLeads.length === 0 ? (
                    <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8">
                      <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4 border border-indigo-500/20">
                        <Search size={24} className="text-indigo-400" />
                      </div>
                      <p className="text-text-muted text-sm font-bold max-w-sm">
                        {generatedLeads.length > 0 
                          ? 'No leads match the selected filter criteria.' 
                          : 'Enter a business category and location to generate automated leads.'}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[500px] custom-scrollbar">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-100 dark:bg-zinc-900/50 sticky top-0 z-10 shadow-sm border-b border-border-base">
                          <tr>
                            <th className="p-3 w-10 text-center">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-white border-slate-300 dark:bg-slate-900 dark:border-slate-700"
                                checked={filteredLeads.length > 0 && selectedLeadIds.size === filteredLeads.length}
                                onChange={e => handleSelectAll(e.target.checked)}
                              />
                            </th>
                            <th className="p-3 text-[10px] font-black uppercase tracking-widest text-text-muted">Business</th>
                            <th className="p-3 text-[10px] font-black uppercase tracking-widest text-text-muted">Contact Info</th>
                            <th className="p-3 text-[10px] font-black uppercase tracking-widest text-text-muted">Location Details</th>
                            <th className="p-3 text-[10px] font-black uppercase tracking-widest text-text-muted text-right">Lead Quality</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-base">
                          {filteredLeads.map((lead, idx) => {
                            const qCat = (() => {
                              const score = lead.lead_score || 0;
                              if (score >= 80) return { label: 'Hot Lead', color: 'bg-orange-500/10 text-orange-500 border border-orange-500/20' };
                              if (score >= 60) return { label: 'Good Lead', color: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' };
                              if (score >= 40) return { label: 'Weak Lead', color: 'bg-amber-500/10 text-amber-500 border border-amber-500/20' };
                              return { label: 'Needs Enrichment', color: 'bg-slate-500/10 text-slate-400 border border-slate-500/20' };
                            })();

                            const eBadge = (() => {
                              const status = lead.email_status || 'unknown';
                              switch (status) {
                                case 'verified':
                                  return { label: 'Verified', color: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' };
                                case 'risky':
                                  return { label: 'Risky', color: 'bg-amber-500/10 text-amber-500 border border-amber-500/20' };
                                case 'inferred':
                                  return { label: 'Inferred', color: 'bg-purple-500/10 text-purple-500 border border-purple-500/20' };
                                case 'invalid':
                                  return { label: 'Invalid', color: 'bg-red-500/10 text-red-500 border border-red-500/20' };
                                default:
                                  return { label: 'Unverified', color: 'bg-slate-500/10 text-slate-400 border border-slate-500/20' };
                              }
                            })();

                            return (
                              <tr key={idx} className="hover:bg-slate-100/50 dark:hover:bg-white/5 transition-colors group">
                                <td className="p-3 text-center">
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-white border-slate-300 dark:bg-slate-900 dark:border-slate-700"
                                    checked={selectedLeadIds.has(lead.id)}
                                    onChange={e => handleSelectLead(lead.id, e.target.checked)}
                                  />
                                </td>
                                <td className="p-3">
                                  <div className="font-bold text-sm text-text-base flex items-center gap-2">
                                    {lead.business_name}
                                    {lead.rating && (
                                      <span className="flex items-center text-[10px] text-amber-500 bg-amber-500/10 px-1.5 rounded">
                                        <Star size={8} className="mr-0.5" fill="currentColor"/>{lead.rating}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-text-muted mt-0.5 truncate max-w-[200px] flex items-center gap-1">
                                    {lead.website ? (
                                      <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline flex items-center gap-0.5">
                                        <Globe size={10} /> {lead.website}
                                      </a>
                                    ) : (
                                      <span className="text-slate-400 italic">No website</span>
                                    )}
                                  </div>
                                  {lead.category && (
                                    <span className="inline-block text-[9px] uppercase tracking-wider bg-slate-100 dark:bg-white/5 border border-border-base px-1.5 py-0.5 rounded-md text-text-muted mt-1 font-semibold">
                                      {lead.category}
                                    </span>
                                  )}
                                </td>
                                <td className="p-3">
                                  <div className="flex flex-col gap-1">
                                    <div className="text-xs font-semibold text-text-base flex items-center gap-1.5 flex-wrap">
                                      {lead.email ? (
                                        <>
                                          <span className="font-mono">{lead.email}</span>
                                          <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${eBadge.color}`}>
                                            {eBadge.label}
                                          </span>
                                        </>
                                      ) : (
                                        <span className="text-slate-400 italic">No email discovered</span>
                                      )}
                                    </div>
                                    {lead.email && lead.email_confidence && (
                                      <div className="text-[9px] text-text-muted font-bold">
                                        Confidence: <span className="text-text-base">{lead.email_confidence}%</span>
                                      </div>
                                    )}
                                    <div className="text-[10px] text-text-muted">{lead.phone || 'No phone number'}</div>
                                  </div>
                                </td>
                                <td className="p-3">
                                  <div className="text-xs text-text-muted leading-tight">
                                    {lead.address && <div className="truncate max-w-[180px]" title={lead.address}>{lead.address}</div>}
                                    <div className="flex items-center gap-1 text-[9px] text-slate-500 font-medium mt-0.5">
                                      {lead.city && <span>{lead.city}</span>}
                                      {lead.country && <span>• {lead.country}</span>}
                                      {lead.latitude && lead.longitude && (
                                        <span title="Geocoding coordinates">
                                          ({parseFloat(lead.latitude).toFixed(4)}, {parseFloat(lead.longitude).toFixed(4)})
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex flex-col items-end gap-1.5">
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-black border border-border-base">
                                      <div className={`w-1.5 h-1.5 rounded-full ${
                                        lead.lead_score >= 80 ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]' :
                                        lead.lead_score >= 60 ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' :
                                        lead.lead_score >= 40 ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' :
                                        'bg-slate-500 shadow-[0_0_8px_rgba(100,116,139,0.5)]'
                                      }`} />
                                      <span className="text-xs font-black text-text-base">{lead.lead_score || 0}</span>
                                    </div>
                                    <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${qCat.color}`}>
                                      {qCat.label}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      ) : (
            <div className="space-y-8">
              <div className="card-saas max-w-2xl mx-auto text-center py-20">
                <div className="w-20 h-20 rounded-3xl bg-amber-500/10 flex items-center justify-center mx-auto mb-6 border border-amber-500/20 shadow-xl shadow-amber-500/5">
                  <Users size={40} className="text-amber-400" />
                </div>
                <h3 className="text-2xl font-black text-text-base mb-4">Team Force Management</h3>
                <p className="text-text-muted text-sm mb-10 max-w-sm mx-auto leading-relaxed">
                  {userPlan.plan === 'agency' 
                    ? `You have ${userPlan.teamLimit - teamMembers.length} team slots remaining in your Agency infrastructure.`
                    : "Team Force is exclusively available for Agency plans. Upgrade now to collaborate with your department."}
                </p>
                {userPlan.plan === 'agency' ? (
                  <div className="space-y-4 text-left max-w-md mx-auto">
                    {teamMembers.length > 0 ? (
                      teamMembers.map((m, i) => (
                        <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-slate-100 dark:bg-white/5 border border-border-base">
                          <span className="text-text-base font-bold text-sm">{m.email}</span>
                          <button 
                            onClick={async () => {
                              const memberToRemove = teamMembers[i];
                              
                              try {
                                if (memberToRemove.id) {
                                  await apiFetch(`/users/${memberToRemove.id}/`, { method: 'DELETE' });
                                } else {
                                  // Find by email if ID is missing (for legacy or non-migrated users)
                                  const users = await apiFetch(`/users/?email=${encodeURIComponent(memberToRemove.email)}`);
                                  const user = users.find((u: any) => u.email.toLowerCase() === memberToRemove.email.toLowerCase());
                                  if (user) {
                                    await apiFetch(`/users/${user.id}/`, { method: 'DELETE' });
                                  }
                                }

                                const newTeam = teamMembers.filter((_, idx) => idx !== i);
                                setTeamMembers(newTeam);
                                localStorage.setItem(`outreachpro_team_${sessionUser}`, JSON.stringify(newTeam));
                                
                                showToast(`Member ${m.email} access fully revoked`, 'info');
                              } catch (err) {
                                showToast("Failed to revoke member access from backend", "error");
                              }
                            }} 
                            className="text-red-400 hover:text-red-300 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-text-muted text-center uppercase tracking-widest py-4 border border-dashed border-border-base rounded-xl">No active team members</p>
                    )}
                    
                    {(userPlan.teamLimit === -1 || teamMembers.length < (userPlan.teamLimit || 5)) && (
                      <button 
                        onClick={() => {
                          setNewMemberData({ email: '', password: '' });
                          setShowTeamModal(true);
                        }}
                        className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                      >
                        <UserPlus size={14} /> Deploy New Member
                      </button>
                    )}
                  </div>
                ) : (
                  <Link href="/pricing">
                    <button className="px-8 py-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-text-base font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-amber-500/20">
                      Unlock Agency Access
                    </button>
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
        )}
      </main>

      {/* Template Library Modal */}
      <AnimatePresence>
        {showTemplateLibrary && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="card-saas max-w-2xl w-full bg-bg-card border border-border-base p-8 rounded-3xl shadow-2xl overflow-hidden relative">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[100px] rounded-full -mr-32 -mt-32" />
              <div className="relative z-10">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-xl font-black text-text-base uppercase tracking-tight">Intelligence Template Library</h2>
                  <button onClick={() => setShowTemplateLibrary(false)} className="text-text-muted hover:text-text-base transition-colors"><X size={20} /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {PREBUILT_TEMPLATES.map((t, i) => (
                    <div key={i} className="p-5 rounded-2xl bg-white/3 border border-white/8 hover:border-indigo-500/30 transition-all group">
                      <h4 className="text-text-base font-bold text-sm mb-2">{t.name}</h4>
                      <p className="text-text-muted text-[10px] mb-6 line-clamp-3 leading-relaxed">{t.body}</p>
                      <button 
                        onClick={() => {
                          const tplLimit = userPlan.templateLimit;
                          if (tplLimit !== -1 && templates.length >= tplLimit) {
                            showToast(`Your ${PLAN_LABELS[userPlan.plan]} plan allows max ${tplLimit} template(s).`, 'error');
                            return;
                          }
                          const newT = { id: Date.now().toString(), ...t };
                          setTemplates([...templates, newT]);
                          setActiveTemplateId(newT.id);
                          setTemplate(t.body);
                          setSubject(t.subject);
                          setShowTemplateLibrary(false);
                          showToast(`Strategy "${t.name}" Imported`, 'success');
                        }}
                        className="w-full py-2.5 rounded-lg bg-indigo-500/10 group-hover:bg-indigo-600 text-indigo-400 group-hover:text-white text-[10px] font-black uppercase transition-all"
                      >
                        Import Strategy
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Footer />

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -20, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: -20, x: 20 }}
            className={`fixed top-6 right-6 z-[200] min-w-[300px] max-w-sm px-5 py-4 rounded-xl shadow-2xl backdrop-blur-xl flex items-center gap-3 border ${
              notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' :
              notification.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400' :
              'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
            }`}
          >
            {notification.type === 'success' ? <CheckCircle2 size={18} className="flex-shrink-0" /> : <AlertCircle size={18} className="flex-shrink-0" />}
            <span className="text-xs font-bold leading-tight">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Prompt Modal */}
      <AnimatePresence>
        {showPrompt && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card-saas max-w-sm w-full border-indigo-500/20"
            >
              <h3 className="text-xs font-black text-text-base mb-6 uppercase tracking-[0.2em]">{showPrompt.title}</h3>
              <input 
                autoFocus
                type="text" 
                className="input-saas mb-6" 
                placeholder="Template name..." aria-label="Template name..."
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && promptValue) {
                    showPrompt.onConfirm(promptValue);
                    setShowPrompt(null);
                    setPromptValue("");
                  }
                }}
              />
              <div className="flex gap-4">
                <button 
                  onClick={() => { setShowPrompt(null); setPromptValue(""); }}
                  className="flex-1 py-3 text-[10px] font-black text-text-muted hover:text-text-base uppercase tracking-widest transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    if (promptValue) {
                      showPrompt.onConfirm(promptValue);
                      setShowPrompt(null);
                      setPromptValue("");
                    }
                  }}
                  className="flex-1 btn-saas py-3 text-[10px]"
                >
                  Create
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* JSON-LD Structured Data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "OutreachPro",
            "operatingSystem": "Web",
            "applicationCategory": "BusinessApplication",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "USD"
            },
            "description": "Enterprise-grade bulk email automation system by A&S Solution. Features precision SMTP delivery, smart lead parsing, and real-time monitoring.",
            "author": {
              "@type": "Organization",
              "name": "A&S Solution",
              "url": "https://a-s-solution.online"
            }
          })
        }}
      />
      {/* Team Member Deployment Modal */}
      <AnimatePresence>
        {showTeamModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.95 }}
              className="card-saas max-w-sm w-full border-indigo-500/30 p-10"
            >
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
                  <UserPlus size={20} className="text-text-base" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-text-base uppercase tracking-[0.2em]">Deploy Member</h3>
                  <p className="text-[9px] font-bold text-text-muted uppercase mt-1">Agency Infrastructure</p>
                </div>
              </div>

              <div className="space-y-6 mb-10">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest ml-1">Team Email</label>
                  <input 
                    type="email" 
                    className="input-saas" 
                    placeholder="member@agency.com" aria-label="member@agency.com"
                    value={newMemberData.email}
                    onChange={(e) => setNewMemberData({...newMemberData, email: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest ml-1">Access Password</label>
                  <input 
                    type="password" 
                    className="input-saas" 
                    placeholder="6+ characters" aria-label="6+ characters"
                    value={newMemberData.password}
                    onChange={(e) => setNewMemberData({...newMemberData, password: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setShowTeamModal(false)}
                  className="flex-1 py-3 text-[10px] font-black text-text-muted hover:text-text-base uppercase tracking-widest transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    const { email, password } = newMemberData;
                    if (!email.includes('@') || password.length < 6) {
                      showToast("Valid email & 6+ char pass required", "error");
                      return;
                    }

                    const normalizedEmail = email.toLowerCase().trim();
                    
                    // Check if email already exists in local state (for instant feedback)
                    if (teamMembers.find(m => m.email.toLowerCase() === normalizedEmail)) {
                      showToast("Member already in your team", "error");
                      return;
                    }

                    try {
                      // Create the team member in the Django backend
                      const newUsername = normalizedEmail.split('@')[0] + Date.now().toString().slice(-4);
                      // Use agency limits for the team member
                      const validHash = generateIntegrityHash(normalizedEmail, 'agency', -1);
                      
                      const createdUser = await apiFetch('/users/', {
                        method: 'POST',
                        body: JSON.stringify({
                          email: normalizedEmail,
                          username: newUsername,
                          password: password,
                          plan: 'agency',
                          emailLimit: -1,
                          dailyLimit: -1,
                          templateLimit: -1,
                          teamLimit: 0,
                          attachments: true,
                          expiresAt: userPlan.expiresAt || '2099-12-31',
                          isMember: true,
                          owner: sessionUser,
                          hash: validHash
                        })
                      });

                      const newTeam = [...teamMembers, { email: normalizedEmail, password, id: createdUser.id }];
                      setTeamMembers(newTeam);
                      localStorage.setItem(`outreachpro_team_${sessionUser}`, JSON.stringify(newTeam));
                      
                      setShowTeamModal(false);
                      showToast(`Member ${email} deployed successfully!`, 'success');
                    } catch (err: any) {
                      showToast(err.message || "Failed to deploy member to backend", "error");
                    }
                  }}
                  className="flex-1 btn-saas py-3 text-[10px] bg-indigo-600 hover:bg-indigo-500"
                >
                  Confirm Deploy
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
