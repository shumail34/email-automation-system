/**
 * useEmailSender.ts
 * 
 * Custom hook that owns all email-campaign transmission logic.
 * Extracted from page.tsx to reduce the God Component size.
 * 
 * Responsibilities:
 *  - Validate SMTP config + plan limits before sending
 *  - Loop through leads, verify each email, send via /api/send-email
 *  - Track daily & monthly usage in real-time
 *  - Save campaign record to Django backend after completion
 *  - Expose: isSending, isStopped, statuses, sendAllEmails, continueSending, stopSending
 */

import { useState, useRef } from 'react';
import { apiFetch } from './api';
import { PLAN_LABELS, type UserPlan } from './plans';

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

interface Config {
  host: string;
  port: string;
  user: string;
  pass: string;
  senderName: string;
  saveToSent: boolean;
}

interface Attachment {
  name: string;
  content: string;
  type: string;
}

interface UseEmailSenderProps {
  data: EmailData[];
  statuses: SendStatus[];
  setStatuses: React.Dispatch<React.SetStateAction<SendStatus[]>>;
  config: Config;
  subject: string;
  template: string;
  attachments: Attachment[];
  userPlan: UserPlan;
  sessionUser: string | null;
  dailyUsage: number;
  monthlyUsage: number;
  setDailyUsage: React.Dispatch<React.SetStateAction<number>>;
  setMonthlyUsage: React.Dispatch<React.SetStateAction<number>>;
  setCampaignHistory: React.Dispatch<React.SetStateAction<any[]>>;
  campaignHistory: any[];
  fillTemplate: (text: string, row: EmailData) => string;
  delay: number;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function useEmailSender({
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
}: UseEmailSenderProps) {
  const [isSending, setIsSending] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const stopRequestedRef = useRef(false);
  const resumeFromIndexRef = useRef(0);

  const stopSending = () => {
    stopRequestedRef.current = true;
  };

  const resetSendState = () => {
    resumeFromIndexRef.current = 0;
    setIsStopped(false);
  };

  const runSend = async (startIndex: number) => {
    // Validation
    if (!config.host.includes('.')) return showToast("Enter a valid Gateway Host", 'error');
    if (!config.user.includes('@')) return showToast("Enter a valid User Email", 'error');
    if (!config.pass) return showToast("Enter your Secure Key", 'error');
    if (data.length === 0) return showToast("Upload a lead list first", 'error');

    if (userPlan.emailLimit !== -1 && data.length > userPlan.emailLimit) {
      return showToast(`Plan limit exceeded: Your ${PLAN_LABELS[userPlan.plan]} plan allows ${userPlan.emailLimit} emails per campaign.`, 'error');
    }
    if (userPlan.dailyLimit !== -1 && dailyUsage >= userPlan.dailyLimit) {
      return showToast(`Daily limit reached. Your ${PLAN_LABELS[userPlan.plan]} plan allows ${userPlan.dailyLimit} emails/day. Resets tomorrow.`, 'error');
    }
    if (userPlan.monthlyLimit !== -1 && monthlyUsage >= userPlan.monthlyLimit) {
      return showToast(`Monthly limit reached. Your ${PLAN_LABELS[userPlan.plan]} plan allows ${userPlan.monthlyLimit} emails/month.`, 'error');
    }

    setIsSending(true);
    setIsStopped(false);
    stopRequestedRef.current = false;
    const s = [...statuses];

    // Helper to update campaignHistory in real time
    const updateActiveCampaignHistory = (currentStatuses: SendStatus[]) => {
      const successCount = currentStatuses.filter(x => x.status === 'success').length;
      const failedCount = currentStatuses.filter(x => x.status === 'error' || x.status === 'invalid').length;
      setCampaignHistory(prev => {
        const filtered = prev.filter(c => c.id !== 'active');
        const activeRecord = {
          id: 'active',
          leads: data.length,
          success: successCount,
          failed: failedCount,
          subject,
          date: prev.find(c => c.id === 'active')?.date || new Date().toISOString(),
          user_email: sessionUser,
        };
        return [activeRecord, ...filtered];
      });
    };

    // Initialize or reset active record at start
    if (startIndex === 0) {
      setCampaignHistory(prev => {
        const filtered = prev.filter(c => c.id !== 'active');
        return [{
          id: 'active',
          leads: data.length,
          success: 0,
          failed: 0,
          subject,
          date: new Date().toISOString(),
          user_email: sessionUser,
        }, ...filtered];
      });
    }

    for (let i = startIndex; i < data.length; i++) {
      if (stopRequestedRef.current) {
        resumeFromIndexRef.current = i;
        setIsStopped(true);
        showToast("Transmission stopped — click Continue to resume", "info");
        setIsSending(false);
        return;
      }

      if (!data[i]['Email']) {
        s[i] = { email: 'Unknown', status: 'error', error: 'Missing email address in row' };
        setStatuses([...s]);
        updateActiveCampaignHistory(s);
        continue;
      }

      s[i] = { ...s[i], status: 'sending' };
      setStatuses([...s]);

      // Email Verification
      try {
        const verifyRes = await fetch('/api/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: data[i]['Email'] }),
        });
        const verifyData = await verifyRes.json();
        if (!verifyData.valid) {
          s[i] = { ...s[i], status: 'invalid', error: verifyData.reason || 'Invalid email' };
          setStatuses([...s]);
          updateActiveCampaignHistory(s);
          continue;
        }
      } catch {
        // Fail open if verify API is down
      }

      // Send Email
      try {
        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config,
            to: data[i]['Email'],
            subject: fillTemplate(subject, data[i]),
            body: fillTemplate(template, data[i]),
            attachments,
            saveToSent: config.saveToSent,
          }),
        });
        const result = await res.json();
        const errMsg = result.message || '';
        const isHostError = errMsg.toLowerCase().includes('connect') || errMsg.toLowerCase().includes('getaddrinfo') || errMsg.toLowerCase().includes('enotfound') || errMsg.toLowerCase().includes('etimedout');
        s[i] = { ...s[i], status: res.ok ? 'success' : 'error', error: isHostError ? 'Enter correct gateway host' : errMsg };

        if (res.ok) {
          const today = new Date().toISOString().split('T')[0];
          const thisMonth = today.slice(0, 7);

          setDailyUsage(prev => {
            const newUsage = prev + 1;
            const usageKey = `outreachpro_usage_${sessionUser || 'guest'}`;
            localStorage.setItem(usageKey, JSON.stringify({ date: today, count: newUsage }));
            if (userPlan.dailyLimit !== -1 && newUsage >= userPlan.dailyLimit) {
              stopRequestedRef.current = true;
              showToast(`Daily limit reached (${userPlan.dailyLimit}). Transmission paused — resumes tomorrow.`, 'info');
            }
            return newUsage;
          });

          setMonthlyUsage(prev => {
            const newUsage = prev + 1;
            const mKey = `outreachpro_monthly_${sessionUser || 'guest'}`;
            localStorage.setItem(mKey, JSON.stringify({ month: thisMonth, count: newUsage }));
            if (userPlan.monthlyLimit !== -1 && newUsage >= userPlan.monthlyLimit) {
              stopRequestedRef.current = true;
              showToast(`Monthly limit reached (${userPlan.monthlyLimit}). Upgrade your plan to continue.`, 'error');
            }
            return newUsage;
          });
        }
      } catch (e: any) {
        s[i] = { ...s[i], status: 'error', error: e.message || 'Network failure' };
      }

      setStatuses([...s]);
      updateActiveCampaignHistory(s);
      if (i < data.length - 1) await new Promise(r => setTimeout(r, delay * 1000));
    }

    // Campaign complete
    resumeFromIndexRef.current = 0;
    setIsStopped(false);
    setIsSending(false);

    const successCount = s.filter(x => x.status === 'success').length;
    const failedCount = data.length - successCount;
    const campaignRecord = {
      leads: data.length,
      success: successCount,
      failed: failedCount,
      subject,
      user_email: sessionUser,
    };

    try {
      const saved = await apiFetch('/campaigns/', {
        method: 'POST',
        body: JSON.stringify(campaignRecord),
      });
      setCampaignHistory(prev => {
        const filtered = prev.filter(c => c.id !== 'active');
        return [saved, ...filtered];
      });

      if (sessionUser) {
        const userRes = await apiFetch(`/users/?email=${encodeURIComponent(sessionUser)}`).catch(() => null);
        const backendUser = userRes?.find((u: any) => u.email.toLowerCase() === sessionUser.toLowerCase());
        if (backendUser) {
          const thisMonth = new Date().toISOString().slice(0, 7);
          if (backendUser.emails_sent_month === thisMonth) {
            setMonthlyUsage(backendUser.emails_sent_count || 0);
          }
        }
      }
    } catch {
      const localRecord = { id: Date.now(), date: new Date().toISOString(), ...campaignRecord };
      setCampaignHistory(prev => {
        const filtered = prev.filter(c => c.id !== 'active');
        return [localRecord, ...filtered];
      });
      localStorage.setItem('outreachpro_campaign_history', JSON.stringify([localRecord, ...campaignHistory.filter(c => c.id !== 'active')]));
    }

    showToast("Campaign Transmission Complete!", "success");
  };

  const sendAllEmails = () => runSend(0);
  const continueSending = () => runSend(resumeFromIndexRef.current);

  return {
    isSending,
    isStopped,
    sendAllEmails,
    continueSending,
    stopSending,
    resetSendState,
  };
}
