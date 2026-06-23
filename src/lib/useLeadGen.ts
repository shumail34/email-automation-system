/**
 * useLeadGen.ts
 *
 * Upgraded Custom Hook for Lead Generation, Enrichment, and Verification.
 * Implements database job queues, polling, filtering, quality scores,
 * email verification, and campaign pushing with deliverability safeguards.
 */

import { useState, useEffect, useRef } from 'react';
import { type UserPlan } from './plans';

interface EmailData {
  'Business Name': string;
  'Location Name': string;
  'First Name': string;
  'Last Name': string;
  'Email': string;
  [key: string]: string;
}

interface UseLeadGenProps {
  userPlan: UserPlan;
  sessionUser: string | null;
  monthlyLeadUsage: number;
  setMonthlyLeadUsage: React.Dispatch<React.SetStateAction<number>>;
  setData: React.Dispatch<React.SetStateAction<EmailData[]>>;
  setStatuses: React.Dispatch<React.SetStateAction<any[]>>;
  setUploadedFileName: React.Dispatch<React.SetStateAction<string>>;
  setActiveTab: (tab: any) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function useLeadGen({
  userPlan,
  sessionUser,
  monthlyLeadUsage,
  setMonthlyLeadUsage,
  setData,
  setStatuses,
  setUploadedFileName,
  setActiveTab,
  showToast,
}: UseLeadGenProps) {
  // Input fields
  const [leadCategory, setLeadCategory] = useState('');
  const [leadLocation, setLeadLocation] = useState('');
  const [leadLimit, setLeadLimit] = useState(20);
  const [leadMinRating, setLeadMinRating] = useState(0);
  const [leadOnlyWebsite, setLeadOnlyWebsite] = useState(false);
  const [leadOnlyEmail, setLeadOnlyEmail] = useState(false);
  const [sourceMode, setSourceMode] = useState<'auto' | 'google' | 'osm'>('auto');

  // Lead lists & filter states
  const [generatedLeads, setGeneratedLeads] = useState<any[]>([]);
  const [qualityFilter, setQualityFilter] = useState<string>('all'); // all, hot, good, weak, enrich
  const [emailStatusFilter, setEmailStatusFilter] = useState<string>('all'); // all, verified, risky, inferred, unknown
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());

  // Job status & progress states
  const [activeGenJobId, setActiveGenJobId] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);

  const [activeEnrichJobId, setActiveEnrichJobId] = useState<number | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState(0);

  const [activeVerifyJobId, setActiveVerifyJobId] = useState<number | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationProgress, setVerificationProgress] = useState(0);

  // References for polling intervals
  const genIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const enrichIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const verifyIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Token helper
  const getAuthHeader = (): Record<string, string> => {
    if (typeof window === 'undefined') return {};
    const token = sessionStorage.getItem('outreachpro_access');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };


  // Fetch leads list from backend
  const fetchUpdatedLeads = async () => {
    if (!sessionUser) return;
    try {
      const res = await fetch(`/api/leads?email=${encodeURIComponent(sessionUser)}`, {
        headers: getAuthHeader(),
      });
      const data = await res.json();
      if (res.ok) {
        setGeneratedLeads(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    }
  };

  // Load leads on mount
  useEffect(() => {
    if (sessionUser) {
      fetchUpdatedLeads();
    }
  }, [sessionUser]);

  // Clean intervals on unmount
  useEffect(() => {
    return () => {
      if (genIntervalRef.current) clearInterval(genIntervalRef.current);
      if (enrichIntervalRef.current) clearInterval(enrichIntervalRef.current);
      if (verifyIntervalRef.current) clearInterval(verifyIntervalRef.current);
    };
  }, []);

  // Poll generation job status
  const startPollingGeneration = (jobId: number) => {
    if (genIntervalRef.current) clearInterval(genIntervalRef.current);
    
    genIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/leads/jobs/${jobId}`, {
          headers: getAuthHeader(),
        });
        const data = await res.json();
        
        if (res.ok) {
          setGenerationProgress(data.progress_percentage || 0);
          
          if (data.status === 'completed') {
            clearInterval(genIntervalRef.current!);
            setIsGenerating(false);
            setActiveGenJobId(null);
            showToast(`Generated ${data.processed_items} leads successfully!`, 'success');
            // Refresh leads and usage
            fetchUpdatedLeads();
            // Get updated count from backend to sync
            const userRes = await fetch(`https://email-automation-system-4h0i.onrender.com/api/users/?email=${encodeURIComponent(sessionUser || '')}`, {
               headers: getAuthHeader()
            });
            if (userRes.ok) {
              const uList = await userRes.json();
              const user = uList.find((u: any) => u.email.toLowerCase() === sessionUser?.toLowerCase());
              if (user) setMonthlyLeadUsage(user.leads_generated_count);
            }
          } else if (data.status === 'failed') {
            clearInterval(genIntervalRef.current!);
            setIsGenerating(false);
            setActiveGenJobId(null);
            showToast(data.error_message || 'Lead generation job failed.', 'error');
          } else if (data.status === 'cancelled') {
            clearInterval(genIntervalRef.current!);
            setIsGenerating(false);
            setActiveGenJobId(null);
            showToast('Lead generation cancelled.', 'info');
          }
        }
      } catch (err) {
        console.error('Polling generation error:', err);
      }
    }, 2000);
  };

  // Start generation job
  const handleGenerateLeads = async () => {
    if (!leadCategory || !leadLocation) {
      showToast('Category and Location are required', 'error');
      return;
    }

    if (!sessionUser) {
      showToast('Please log in to generate leads', 'error');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      const planMax = userPlan.leadGenLimit;
      if (planMax !== -1 && monthlyLeadUsage >= planMax) {
        showToast(`Monthly limit reached. Your plan allows ${planMax} leads/month.`, 'error');
        setIsGenerating(false);
        return;
      }

      const res = await fetch('/api/leads/jobs/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          email: sessionUser,
          category: leadCategory,
          location: leadLocation,
          limit: leadLimit,
          sourceMode: sourceMode,
        }),
      });

      const data = await res.json();
      if (res.ok && data.id) {
        setActiveGenJobId(data.id);
        showToast('Generation background job started...', 'info');
        startPollingGeneration(data.id);
      } else {
        showToast(data.error || 'Failed to start lead generation', 'error');
        setIsGenerating(false);
      }
    } catch {
      showToast('Network error starting generation job', 'error');
      setIsGenerating(false);
    }
  };

  // Cancel generation job
  const handleCancelGeneration = async () => {
    if (!activeGenJobId) return;
    try {
      const res = await fetch(`/api/leads/jobs/${activeGenJobId}/cancel`, {
        method: 'POST',
        headers: getAuthHeader(),
      });
      if (res.ok) {
        showToast('Cancelling job...', 'info');
      }
    } catch (err) {
      showToast('Failed to cancel job', 'error');
    }
  };

  // Poll enrichment job status
  const startPollingEnrichment = (jobId: number) => {
    if (enrichIntervalRef.current) clearInterval(enrichIntervalRef.current);

    enrichIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/leads/enrich?jobId=${jobId}`, {
          headers: getAuthHeader(),
        });
        const data = await res.json();

        if (res.ok) {
          setEnrichmentProgress(data.progress_percentage || 0);

          if (data.status === 'completed') {
            clearInterval(enrichIntervalRef.current!);
            setIsEnriching(false);
            setActiveEnrichJobId(null);
            showToast(`Enriched ${data.processed_items} leads with website metadata!`, 'success');
            fetchUpdatedLeads();
          } else if (data.status === 'failed') {
            clearInterval(enrichIntervalRef.current!);
            setIsEnriching(false);
            setActiveEnrichJobId(null);
            showToast(data.error_message || 'Lead enrichment failed.', 'error');
          } else if (data.status === 'cancelled') {
            clearInterval(enrichIntervalRef.current!);
            setIsEnriching(false);
            setActiveEnrichJobId(null);
            showToast('Lead enrichment cancelled.', 'info');
          }
        }
      } catch (err) {
        console.error('Polling enrichment error:', err);
      }
    }, 2000);
  };

  // Start enrichment job
  const handleEnrichLeads = async (leadsToEnrich: any[]) => {
    if (leadsToEnrich.length === 0) {
      showToast('Select leads with websites to enrich', 'error');
      return;
    }

    if (!sessionUser) return;

    // Filter leads that have websites
    const enrichable = leadsToEnrich.filter(l => l.website);
    if (enrichable.length === 0) {
      showToast('None of the selected leads have websites listed.', 'error');
      return;
    }

    setIsEnriching(true);
    setEnrichmentProgress(0);

    try {
      const res = await fetch('/api/leads/enrich', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          email: sessionUser,
          leadIds: enrichable.map(l => l.id),
        }),
      });

      const data = await res.json();
      if (res.ok && data.id) {
        setActiveEnrichJobId(data.id);
        showToast('Enrichment crawling job started in background...', 'info');
        startPollingEnrichment(data.id);
      } else {
        showToast(data.error || 'Failed to start enrichment', 'error');
        setIsEnriching(false);
      }
    } catch {
      showToast('Network error starting enrichment job', 'error');
      setIsEnriching(false);
    }
  };

  // Poll verification job status
  const startPollingVerification = (jobId: number) => {
    if (verifyIntervalRef.current) clearInterval(verifyIntervalRef.current);

    verifyIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/leads/verify?jobId=${jobId}`, {
          headers: getAuthHeader(),
        });
        const data = await res.json();

        if (res.ok) {
          setVerificationProgress(data.progress_percentage || 0);

          if (data.status === 'completed') {
            clearInterval(verifyIntervalRef.current!);
            setIsVerifying(false);
            setActiveVerifyJobId(null);
            showToast(`Verified ${data.processed_items} emails!`, 'success');
            fetchUpdatedLeads();
          } else if (data.status === 'failed') {
            clearInterval(verifyIntervalRef.current!);
            setIsVerifying(false);
            setActiveVerifyJobId(null);
            showToast(data.error_message || 'Verification failed.', 'error');
          } else if (data.status === 'cancelled') {
            clearInterval(verifyIntervalRef.current!);
            setIsVerifying(false);
            setActiveVerifyJobId(null);
            showToast('Verification cancelled.', 'info');
          }
        }
      } catch (err) {
        console.error('Polling verification error:', err);
      }
    }, 2000);
  };

  // Start verification job
  const handleVerifyLeads = async (leadsToVerify: any[]) => {
    if (leadsToVerify.length === 0) {
      showToast('Select leads to verify', 'error');
      return;
    }

    if (!sessionUser) return;

    // Filter leads with emails
    const verifiable = leadsToVerify.filter(l => l.email);
    if (verifiable.length === 0) {
      showToast('None of the selected leads have emails to verify.', 'error');
      return;
    }

    setIsVerifying(true);
    setVerificationProgress(0);

    try {
      const res = await fetch('/api/leads/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          email: sessionUser,
          leadIds: verifiable.map(l => l.id),
        }),
      });

      const data = await res.json();
      if (res.ok && data.id) {
        setActiveVerifyJobId(data.id);
        showToast('Verification pipeline started in background...', 'info');
        startPollingVerification(data.id);
      } else {
        showToast(data.error || 'Failed to start verification', 'error');
        setIsVerifying(false);
      }
    } catch {
      showToast('Network error starting verification job', 'error');
      setIsVerifying(false);
    }
  };

  // Export leads
  const handleExportLeads = async (format: 'csv' | 'xlsx', customList?: any[]) => {
    const listToExport = customList || filteredLeads;
    if (listToExport.length === 0) {
      showToast('No leads available to export.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/leads/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ leads: listToExport, format }),
      });

      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads_export_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      showToast(`Exported ${listToExport.length} leads successfully!`, 'success');
    } catch {
      showToast('Export failed', 'error');
    }
  };

  // Filter leads based on quality and email verification status
  const getQualityCategory = (score: number) => {
    if (score >= 80) return 'hot';
    if (score >= 60) return 'good';
    if (score >= 40) return 'weak';
    return 'enrich';
  };

  const filteredLeads = generatedLeads.filter((lead) => {
    // 1. Category Filter
    if (qualityFilter !== 'all' && getQualityCategory(lead.lead_score) !== qualityFilter) {
      return false;
    }
    // 2. Email Status Filter
    if (emailStatusFilter !== 'all' && lead.email_status !== emailStatusFilter) {
      return false;
    }
    // 3. Min Rating Filter
    if (leadMinRating > 0 && lead.rating && parseFloat(lead.rating) < leadMinRating) {
      return false;
    }
    // 4. Website Presence Filter
    if (leadOnlyWebsite && !lead.website) {
      return false;
    }
    // 5. Email Presence Filter
    if (leadOnlyEmail && !lead.email) {
      return false;
    }
    return true;
  });

  // Bulk actions selection helpers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLeadIds(new Set(filteredLeads.map(l => l.id)));
    } else {
      setSelectedLeadIds(new Set());
    }
  };

  const handleSelectLead = (id: number, checked: boolean) => {
    const next = new Set(selectedLeadIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelectedLeadIds(next);
  };

  // Push leads to Campaign Launch Engine (with strict deliverability filters)
  const handlePushToCampaign = (customList?: any[]) => {
    const sourceList = customList || filteredLeads.filter(l => selectedLeadIds.has(l.id));
    const finalSelection = sourceList.length > 0 ? sourceList : filteredLeads;

    // Apply strict cold outreach checks
    // Rules:
    // - verified: allowed
    // - inferred / unknown: allowed with reviews/warnings
    // - invalid: blocked
    const valid = finalSelection.filter(l => l.email && l.email_status !== 'invalid');
    const invalidCount = finalSelection.length - valid.length;

    if (valid.length === 0) {
      showToast('No campaign-ready leads with valid emails to push.', 'error');
      return;
    }

    if (invalidCount > 0) {
      showToast(`Blocked ${invalidCount} invalid/risky emails to protect domain reputation.`, 'info');
    }

    // Check if there are risky/inferred emails to warn user
    const riskyCount = valid.filter(l => l.email_status === 'risky' || l.email_status === 'inferred').length;
    if (riskyCount > 0) {
      showToast(`Warning: Pushing ${riskyCount} unverified or risky emails. Recommended to verify first.`, 'info');
    }

    const formatted: EmailData[] = valid.map(l => ({
      'Business Name': l.business_name || '',
      'Owner Name': l.owner_name || '',
      'First Name': l.owner_name ? l.owner_name.split(' ')[0] : '',
      'Last Name': l.owner_name ? l.owner_name.split(' ').slice(1).join(' ') : '',
      'Location Name': l.address ? l.address.split(',').slice(-2, -1)[0]?.trim() || '' : '',
      'Email': l.email,
      'Website': l.website || '',
      'Phone': l.phone || '',
      'Industry': l.category || '',
      'phone number': l.phone || '',
      'industry': l.category || '',
    }));

    setData(formatted);
    setStatuses(formatted.map(row => ({ email: row['Email'], status: 'pending' })));
    setUploadedFileName(`Leads_Campaign_${formatted.length}.csv`);
    setActiveTab('campaign');
    showToast(`Successfully pushed ${formatted.length} leads to Campaign Launch Engine!`, 'success');
  };

  return {
    // Inputs & configurations
    leadCategory, setLeadCategory,
    leadLocation, setLeadLocation,
    leadLimit, setLeadLimit,
    leadMinRating, setLeadMinRating,
    leadOnlyWebsite, setLeadOnlyWebsite,
    leadOnlyEmail, setLeadOnlyEmail,
    sourceMode, setSourceMode,

    // Lists & filtering
    generatedLeads,
    filteredLeads,
    qualityFilter, setQualityFilter,
    emailStatusFilter, setEmailStatusFilter,
    selectedLeadIds, setSelectedLeadIds,

    // Job states & progress
    isGenerating,
    generationProgress,
    isEnriching,
    enrichmentProgress,
    isVerifying,
    verificationProgress,

    // Service actions
    handleGenerateLeads,
    handleCancelGeneration,
    handleEnrichLeads,
    handleVerifyLeads,
    handleExportLeads,
    handlePushToCampaign,
    
    // Bulk select helpers
    handleSelectAll,
    handleSelectLead,
  };
}
