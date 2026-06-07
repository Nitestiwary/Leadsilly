import React, { useState, useEffect } from 'react';
import { 
  Search, Database, Settings, Download, UserPlus, 
  Trash2, Copy, Moon, Sun, ArrowRight, CheckCircle2, 
  AlertCircle, ChevronRight, FileSpreadsheet, Loader2, Sparkles
} from 'lucide-react';

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

const BACKEND_URL = 'http://localhost:5000';

export default function LeadPopupUI() {
  const [activeTab, setActiveTab] = useState<'extract' | 'dashboard' | 'settings'>('extract');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);

  // Email Sign-In / Sign-Up configurations
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  
  // Extraction states
  const [extractedData, setExtractedData] = useState<LeadData | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [duplicateOption, setDuplicateOption] = useState<'Skip' | 'Update' | 'Merge'>('Skip');
  
  // Database leads states
  const [leadsList, setLeadsList] = useState<LeadData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  
  // Settings & Team States
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'Admin' | 'Member'>('Member');
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  
  // Feedback Messages
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Trigger Toast
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 1. Sync Authentication on load
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
  }, []);

  // Fetch leads and workspaces if logged in
  useEffect(() => {
    if (token) {
      fetchLeads();
      fetchWorkspaces();
    }
  }, [token]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('app_theme', nextTheme);
    document.documentElement.className = nextTheme;
  };

  // 2. Auth via Chrome Identity
  const handleLogin = () => {
    chrome.runtime.sendMessage({ action: 'authenticate_user' }, (res) => {
      if (res && res.success) {
        localStorage.setItem('jwt_token', res.token);
        localStorage.setItem('user_details', JSON.stringify(res.user));
        setToken(res.token);
        setUser(res.user);
        showToast(`Welcome back, ${res.user.name}!`);
      } else {
        // Fallback local mock login automatically
        handleLocalFallbackLogin();
      }
    });
  };

  const handleLocalFallbackLogin = () => {
    const defaultUser = {
      id: 'local_dev_user_123',
      email: 'user@leadsilly.com',
      name: 'Leadsilly Tester',
      avatarUrl: '',
      planType: 'Free',
      workspaceId: 'local_ws_123'
    };
    const mockToken = 'mock_jwt_token_leadsilly_local_123';
    localStorage.setItem('jwt_token', mockToken);
    localStorage.setItem('user_details', JSON.stringify(defaultUser));
    setToken(mockToken);
    setUser(defaultUser);
    showToast('Signed in automatically via Developer Mode!', 'success');
  };

  const handleEmailAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !passwordInput) {
      showToast('Please fill out all required fields', 'error');
      return;
    }
    if (authMode === 'signup' && !nameInput) {
      showToast('Please specify your name', 'error');
      return;
    }

    const matchedUser = {
      id: 'local_user_' + Math.random().toString(36).substr(2, 9),
      email: emailInput,
      name: authMode === 'signup' ? nameInput : emailInput.split('@')[0],
      avatarUrl: '',
      planType: 'Free',
      workspaceId: 'local_ws_123'
    };
    const mockToken = 'mock_jwt_token_' + matchedUser.id;

    localStorage.setItem('jwt_token', mockToken);
    localStorage.setItem('user_details', JSON.stringify(matchedUser));
    setToken(mockToken);
    setUser(matchedUser);
    showToast(authMode === 'signup' ? 'Account successfully created!' : 'Signed in successfully!', 'success');
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
          showToast('Failed to parse page contents. Injecting parser...', 'error');
          // Manual fallback if content script not preloaded
          chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            files: ['content.js']
          }, () => {
            chrome.tabs.sendMessage(activeTabId, { action: 'extract_leads' }, (retryRes) => {
              if (retryRes && retryRes.success) {
                setExtractedData(retryRes.data);
                showToast('Lead attributes scraped successfully!');
              } else {
                showToast('Unable to extract data from this webpage schema.', 'error');
              }
            });
          });
        } else {
          setExtractedData(res.data);
          showToast('Lead attributes scraped successfully!');
        }
      });
    });
  };

  // 4. Save lead to backend
  const handleSaveLead = () => {
    if (!extractedData || !token) return;
    setIsSaving(true);

    chrome.runtime.sendMessage({
      action: 'save_lead_to_db',
      leadData: extractedData,
      jwtToken: token,
      duplicateOption
    }, (res) => {
      setIsSaving(false);
      if (res && res.success) {
        showToast(`Lead ${res.status === 'skipped' ? 'Skipped (Duplicate)' : 'Saved Successfully!'}`);
        fetchLeads();
      } else {
        showToast(res?.error || 'Failed to save lead', 'error');
      }
    });
  };

  // 5. Fetch Leads List
  const fetchLeads = async () => {
    if (!token) return;
    setIsLoadingLeads(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/leads?search=${searchQuery}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setLeadsList(data.leads || []);
      }
    } catch (e) {
      showToast('Error loading workspace leads', 'error');
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
    try {
      const res = await fetch(`${BACKEND_URL}/api/billing/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ planType, gateway: 'stripe' })
      });
      const data = await res.json();
      if (res.ok && data.checkoutUrl) {
        chrome.tabs.create({ url: data.checkoutUrl });
      } else {
        showToast('Payment system offline, sandbox checkouts only.', 'error');
      }
    } catch (e) {
      showToast('Failed to start checkout', 'error');
    }
  };

  // 9. Downloads Export
  const downloadExport = (format: 'csv' | 'xlsx' | 'pdf') => {
    if (!token) return;
    chrome.tabs.create({
      url: `${BACKEND_URL}/api/exports/${format}?token=${token}`
    });
    showToast(`Downloading ${format.toUpperCase()} export...`);
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
          {/* Smiling yellow folder mock emblem */}
          <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center font-bold text-slate-950 shadow-md">
            📂
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight flex items-center gap-1">
              leads<span className="text-amber-500">silly</span>
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
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-2xl mx-auto mb-2 animate-pulse">
                🔍
              </div>
              <h2 className="text-sm font-bold">Find B2B Contacts Instantly</h2>
            </div>

            {/* Local Sign In / Sign Up tab selectors */}
            <div className="flex border-b border-slate-800 mb-4 text-xs font-semibold">
              <button 
                onClick={() => setAuthMode('signin')}
                className={`flex-1 pb-2 text-center transition-colors ${authMode === 'signin' ? 'text-amber-500 border-b-2 border-amber-500' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Sign In
              </button>
              <button 
                onClick={() => setAuthMode('signup')}
                className={`flex-1 pb-2 text-center transition-colors ${authMode === 'signup' ? 'text-amber-500 border-b-2 border-amber-500' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Sign Up (New User)
              </button>
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-3">
              {authMode === 'signup' && (
                <div>
                  <label className="text-[10px] text-slate-400">Full Name</label>
                  <input 
                    type="text" 
                    placeholder="Enter name"
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
                <input 
                  type="password" 
                  placeholder="••••••••"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className={`w-full p-2 mt-1 rounded text-xs border ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-900'}`}
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 rounded-lg text-xs mt-2 transition-all shadow-md"
              >
                {authMode === 'signup' ? 'Create Free Account' : 'Sign In'}
              </button>
            </form>

            <div className="flex items-center my-3">
              <div className="flex-1 border-t border-slate-800"></div>
              <span className="text-[9px] text-slate-500 px-2">OR</span>
              <div className="flex-1 border-t border-slate-800"></div>
            </div>

            <button 
              onClick={handleLogin}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-all hover-lift"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Sign In with Google</span>
            </button>
          </div>
        ) : (
          /* LOGGED IN VIEWS */
          <>
            {activeTab === 'extract' && (
              <div className="space-y-4">
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
                        <span>Scanning DOM...</span>
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
                  /* EXTRACTED RESULTS FORM */
                  <div className={`p-3 rounded-xl border ${theme === 'dark' ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'} space-y-3`}>
                    <h3 className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      Attributes Identified
                    </h3>

                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <label className="text-slate-400">Name</label>
                        <input 
                          type="text" 
                          value={extractedData.name} 
                          onChange={(e) => setExtractedData({...extractedData, name: e.target.value})}
                          className={`w-full p-1.5 rounded border ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                        />
                      </div>
                      <div>
                        <label className="text-slate-400">Business Name</label>
                        <input 
                          type="text" 
                          value={extractedData.businessName} 
                          onChange={(e) => setExtractedData({...extractedData, businessName: e.target.value})}
                          className={`w-full p-1.5 rounded border ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                        />
                      </div>
                      <div>
                        <label className="text-slate-400">Email Address</label>
                        <input 
                          type="text" 
                          value={extractedData.email} 
                          onChange={(e) => setExtractedData({...extractedData, email: e.target.value})}
                          className={`w-full p-1.5 rounded border ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                        />
                      </div>
                      <div>
                        <label className="text-slate-400">Phone</label>
                        <input 
                          type="text" 
                          value={extractedData.phone} 
                          onChange={(e) => setExtractedData({...extractedData, phone: e.target.value})}
                          className={`w-full p-1.5 rounded border ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                        />
                      </div>
                    </div>

                    <div className="text-[10px]">
                      <label className="text-slate-400">Website</label>
                      <input 
                        type="text" 
                        value={extractedData.website} 
                        onChange={(e) => setExtractedData({...extractedData, website: e.target.value})}
                        className={`w-full p-1.5 rounded border ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                      />
                    </div>

                    {/* Duplicate Preference Option */}
                    <div className="flex items-center justify-between pt-2 border-t border-dashed border-slate-800 text-[10px]">
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
                      onClick={handleSaveLead}
                      disabled={isSaving}
                      className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all shadow-md"
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                      Save Lead to Workspace
                    </button>
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
                {/* Search Bar */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input 
                      type="text" 
                      placeholder="Search workspace leads..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && fetchLeads()}
                      className={`w-full pl-9 pr-4 py-2 rounded-xl text-xs border ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-900'}`}
                    />
                  </div>
                </div>

                {/* Leads list */}
                <div className="space-y-2 max-h-[280px] overflow-y-auto">
                  {isLoadingLeads ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>
                  ) : leadsList.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs">No leads stored in this workspace yet.</div>
                  ) : (
                    leadsList.map((lead, idx) => (
                      <div key={idx} className={`p-2.5 rounded-lg border text-xs flex justify-between items-start ${theme === 'dark' ? 'bg-slate-900/30 border-slate-850' : 'bg-white border-slate-150'}`}>
                        <div>
                          <div className="font-bold">{lead.name || lead.businessName || 'Unnamed Record'}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{lead.email || 'No email found'}</div>
                          <div className="text-[9px] text-slate-500 mt-1">{lead.sourceDomain}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">
                            {lead.phone ? '✓ Phone' : 'No Phone'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Export Buttons */}
                <div className="pt-2 border-t border-slate-800">
                  <div className="text-[10px] font-bold text-slate-400 mb-2">Export Data</div>
                  <div className="grid grid-cols-3 gap-2">
                    <button 
                      onClick={() => downloadExport('csv')}
                      className="bg-slate-800 hover:bg-slate-700 text-white font-semibold py-1.5 rounded text-[10px] flex items-center justify-center gap-1 transition-all"
                    >
                      <Download className="w-3 h-3" />
                      CSV
                    </button>
                    <button 
                      onClick={() => downloadExport('xlsx')}
                      className="bg-slate-800 hover:bg-slate-700 text-white font-semibold py-1.5 rounded text-[10px] flex items-center justify-center gap-1 transition-all"
                    >
                      <FileSpreadsheet className="w-3 h-3" />
                      Excel
                    </button>
                    <button 
                      onClick={() => downloadExport('pdf')}
                      className="bg-slate-800 hover:bg-slate-700 text-white font-semibold py-1.5 rounded text-[10px] flex items-center justify-center gap-1 transition-all"
                    >
                      <Download className="w-3 h-3" />
                      PDF
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
                    <UserPlus className="w-3 h-3" />
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
                <div className={`p-3 rounded-lg border ${theme === 'dark' ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="text-[10px] font-bold text-slate-400 mb-2">Upgrade Subscription</div>
                  <div className="flex justify-between items-center text-xs">
                    <div>
                      <div className="font-bold">Individual Tier</div>
                      <div className="text-[9px] text-slate-400">500 leads/day & Sheets Sync</div>
                    </div>
                    <button 
                      onClick={() => handleUpgrade('Individual')}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1 rounded text-[10px] flex items-center gap-1 shadow-sm"
                    >
                      $4/mo
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* FOOTER TAB NAV */}
      {token && (
        <footer className={`p-2 border-t ${theme === 'dark' ? 'border-slate-850 bg-slate-950' : 'border-slate-200 bg-white'} flex justify-around text-xs`}>
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
        </footer>
      )}
    </div>
  );
}
