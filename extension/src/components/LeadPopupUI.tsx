import React, { useState, useEffect } from 'react';
import { 
  Search, Database, Settings, Download, UserPlus, 
  Trash2, Copy, Moon, Sun, ArrowRight, CheckCircle2, 
  AlertCircle, ChevronRight, FileSpreadsheet, Loader2, Sparkles,
  Eye, EyeOff
} from 'lucide-react';
import { 
  firebaseSignUp, 
  firebaseSignIn, 
  checkEmailVerified, 
  resendVerificationEmail, 
  firebaseSignOut 
} from '../config/firebase';
import { type User as FirebaseUser } from 'firebase/auth';

interface LeadData {
  id?: string;
  name: string;
  businessName: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  linkedinUrl: string;
  facebookUrl: string;
  instagramUrl: string;
  twitterUrl: string;
  sourceUrl: string;
  sourceDomain: string;
  sourceType: string;
  created_at?: string;
}

const BACKEND_URL = 'https://leadsilly.com';
// For local testing, change the above to: 'http://localhost:5000'

const IS_DEV_MODE = false;

const PLAN_LIMITS = {
  Free: 50,
  Individual: 500,
  Team: 2500,
  Agency: 10000
};

export default function LeadPopupUI() {
  const [activeTab, setActiveTab] = useState<'extract' | 'dashboard' | 'settings'>('extract');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  
  // Extraction states
  const [extractedData, setExtractedData] = useState<LeadData[] | null>(null);
  const [selectedLeadIndices, setSelectedLeadIndices] = useState<number[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [duplicateOption, setDuplicateOption] = useState<'Skip' | 'Update' | 'Merge'>('Skip');
  
  // Usage credits state
  const [creditsUsed, setCreditsUsed] = useState(0);
  
  // Database leads states
  const [leadsList, setLeadsList] = useState<LeadData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  
  // Settings & Team States
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'Admin' | 'Member'>('Member');
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  
  // Custom Email Sign-In / Sign-Up configurations
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authStep, setAuthStep] = useState<'form' | 'otp'>('form'); // OTP verification step
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [otpResendTimer, setOtpResendTimer] = useState(0);

  // Feedback Messages
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Trigger Toast
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Get current plan's allowed limit
  const currentPlan = (user?.planType || 'Free') as keyof typeof PLAN_LIMITS;
  const maxLimit = PLAN_LIMITS[currentPlan] || 50;
  const remainingCredits = Math.max(0, maxLimit - creditsUsed);

  // 1. Sync Authentication & Credits on load
  useEffect(() => {
    const savedToken = localStorage.getItem('jwt_token');
    const savedUser = localStorage.getItem('user_details');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }

    const savedTheme = localStorage.getItem('app_theme') || 'dark';
    setTheme(savedTheme as 'dark' | 'light');
    document.documentElement.className = savedTheme;

    // Load mock usage credits if in local mode
    const today = new Date().toISOString().split('T')[0];
    const localUsage = JSON.parse(localStorage.getItem('mock_usage_credits') || '{}');
    if (localUsage.date === today) {
      setCreditsUsed(localUsage.count || 0);
    } else {
      setCreditsUsed(0);
    }
  }, []);

  // Fetch leads and workspaces if logged in or tab switches
  useEffect(() => {
    if (token) {
      fetchLeads();
      fetchWorkspaces();
      fetchCreditsFromServer();
    }
  }, [token, activeTab]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('app_theme', nextTheme);
    document.documentElement.className = nextTheme;
  };

  // Fetch usage stats from server
  const fetchCreditsFromServer = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/analytics`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.dailyUsage !== undefined) {
        setCreditsUsed(data.dailyUsage);
      }
    } catch (e) {}
  };

  // 2. Auth via Firebase Authentication
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const startResendTimer = () => {
    setOtpResendTimer(60);
    const interval = setInterval(() => {
      setOtpResendTimer(t => {
        if (t <= 1) { clearInterval(interval); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !passwordInput) {
      showToast('Please fill out all required fields', 'error');
      return;
    }

    setIsAuthLoading(true);
    try {
      if (authMode === 'signin') {
        // ── Sign In via Firebase ──────────────────────────────────────────────
        const fbUser = await firebaseSignIn(emailInput, passwordInput);
        
        // Wait, check if they are email verified
        if (!fbUser.emailVerified) {
          setFirebaseUser(fbUser);
          setAuthStep('otp'); // reusing otp step layout as "check email" view
          showToast('Please verify your email to log in.', 'error');
          setIsAuthLoading(false);
          return;
        }

        // Get ID token and send to backend
        const idToken = await fbUser.getIdToken();
        const res = await fetch(`${BACKEND_URL}/api/auth/firebase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken })
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Sign in validation failed', 'error'); return; }

        localStorage.setItem('jwt_token', data.token);
        localStorage.setItem('user_details', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        showToast(`Welcome back, ${data.user.name}!`);
      } else {
        // ── Sign Up via Firebase ──────────────────────────────────────────────
        if (!nameInput) { showToast('Please enter your name', 'error'); return; }
        if (passwordInput.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }

        const fbUser = await firebaseSignUp(nameInput, emailInput, passwordInput);
        setFirebaseUser(fbUser);
        setAuthStep('otp'); // Show verification prompt
        startResendTimer();
        showToast(`Verification link sent to ${emailInput}`, 'info');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Authentication failed. Please check details.', 'error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Verify link confirmation checker (Called manually when user clicks "I have verified")
  const handleVerifyLinkCheck = async () => {
    if (!firebaseUser) {
      showToast('No pending verification found', 'error');
      return;
    }

    setIsAuthLoading(true);
    try {
      const isVerified = await checkEmailVerified(firebaseUser);
      if (!isVerified) {
        showToast('Email not verified yet. Please check your inbox/spam folder.', 'error');
        setIsAuthLoading(false);
        return;
      }

      // Success, email is verified! Now request backend JWT
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch(`${BACKEND_URL}/api/auth/firebase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Account synchronization failed', 'error'); return; }

      localStorage.setItem('jwt_token', data.token);
      localStorage.setItem('user_details', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      showToast(`Welcome, ${data.user.name}! Account created & verified successfully ✓`);
    } catch (err: any) {
      showToast(err.message || 'Failed to verify. Please try again.', 'error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (otpResendTimer > 0) return;
    if (!firebaseUser) return;
    setIsAuthLoading(true);
    try {
      await resendVerificationEmail(firebaseUser);
      startResendTimer();
      showToast('New verification email sent!', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to resend. Please try again.', 'error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user_details');
    setToken(null);
    setUser(null);
    setExtractedData(null);
    setLeadsList([]);
    showToast('Logged out successfully', 'info');
  };

  // 3. Lead Extraction Trigger
  const handleExtract = async () => {
    setIsExtracting(true);
    setExtractedData(null);
    setSelectedLeadIndices([]);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabId = tabs[0]?.id;
      if (!activeTabId) {
        setIsExtracting(false);
        showToast('No active browser window detected', 'error');
        return;
      }

      chrome.tabs.sendMessage(activeTabId, { action: 'extract_leads' }, (res) => {
        setIsExtracting(false);
        if (chrome.runtime.lastError || !res || !res.success) {
          // Fallback if content script not preloaded
          chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            files: ['content.js']
          }, () => {
            chrome.tabs.sendMessage(activeTabId, { action: 'extract_leads' }, (retryRes) => {
              if (retryRes && retryRes.success && Array.isArray(retryRes.data)) {
                setExtractedData(retryRes.data);
                setSelectedLeadIndices(retryRes.data.map((_: any, i: number) => i));
                showToast(`Scraped ${retryRes.data.length} listings!`);
              } else {
                showToast('Unable to extract data from this page schema.', 'error');
              }
            });
          });
        } else if (Array.isArray(res.data)) {
          setExtractedData(res.data);
          setSelectedLeadIndices(res.data.map((_: any, i: number) => i));
          showToast(`Scraped ${res.data.length} listings!`);
        }
      });
    });
  };

  // 4. Save selected leads (Decrements and saves local/live credits)
  const handleSaveLeads = () => {
    if (!extractedData || !token) return;
    
    const leadsToSave = extractedData.filter((_, idx) => selectedLeadIndices.includes(idx));
    
    if (leadsToSave.length === 0) {
      showToast('No leads selected to save', 'error');
      return;
    }

    if (leadsToSave.length > remainingCredits) {
      showToast(`Not enough credits remaining for this action!`, 'error');
      return;
    }

    setIsSaving(true);

    const saveLocally = () => {
      const stored = localStorage.getItem('mock_leads_db') || '[]';
      const currentLeads = JSON.parse(stored);
      
      leadsToSave.forEach(l => {
        currentLeads.unshift({
          ...l,
          id: 'mock_id_' + Math.random().toString(36).substr(2, 9),
          created_at: new Date().toISOString()
        });
      });
      
      localStorage.setItem('mock_leads_db', JSON.stringify(currentLeads));
      
      // Update local credits usage
      const newCreditsUsed = creditsUsed + leadsToSave.length;
      setCreditsUsed(newCreditsUsed);
      localStorage.setItem('mock_usage_credits', JSON.stringify({
        date: new Date().toISOString().split('T')[0],
        count: newCreditsUsed
      }));

      setLeadsList(currentLeads);
      setIsSaving(false);
      showToast(`Saved ${leadsToSave.length} leads successfully!`);
      setExtractedData(null);
    };

    let completed = 0;
    let savedCount = 0;
    let errors = 0;

    leadsToSave.forEach(lead => {
      chrome.runtime.sendMessage({
        action: 'save_lead_to_db',
        leadData: lead,
        jwtToken: token,
        duplicateOption
      }, (res) => {
        completed++;
        if (res && res.success) {
          savedCount++;
        } else {
          errors++;
        }

        if (completed === leadsToSave.length) {
          setIsSaving(false);
          if (errors === leadsToSave.length) {
            // Server offline fallback local save
            saveLocally();
          } else {
            showToast(`Saved ${savedCount} leads to workspace!`);
            
            // Increment live credits locally to sync instantly
            const newCreditsUsed = creditsUsed + savedCount;
            setCreditsUsed(newCreditsUsed);

            setExtractedData(null);
            fetchLeads();
            fetchCreditsFromServer();
          }
        }
      });
    });
  };

  // 5. Fetch Leads List (Merges Local Storage and server API leads)
  const fetchLeads = async () => {
    const localLeads = JSON.parse(localStorage.getItem('mock_leads_db') || '[]');
    
    if (!token) {
      setLeadsList(localLeads);
      return;
    }
    setIsLoadingLeads(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/leads?search=${searchQuery}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        const backendLeads = data.leads || [];
        setLeadsList([...localLeads, ...backendLeads]);
      } else {
        setLeadsList(localLeads);
      }
    } catch (e) {
      setLeadsList(localLeads);
    } finally {
      setIsLoadingLeads(false);
    }
  };

  // 6. Fetch Workspaces
  const fetchWorkspaces = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/team/workspaces`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setWorkspaces(data.workspaces || []);
        if (data.workspaces.length > 0) {
          setSelectedWorkspace(data.workspaces[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 7. Team Invitation Submit
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/team/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Teammate invited! Token: ${data.token.substring(0, 8)}...`);
        setInviteEmail('');
      } else {
        showToast(data.error, 'error');
      }
    } catch (e) {
      showToast('Invitation failed', 'error');
    }
  };

  // 8. Payment Simulation triggers
  const handleUpgrade = async (planType: string) => {
    const baseUrl = IS_DEV_MODE ? 'http://localhost:3000' : 'https://leadsilly.com';
    const checkoutUrl = `${baseUrl}/checkout/?plan=${planType}&token=${encodeURIComponent(token || '')}`;
    chrome.tabs.create({ url: checkoutUrl });
  };

  // 9. CLIENT-SIDE DOWNLOAD EXPORTER
  const downloadExport = (format: 'csv' | 'xlsx' | 'pdf') => {
    if (leadsList.length === 0) {
      showToast('No leads available in workspace to export', 'error');
      return;
    }

    if (format === 'csv') {
      const headers = 'Name,Business Name,Email,Phone,Website,Address,LinkedIn,Source URL,Date Extracted\n';
      const rows = leadsList.map(l => {
        return `"${(l.name || '').replace(/"/g, '""')}",` +
               `"${(l.businessName || '').replace(/"/g, '""')}",` +
               `"${(l.email || '').replace(/"/g, '""')}",` +
               `"${(l.phone || '').replace(/"/g, '""')}",` +
               `"${(l.website || '').replace(/"/g, '""')}",` +
               `"${(l.address || '').replace(/"/g, '""')}",` +
               `"${(l.linkedinUrl || '').replace(/"/g, '""')}",` +
               `"${(l.sourceUrl || '').replace(/"/g, '""')}",` +
               `"${l.created_at || new Date().toISOString()}"`;
      }).join('\n');

      const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      chrome.downloads.download({
        url: url,
        filename: 'leadsilly_leads_export.csv',
        saveAs: true
      });
      showToast('CSV Export Downloaded!');
    }

    if (format === 'xlsx') {
      const headers = 'Name\tBusiness Name\tEmail\tPhone\tWebsite\tAddress\tLinkedIn\tSource URL\tDate Extracted\n';
      const rows = leadsList.map(l => {
        return `${l.name || 'N/A'}\t${l.businessName || 'N/A'}\t${l.email || 'N/A'}\t${l.phone || 'N/A'}\t${l.website || 'N/A'}\t${l.address || 'N/A'}\t${l.linkedinUrl || 'N/A'}\t${l.sourceUrl || 'N/A'}\t${l.created_at || new Date().toISOString()}`;
      }).join('\n');

      const blob = new Blob([headers + rows], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      chrome.downloads.download({
        url: url,
        filename: 'leadsilly_leads_export.xls',
        saveAs: true
      });
      showToast('Excel Export Downloaded!');
    }

    if (format === 'pdf') {
      const pdfHtml = `
        <html>
          <head>
            <title>Leadsilly Export Report</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 25px; color: #1e293b; margin: 0; }
              .header { border-bottom: 2px solid #3b82f6; padding-bottom: 12px; margin-bottom: 20px; }
              .title { font-size: 20px; font-weight: 700; color: #1e293b; }
              .meta { font-size: 11px; color: #64748b; margin-top: 4px; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th, td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; font-size: 10px; }
              th { background-color: #3b82f6; color: white; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
              tr:nth-child(even) { background-color: #f8fafc; }
              .footer { margin-top: 30px; text-align: center; font-size: 9px; color: #94a3b8; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title">Leadsilly - Leads Database Export</div>
              <div class="meta">Export Date: ${new Date().toLocaleDateString()} | Total Records: ${leadsList.length}</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Business Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Website</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                ${leadsList.map(l => `
                  <tr>
                    <td><strong>${l.businessName || 'N/A'}</strong></td>
                    <td>${l.email || 'N/A'}</td>
                    <td>${l.phone || 'N/A'}</td>
                    <td>${l.website || 'N/A'}</td>
                    <td>${l.address || 'N/A'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="footer">Generated via Leadsilly Extension.</div>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() { window.close(); }, 500);
              }
            </script>
          </body>
        </html>
      `;
      const blob = new Blob([pdfHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      chrome.tabs.create({ url });
      showToast('PDF Document Compiled!');
    }
  };

  const handleGoogleSheetsSync = async () => {
    if (leadsList.length === 0) {
      showToast('No leads available in workspace to sync', 'error');
      return;
    }
    setIsSyncingSheets(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/exports/google-sheets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ append: true })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Successfully synced to Google Sheets!');
        if (data.spreadsheetUrl) {
          chrome.tabs.create({ url: data.spreadsheetUrl });
        }
      } else {
        showToast(data.error || 'Failed to sync to Google Sheets', 'error');
      }
    } catch (e) {
      showToast('Connection to Google Sheets service failed', 'error');
    } finally {
      setIsSyncingSheets(false);
    }
  };

  return (
    <div className={`w-[390px] h-[580px] flex flex-col justify-between ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} relative transition-colors duration-200`}>
      
      {/* Toast Notifications */}
      {toast && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2 rounded-lg shadow-xl text-xs font-semibold animate-bounce ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-blue-500 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* HEADER SECTION */}
      <header className={`p-4 border-b ${theme === 'dark' ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-white/60'} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          {/* Custom yellow folder logo emblem */}
          <img src="icon128.png" className="w-8 h-8 rounded-lg object-contain shadow-md" alt="Leadsilly" />
          <div>
            <h1 className="text-sm font-black tracking-tight flex items-center gap-1.5">
              {/* No whitespace between — renders as one word "Leadsilly" */}
              <span>Lead<span className="text-amber-500">silly</span></span>

              {user && currentPlan !== 'Free' && (
                <span className="text-[8px] bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm shadow-amber-500/25 animate-pulse uppercase tracking-wider">
                  <Sparkles className="w-2.5 h-2.5" />
                  {currentPlan}
                </span>
              )}
            </h1>
            <p className="text-[10px] text-slate-400 -mt-1 font-medium">Contact Scraper Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={toggleTheme} 
            className={`p-1.5 rounded-lg border ${theme === 'dark' ? 'border-slate-800 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-100'} transition-all`}
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}
          </button>
          {user && (
            <button 
              onClick={handleLogout} 
              className="text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-1 rounded-md font-semibold hover:bg-rose-500/30"
            >
              Sign Out
            </button>
          )}
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 overflow-y-auto p-4">
        {!token ? (
          /* AUTHENTICATION PROMPT */
          <div className="h-full flex flex-col justify-center p-2">
            {/* OTP Verification Step */}
            {authStep === 'otp' ? (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-2xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-3xl mx-auto mb-3">
                    📧
                  </div>
                  <h2 className="text-sm font-bold">Verify your email</h2>
                  <p className="text-[10px] text-slate-400 mt-1 px-2">
                    We sent a verification link to:<br/>
                    <span className="text-amber-400 font-semibold">{emailInput}</span>
                  </p>
                  <p className="text-[9px] text-slate-500 mt-2 px-4 leading-normal">
                    Please open the email and click the confirmation link, then return here and click the verification button below.
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={handleVerifyLinkCheck}
                    disabled={isAuthLoading}
                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold py-2.5 rounded-lg text-xs transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    {isAuthLoading ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Checking status...</span></>
                    ) : (
                      <><CheckCircle2 className="w-3.5 h-3.5" /><span>I've Verified My Email</span></>
                    )}
                  </button>
                </div>

                <div className="text-center space-y-2">
                  <button
                    onClick={handleResendOTP}
                    disabled={otpResendTimer > 0 || isAuthLoading}
                    className="text-[10px] text-blue-400 hover:text-blue-300 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                  >
                    {otpResendTimer > 0 ? `Resend email in ${otpResendTimer}s` : 'Resend verification email'}
                  </button>
                  <br/>
                  <button
                    onClick={() => { setAuthStep('form'); setFirebaseUser(null); }}
                    className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    ← Back to signup / login
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Display Sign In / Sign Up Tabs */}
                <div className="text-center mb-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-2xl mx-auto mb-2 animate-pulse">
                    🔍
                  </div>
                  <h2 className="text-sm font-bold">Find B2B Contacts Instantly</h2>
                </div>

                <div className="flex border-b border-slate-800 mb-4 text-xs font-semibold">
                  <button 
                    type="button"
                    onClick={() => { setAuthMode('signin'); setAuthStep('form'); }}
                    className={`flex-1 pb-2 text-center transition-colors ${authMode === 'signin' ? 'text-amber-500 border-b-2 border-amber-500' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Sign In
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setAuthMode('signup'); setAuthStep('form'); }}
                    className={`flex-1 pb-2 text-center transition-colors ${authMode === 'signup' ? 'text-amber-500 border-b-2 border-amber-500' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Sign Up
                  </button>
                </div>

                <form onSubmit={handleEmailAuth} className="space-y-3">
                  {authMode === 'signup' && (
                    <div>
                      <label className="text-[10px] text-slate-400">Full Name</label>
                      <input 
                        type="text" 
                        placeholder="Enter your full name"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        className={`w-full p-2 mt-1 rounded text-xs border ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-900'}`}
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] text-slate-400">Email Address</label>
                    <input 
                      type="email" 
                      placeholder="name@company.com"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      className={`w-full p-2 mt-1 rounded text-xs border ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-900'}`}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Password</label>
                    <div className="relative">
                      <input 
                        type={showPassword ? "text" : "password"} 
                        placeholder="••••••••"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className={`w-full p-2 mt-1 pr-8 rounded text-xs border ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-900'}`}
                      />
                      <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-3 text-slate-400 hover:text-slate-200"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={isAuthLoading}
                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold py-2 rounded-lg text-xs mt-2 transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    {isAuthLoading ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Please wait...</span></>
                    ) : (
                      <span>{authMode === 'signup' ? 'Send Verification Link →' : 'Sign In'}</span>
                    )}
                  </button>

                  {authMode === 'signup' && (
                    <p className="text-[9px] text-slate-500 text-center">
                      We'll send a secure link to verify your email address 📧
                    </p>
                  )}
                </form>
              </>
            )}
          </div>
        ) : (
          /* LOGGED IN VIEWS */
          <>
            {activeTab === 'extract' && (
              <div className="space-y-4">
                {/* Credits indicator badge */}
                <div className={`p-2 rounded-lg border text-xs flex justify-between items-center ${theme === 'dark' ? 'bg-slate-900/35 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <span className="text-slate-400 font-semibold">Credits Limit ({currentPlan} Plan)</span>
                  <span className={`font-black px-2 py-0.5 rounded ${remainingCredits < 10 ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    {remainingCredits} / {maxLimit} Left
                  </span>
                </div>

                {/* Extraction Control */}
                <div className="flex gap-2">
                  <button
                    onClick={handleExtract}
                    disabled={isExtracting}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover-lift text-xs shadow-md shadow-blue-500/10"
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Scanning Page Results...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <span>Scrape Current Page</span>
                      </>
                    )}
                  </button>
                </div>

                {extractedData ? (
                  /* MULTI EXTRACTED RESULTS LIST */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-500">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        {extractedData.length} B2B Leads Identified
                      </span>
                      
                      <button 
                        onClick={() => {
                          if (selectedLeadIndices.length === extractedData.length) {
                            setSelectedLeadIndices([]);
                          } else {
                            setSelectedLeadIndices(extractedData.map((_: any, i: number) => i));
                          }
                        }}
                        className="text-[10px] text-blue-500 hover:text-blue-400 font-semibold"
                      >
                        {selectedLeadIndices.length === extractedData.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>

                    {/* Scrollable list container */}
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                      {extractedData.map((lead, idx) => (
                        <div key={idx} className={`p-2.5 rounded-lg border text-xs flex gap-2.5 items-start ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                          <input 
                            type="checkbox" 
                            checked={selectedLeadIndices.includes(idx)}
                            onChange={() => {
                              if (selectedLeadIndices.includes(idx)) {
                                setSelectedLeadIndices(selectedLeadIndices.filter(i => i !== idx));
                              } else {
                                setSelectedLeadIndices([...selectedLeadIndices, idx]);
                              }
                            }}
                            className="mt-1 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-bold truncate">{lead.businessName}</div>
                            <div className="grid grid-cols-1 gap-0.5 text-[10px] text-slate-400 mt-1">
                              <div className="truncate">🌐 Website: <span className="text-blue-400">{lead.website}</span></div>
                              <div>📞 Phone: {lead.phone}</div>
                              <div className="truncate">📍 Address: {lead.address}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Duplicate Strategy and Save Button */}
                    <div className="pt-2 border-t border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">Duplication Strategy</span>
                        <select 
                          value={duplicateOption} 
                          onChange={(e: any) => setDuplicateOption(e.target.value)}
                          className={`p-1 rounded border ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                        >
                          <option value="Skip">Skip Match</option>
                          <option value="Update">Overwrite</option>
                          <option value="Merge">Merge Fields</option>
                        </select>
                      </div>

                      <button
                        onClick={handleSaveLeads}
                        disabled={isSaving}
                        className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all shadow-md"
                      >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                        <span>Save {selectedLeadIndices.length} Selected Leads</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-500 text-xs">
                    No records parsed yet. Click scrape to scan active page.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'dashboard' && (
              <div className="space-y-4">
                {/* Credits indicator badge */}
                <div className={`p-2 rounded-lg border text-xs flex justify-between items-center ${theme === 'dark' ? 'bg-slate-900/35 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <span className="text-slate-400 font-semibold">Credits Limit ({currentPlan} Plan)</span>
                  <span className={`font-black px-2 py-0.5 rounded ${remainingCredits < 10 ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    {remainingCredits} / {maxLimit} Left
                  </span>
                </div>

                <div className="flex flex-col justify-center py-2 text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-500">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold">Workspace Leads Locked</h3>
                    <p className="text-[10px] text-slate-400 mt-1 max-w-[280px] mx-auto">
                      To maintain clean workspaces, data records are not displayed inside the extension popup dashboard. Download export files to view your listings.
                    </p>
                    <div className="text-slate-500 text-[9px] mt-2 font-semibold">
                      Total Extracted Leads: {leadsList.length} records
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 w-full space-y-2">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Download & Sync</div>
                    <div className="grid grid-cols-3 gap-2">
                      <button 
                        onClick={() => downloadExport('csv')}
                        className="bg-slate-800 hover:bg-slate-700 text-white font-semibold py-1.5 rounded text-[9px] flex items-center justify-center gap-1 transition-all"
                      >
                        <Download className="w-3.5 h-3.5" />
                        CSV
                      </button>
                      <button 
                        onClick={() => downloadExport('xlsx')}
                        className="bg-slate-800 hover:bg-slate-700 text-white font-semibold py-1.5 rounded text-[9px] flex items-center justify-center gap-1 transition-all"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        Excel
                      </button>
                      <button 
                        onClick={() => downloadExport('pdf')}
                        className="bg-slate-800 hover:bg-slate-700 text-white font-semibold py-1.5 rounded text-[9px] flex items-center justify-center gap-1 transition-all"
                      >
                        <Download className="w-3.5 h-3.5" />
                        PDF
                      </button>
                    </div>

                    <button
                      onClick={handleGoogleSheetsSync}
                      disabled={isSyncingSheets}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-[9px] flex items-center justify-center gap-1.5 transition-all shadow-md mt-1"
                    >
                      {isSyncingSheets ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Syncing to Google Sheets...</span>
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Sync to Google Sheets</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-4">
                {/* Workspace display */}
                <div className={`p-3 rounded-lg border ${theme === 'dark' ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <label className="text-[10px] font-bold text-slate-400">Workspace Selection</label>
                  <select 
                    value={selectedWorkspace}
                    onChange={(e) => setSelectedWorkspace(e.target.value)}
                    className={`w-full mt-1.5 p-2 rounded text-xs border ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                  >
                    {workspaces.map((ws, i) => (
                      <option key={i} value={ws.id}>{ws.name} ({ws.org_name})</option>
                    ))}
                  </select>
                </div>

                {/* Team invite */}
                <div className={`p-3 rounded-lg border ${theme === 'dark' ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <h4 className="text-[10px] font-bold text-slate-400 mb-2 flex items-center gap-1">
                    <UserPlus className="w-3.5 h-3.5" />
                    Invite Teammate
                  </h4>
                  <form onSubmit={handleInvite} className="flex gap-2">
                    <input 
                      type="email" 
                      placeholder="teammate@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className={`flex-1 px-2.5 py-1.5 rounded text-[11px] border ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                    />
                    <button 
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-3 rounded"
                    >
                      Invite
                    </button>
                  </form>
                </div>

                {/* Upgrades */}
                <div className={`p-3 rounded-lg border ${theme === 'dark' ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'} space-y-3`}>
                  <div className="text-[10px] font-bold text-slate-400">Upgrade Subscription</div>
                  
                  <div className="flex justify-between items-center text-xs border-b border-slate-850 pb-2">
                    <div>
                      <div className="font-bold">Individual Tier</div>
                      <div className="text-[9px] text-slate-400">500 leads/day & Sheets Sync</div>
                    </div>
                    <button 
                      onClick={() => handleUpgrade('Individual')}
                      disabled={currentPlan === 'Individual'}
                      className={`font-bold px-3 py-1 rounded text-[10px] flex items-center gap-1 shadow-sm transition-all ${
                        currentPlan === 'Individual' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/35 cursor-default'
                          : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                      }`}
                    >
                      {currentPlan === 'Individual' ? 'Active' : '$4/mo'}
                    </button>
                  </div>

                  <div className="flex justify-between items-center text-xs border-b border-slate-850 pb-2">
                    <div>
                      <div className="font-bold">Team Tier</div>
                      <div className="text-[9px] text-slate-400">2,500 leads/day & Teammates</div>
                    </div>
                    <button 
                      onClick={() => handleUpgrade('Team')}
                      disabled={currentPlan === 'Team'}
                      className={`font-bold px-3 py-1 rounded text-[10px] flex items-center gap-1 shadow-sm transition-all ${
                        currentPlan === 'Team' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/35 cursor-default'
                          : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                      }`}
                    >
                      {currentPlan === 'Team' ? 'Active' : '$15/mo'}
                    </button>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <div>
                      <div className="font-bold">Agency Tier</div>
                      <div className="text-[9px] text-slate-400">10,000 leads/day & CRM Sync</div>
                    </div>
                    <button 
                      onClick={() => handleUpgrade('Agency')}
                      disabled={currentPlan === 'Agency'}
                      className={`font-bold px-3 py-1 rounded text-[10px] flex items-center gap-1 shadow-sm transition-all ${
                        currentPlan === 'Agency' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/35 cursor-default'
                          : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                      }`}
                    >
                      {currentPlan === 'Agency' ? 'Active' : '$49/mo'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* FOOTER TAB NAV */}
      <footer className={`p-2 border-t ${theme === 'dark' ? 'border-slate-850 bg-slate-950' : 'border-slate-200 bg-white'} flex flex-col items-center gap-1.5`}>
        {token && (
          <div className="flex justify-around text-xs w-full">
            <button 
              onClick={() => setActiveTab('extract')}
              className={`flex flex-col items-center gap-1 py-1 px-4 rounded-lg transition-colors ${activeTab === 'extract' ? 'text-amber-500 font-bold' : 'text-slate-400'}`}
            >
              <Search className="w-4 h-4" />
              <span className="text-[9px]">Scraper</span>
            </button>
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`flex flex-col items-center gap-1 py-1 px-4 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'text-amber-500 font-bold' : 'text-slate-400'}`}
            >
              <Database className="w-4 h-4" />
              <span className="text-[9px]">Workspace</span>
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`flex flex-col items-center gap-1 py-1 px-4 rounded-lg transition-colors ${activeTab === 'settings' ? 'text-amber-500 font-bold' : 'text-slate-400'}`}
            >
              <Settings className="w-4 h-4" />
              <span className="text-[9px]">Settings</span>
            </button>
          </div>
        )}
        <div className="text-[9px] text-slate-500 text-center font-medium border-t border-dashed border-slate-900 pt-1.5 w-full">
          Official Website: <a href="https://leadsilly.com" target="_blank" className="text-amber-500 font-semibold hover:underline">leadsilly.com</a>
        </div>
      </footer>
    </div>
  );
}
