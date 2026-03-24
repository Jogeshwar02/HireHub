import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Briefcase, 
  User, 
  Shield, 
  LogOut, 
  Plus, 
  CheckCircle, 
  XCircle, 
  Search, 
  Filter,
  ArrowUpDown,
  ChevronDown,
  BarChart3,
  Building2,
  GraduationCap,
  FileText,
  ChevronRight,
  Loader2,
  Globe,
  Linkedin,
  Github,
  MapPin,
  Users,
  ExternalLink,
  Clock,
  Zap,
  TrendingUp,
  ArrowRight,
  MessageCircle,
  MessageSquare,
  Send,
  X,
  Calendar,
  Video,
  Bell,
  BellRing,
  Trash2,
  Phone,
  Camera,
  Bookmark,
  Mail,
  Star
} from 'lucide-react';
import { cn } from './lib/utils';
import { User as UserType, Job, Application, StudentProfile, RecruiterProfile, Message, Interview, Notification as NotificationType, FriendRequest, Friendship } from './types';

// --- Components ---

const Button = ({ className, variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'danger' }) => {
  const variants = {
    primary: 'bg-black text-white hover:bg-zinc-800',
    secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
    outline: 'border border-zinc-200 text-zinc-700 hover:bg-zinc-50',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100',
    neutral: 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200',
  };
  return (
    <button 
      className={cn('px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2', variants[variant], className)} 
      {...props} 
    />
  );
};

const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input className={cn('w-full px-4 py-2 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all', className)} {...props} />
);

const Card = ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: any }) => (
  <div className={cn('bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm', className)} {...props}>{children}</div>
);

const Badge = ({ children, variant = 'neutral', ...props }: { children?: React.ReactNode; variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; [key: string]: any }) => {
  const variants = {
    neutral: 'bg-zinc-100 text-zinc-600',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
    warning: 'bg-amber-50 text-amber-700 border border-amber-100',
    danger: 'bg-red-50 text-red-700 border border-red-100',
    info: 'bg-blue-50 text-blue-700 border border-blue-100',
  };
  return <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', variants[variant])}>{children}</span>;
};

const LoadingPage = () => (
  <div className="h-screen w-full flex flex-col items-center justify-center bg-[#F9F9F9]">
    <motion.div 
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex flex-col items-center"
    >
      <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center text-white text-3xl font-bold mb-6 shadow-xl shadow-black/10">
        H
      </div>
      <h2 className="text-xl font-bold tracking-tight mb-2">HireHub</h2>
      <div className="flex items-center gap-2 text-zinc-400 text-sm font-medium">
        <Loader2 className="animate-spin" size={16} />
        <span>Initializing your workspace...</span>
      </div>
    </motion.div>
    
    <div className="absolute bottom-12 text-zinc-300 text-xs font-medium uppercase tracking-widest">
      Quality Matching • Quality Careers
    </div>
  </div>
);

const safeParse = (data: any, fallback: any = []) => {
  if (!data) return fallback;
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch (e) {
    // If it's a comma-separated string, convert to array
    if (typeof data === 'string' && data.includes(',')) {
      return data.split(',').map(s => s.trim()).filter(Boolean);
    }
    return fallback;
  }
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'dashboard' | 'jobs' | 'applications' | 'interviews' | 'profile' | 'admin' | 'network' | 'saved'>('dashboard');
  const [isAnalyzerOpen, setIsAnalyzerOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [lastNotificationId, setLastNotificationId] = useState<string | number | null>(null);
  const lastNotificationIdRef = useRef<string | number | null>(null);
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [toast, setToast] = useState<{ title: string; content: string; link?: string } | null>(null);
  const [viewParams, setViewParams] = useState<any>(null);
  const [savedJobIds, setSavedJobIds] = useState<string[]>([]);

  useEffect(() => {
    console.log('[App] Initial checkAuth call');
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      if (user.role === 'STUDENT') {
        fetchSavedJobs();
      }
      const interval = setInterval(fetchNotifications, 10000); // Poll every 10s
      
      // Request notification permission
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
        
        // Check for new notifications
        const unread = data.filter((n: any) => !n.is_read);
        if (unread.length > 0) {
          const latestId = unread[0].id;
          if (latestId !== lastNotificationIdRef.current) {
            const latest = unread[0];
            setToast({ title: latest.title, content: latest.content, link: latest.link });
            setTimeout(() => setToast(null), 5000);
            
            // Browser notification
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(latest.title, { body: latest.content });
            }
            lastNotificationIdRef.current = latestId;
            setLastNotificationId(latestId);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  };

  const fetchSavedJobs = async () => {
    try {
      const res = await fetch('/api/jobs/saved');
      if (res.ok) {
        const data = await res.json();
        setSavedJobIds(data.map((j: any) => String(j.id)));
      }
    } catch (err) {
      console.error('Failed to fetch saved jobs:', err);
    }
  };

  const toggleSave = async (e: React.MouseEvent, jobId: string | number) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/jobs/${jobId}/save`, { method: 'POST' });
      if (res.ok) {
        const { saved } = await res.json();
        setSavedJobIds(prev => 
          saved ? [...prev, String(jobId)] : prev.filter(id => id !== String(jobId))
        );
      }
    } catch (err) {
      console.error('Failed to toggle save:', err);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'PUT' });
      fetchNotifications();
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const handleNavigate = (link: string) => {
    if (link.startsWith('/jobs')) setView('jobs');
    if (link.startsWith('/applications')) {
      setView('applications');
      const match = link.match(/\?id=([^&]+)/);
      if (match) {
        setViewParams({ applicationId: match[1] });
      } else {
        setViewParams(null);
      }
    }
    if (link.startsWith('/interviews')) setView('interviews');
    if (link.startsWith('/profile')) setView('profile');
    if (link.startsWith('/dashboard')) setView('dashboard');
    if (link.startsWith('/analyzer')) setIsAnalyzerOpen(true);
    setShowNotifications(false);
  };

  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'PUT' });
      fetchNotifications();
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  const checkAuth = async (isSignup?: boolean) => {
    console.log('[App] checkAuth started');
    try {
      const res = await fetch('/api/auth/me');
      console.log('[App] checkAuth response status:', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('[App] checkAuth success, user:', data.user?.email);
        setUser(data.user);
        if (isSignup) {
          setView('profile');
          setIsFirstTime(true);
        }
      } else {
        console.log('[App] checkAuth failed (unauthorized)');
      }
    } catch (err) {
      console.error('[App] checkAuth error:', err);
    } finally {
      console.log('[App] checkAuth finished, setting loading to false');
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setView('dashboard');
  };

  if (loading) return <LoadingPage />;

  if (!user) return <AuthPage onAuth={checkAuth} mode={authMode} setMode={setAuthMode} />;

  return (
    <div className="min-h-screen bg-[#F9F9F9] flex flex-col">
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            onClick={() => {
              if (toast.link) handleNavigate(toast.link);
              setToast(null);
            }}
            className="fixed bottom-24 left-4 right-4 md:left-1/2 md:right-auto md:w-auto md:min-w-[400px] md:-translate-x-1/2 z-[100] bg-black text-white px-4 py-3 md:px-6 md:py-4 rounded-2xl shadow-2xl flex items-center gap-3 md:gap-4 border border-white/10 cursor-pointer hover:bg-zinc-900 transition-colors"
          >
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-emerald-400 shrink-0">
              <BellRing size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{toast.title}</p>
              <p className="text-xs text-zinc-400 truncate">{toast.content}</p>
            </div>
            <button onClick={() => setToast(null)} className="text-zinc-500 hover:text-white shrink-0">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className="bg-white border-bottom border-zinc-100 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-8">
          <h1 className="text-xl font-bold tracking-tighter flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white">H</div>
            HireHub
          </h1>
          <div className="hidden md:flex items-center gap-1">
            <NavButton active={view === 'dashboard'} onClick={() => setView('dashboard')} icon={<BarChart3 size={18} />}>Dashboard</NavButton>
            <NavButton active={view === 'jobs'} onClick={() => setView('jobs')} icon={<Briefcase size={18} />}>Jobs</NavButton>
            <NavButton active={view === 'network'} onClick={() => setView('network')} icon={<Users size={18} />}>Network</NavButton>
            {user.role === 'STUDENT' && (
              <NavButton active={view === 'saved'} onClick={() => setView('saved')} icon={<Bookmark size={18} />}>Saved</NavButton>
            )}
            <NavButton active={view === 'applications'} onClick={() => setView('applications')} icon={<FileText size={18} />}>Applications</NavButton>
            <NavButton active={view === 'interviews'} onClick={() => setView('interviews')} icon={<Calendar size={18} />}>Interviews</NavButton>
            {user.role === 'ADMIN' && (
              <NavButton active={view === 'admin'} onClick={() => setView('admin')} icon={<Shield size={18} />}>Admin</NavButton>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 text-zinc-400 hover:text-black hover:bg-zinc-50 rounded-full transition-all relative"
            >
              <Bell size={20} />
              {notifications.filter(n => !n.is_read).length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
              )}
            </button>
            
            <AnimatePresence>
              {showNotifications && (
                <NotificationCenter 
                  notifications={notifications} 
                  onClose={() => setShowNotifications(false)} 
                  onMarkRead={markAsRead}
                  onMarkAllRead={markAllAsRead}
                  onNavigate={handleNavigate}
                />
              )}
            </AnimatePresence>
          </div>

          <button onClick={() => setView('profile')} className="flex items-center gap-2 hover:bg-zinc-50 p-1 pr-3 rounded-full transition-all">
            <div className="w-8 h-8 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-600 overflow-hidden">
              {user.profile_picture_url ? (
                <img src={user.profile_picture_url} alt={user.name || 'User'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User size={18} />
              )}
            </div>
            <span className="text-sm font-medium text-zinc-700">{user.name || user.email.split('@')[0]}</span>
          </button>
          <button onClick={handleLogout} className="text-zinc-400 hover:text-red-500 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 pb-24 md:pb-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {view === 'dashboard' && <Dashboard user={user} setView={setView} onRefreshNotifications={fetchNotifications} />}
            {view === 'jobs' && <JobsView user={user} savedJobIds={savedJobIds} onToggleSave={toggleSave} />}
            {view === 'saved' && user.role === 'STUDENT' && (
              <SavedJobsView 
                user={user} 
                onSelectJob={(job) => {
                  // This is a bit hacky but works to open the job details from saved view
                  // We'd ideally want a more robust way to handle cross-view job selection
                  setView('jobs');
                  // We need a way to pass the selected job to JobsView
                }} 
                onToggleSave={toggleSave}
              />
            )}
            {view === 'applications' && <ApplicationsView user={user} viewParams={viewParams} />}
            {view === 'interviews' && <InterviewsView user={user} />}
            {view === 'network' && <NetworkView user={user} setToast={setToast} />}
            {view === 'profile' && (
              <ProfileView 
                user={user} 
                onUpdate={() => {
                  checkAuth();
                  if (isFirstTime) {
                    setView('dashboard');
                    setIsFirstTime(false);
                  }
                }} 
              />
            )}
            {view === 'admin' && user.role === 'ADMIN' && <AdminView />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-100 flex items-center justify-around py-3 px-4 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
        <MobileNavButton active={view === 'dashboard'} onClick={() => setView('dashboard')} icon={<BarChart3 size={20} />} label="Home" />
        {user.role === 'STUDENT' && (
          <MobileNavButton active={view === 'saved'} onClick={() => setView('saved')} icon={<Bookmark size={20} />} label="Saved" />
        )}
        <MobileNavButton active={view === 'jobs'} onClick={() => setView('jobs')} icon={<Briefcase size={20} />} label="Jobs" />
        <MobileNavButton active={view === 'network'} onClick={() => setView('network')} icon={<Users size={20} />} label="Network" />
        <MobileNavButton active={view === 'applications'} onClick={() => setView('applications')} icon={<FileText size={20} />} label="Apps" />
        <MobileNavButton active={view === 'interviews'} onClick={() => setView('interviews')} icon={<Calendar size={20} />} label="Events" />
        <MobileNavButton active={view === 'profile'} onClick={() => setView('profile')} icon={<User size={20} />} label="Profile" />
      </nav>

      {/* Floating Resume Analyzer Button */}
      {user.role === 'STUDENT' && (
        <div className="fixed bottom-24 md:bottom-8 right-6 z-40">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsAnalyzerOpen(true)}
            className="w-14 h-14 bg-black text-white rounded-full shadow-lg flex items-center justify-center hover:bg-zinc-800 transition-colors group relative"
          >
            <Zap size={24} />
            <span className="absolute right-full mr-3 px-2 py-1 bg-zinc-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              Resume Analyzer
            </span>
          </motion.button>
        </div>
      )}

      {/* Resume Analyzer Modal */}
      <AnimatePresence>
        {isAnalyzerOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAnalyzerOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white">
                    <Zap size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Resume AI Analyzer</h3>
                    <p className="text-xs text-zinc-500">Get professional feedback and ATS tips</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsAnalyzerOpen(false)}
                  className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <ResumeAnalyzer user={user} />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavButton({ children, active, onClick, icon }: { children: React.ReactNode; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all',
        active ? 'bg-zinc-100 text-black' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function MobileNavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 transition-all flex-1',
        active ? 'text-black' : 'text-zinc-400'
      )}
    >
      <div className={cn(
        "p-1 rounded-lg transition-all",
        active ? "bg-zinc-100" : ""
      )}>
        {icon}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
    </button>
  );
}

// --- Auth Page ---

function AuthPage({ onAuth, mode, setMode }: { onAuth: (isSignup?: boolean) => void; mode: 'login' | 'register'; setMode: (m: 'login' | 'register') => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'STUDENT' | 'RECRUITER'>('STUDENT');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login' ? { email, password } : { email, password, role, name, company_name: companyName, username };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        onAuth(mode === 'register');
      } else {
        const message = data?.error || data?.message || `Server error (${res.status})`;
        setError(message);
      }
    } catch (err: any) {
      console.error('Auth submission error', err);
      setError(err?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F9F9F9] p-6">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center text-white mx-auto mb-4 text-2xl font-bold">H</div>
          <h2 className="text-2xl font-bold tracking-tight">Welcome to HireHub</h2>
          <p className="text-zinc-500 text-sm mt-1">Quality matching for quality careers.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div className="flex p-1 bg-zinc-100 rounded-lg mb-4">
                <button type="button" onClick={() => setRole('STUDENT')} className={cn('flex-1 py-1.5 text-sm font-medium rounded-md transition-all', role === 'STUDENT' ? 'bg-white shadow-sm text-black' : 'text-zinc-500')}>Student</button>
                <button type="button" onClick={() => setRole('RECRUITER')} className={cn('flex-1 py-1.5 text-sm font-medium rounded-md transition-all', role === 'RECRUITER' ? 'bg-white shadow-sm text-black' : 'text-zinc-500')}>Recruiter</button>
              </div>
              <Input name="username" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username" />
            </>
          )}

          {mode === 'register' && (
            role === 'STUDENT' ? (
              <Input name="name" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" />
            ) : (
              <Input name="company" placeholder="Company Name" value={companyName} onChange={e => setCompanyName(e.target.value)} required autoComplete="organization" />
            )
          )}

          <Input name="email" type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          <Input name="password" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />

          {error && <p className="text-red-500 text-xs font-medium">{error}</p>}

          <Button type="submit" className="w-full py-3" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={20} /> : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="text-sm text-zinc-500 hover:text-black transition-colors">
            {mode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </Card>
    </div>
  );
}

function NotificationCenter({ 
  notifications, 
  onClose, 
  onMarkRead, 
  onMarkAllRead,
  onNavigate 
}: { 
  notifications: NotificationType[]; 
  onClose: () => void; 
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onNavigate: (link: string) => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div 
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95 }}
        className="fixed md:absolute top-16 md:top-full left-4 right-4 md:left-auto md:right-0 mt-2 md:w-80 bg-white rounded-2xl shadow-2xl border border-zinc-100 z-50 overflow-hidden"
      >
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <h3 className="font-bold text-sm">Notifications</h3>
          <button 
            onClick={onMarkAllRead}
            className="text-[10px] font-bold text-zinc-400 hover:text-black uppercase tracking-wider"
          >
            Mark all as read
          </button>
        </div>
        
        <div className="max-h-[400px] overflow-y-auto divide-y divide-zinc-50">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell size={24} className="mx-auto text-zinc-200 mb-2" />
              <p className="text-xs text-zinc-400">No notifications yet.</p>
            </div>
          ) : (
            notifications.map(n => (
              <div 
                key={n.id} 
                onClick={() => {
                  if (!n.is_read) onMarkRead(n.id);
                  if (n.link) onNavigate(n.link);
                }}
                className={cn(
                  "p-4 hover:bg-zinc-50 transition-colors cursor-pointer relative",
                  !n.is_read ? "bg-blue-50/30" : ""
                )}
              >
                {!n.is_read && <div className="absolute top-4 right-4 w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                <div className="flex gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    n.type === 'JOB_POSTED' ? "bg-emerald-50 text-emerald-600" :
                    n.type === 'APP_STATUS' ? "bg-amber-50 text-amber-600" :
                    n.type === 'INTERVIEW' ? "bg-blue-50 text-blue-600" :
                    "bg-indigo-50 text-indigo-600"
                  )}>
                    {n.type === 'JOB_POSTED' ? <Briefcase size={14} /> :
                     n.type === 'APP_STATUS' ? <FileText size={14} /> :
                     n.type === 'INTERVIEW' ? <Calendar size={14} /> :
                     <MessageCircle size={14} />}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-900">{n.title}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{n.content}</p>
                    <p className="text-[9px] text-zinc-400 mt-1 uppercase font-medium">{new Date(n.created_at).toLocaleDateString()} • {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="p-3 bg-zinc-50 border-t border-zinc-100 text-center">
          <button className="text-[10px] font-bold text-zinc-400 hover:text-black uppercase tracking-widest">View History</button>
        </div>
      </motion.div>
    </>
  );
}

// --- Resume Analyzer ---

function ResumeAnalyzer({ user }: { user: UserType }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/resume-analyses');
      if (res.ok) {
        const text = await res.text();
        try {
          setHistory(JSON.parse(text));
        } catch (e) {
          console.error('Failed to parse history JSON:', text);
        }
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setAnalysis(null);
      setError(null);
    }
  };

  const analyzeResume = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    const safeJson = async (res: Response) => {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        return { error: text || 'Unknown server error' };
      }
    };

    try {
      // 1. Extract text from PDF via backend
      const formData = new FormData();
      formData.append('file', file);
      const extractRes = await fetch('/api/extract-text', {
        method: 'POST',
        body: formData,
      });

      const extractData = await safeJson(extractRes);
      if (!extractRes.ok) {
        throw new Error(extractData.error || 'Failed to extract text from PDF');
      }
      const { text } = extractData;

      // 2. Call server for analysis
      const analysisRes = await fetch('/api/analyze-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const analysisData = await safeJson(analysisRes);
      if (!analysisRes.ok) {
        throw new Error(analysisData.error || 'Failed to analyze resume');
      }

      const result = analysisData;
      setAnalysis(result);

      // 3. Save analysis to backend
      await fetch('/api/resume-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_name: file.name,
          score: result.score,
          analysis_json: result
        }),
      });

      fetchHistory();
    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err.message || 'Failed to analyze resume');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Resume AI Analyzer</h2>
          <p className="text-zinc-500 mt-1">Get professional feedback and ATS optimization tips for your resume.</p>
        </div>
        <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center text-white">
          <Zap size={24} />
        </div>
      </div>

      <Card className="p-8 border-dashed border-2 border-zinc-200 bg-zinc-50/50 text-center">
        <div className="max-w-sm mx-auto space-y-4">
          <div className="w-16 h-16 bg-white rounded-2xl shadow-sm mx-auto flex items-center justify-center text-zinc-400">
            <FileText size={32} />
          </div>
          <div>
            <h4 className="font-bold text-lg">Upload your Resume</h4>
            <p className="text-sm text-zinc-500">PDF format recommended for best results.</p>
          </div>
          <div className="flex flex-col gap-4">
            <input 
              type="file" 
              accept=".pdf" 
              onChange={handleFileChange}
              className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-black file:text-white hover:file:bg-zinc-800 cursor-pointer"
            />
            <Button 
              onClick={analyzeResume} 
              disabled={!file || loading}
              className="w-full"
            >
              {loading ? <Loader2 className="animate-spin mr-2" size={18} /> : <Zap className="mr-2" size={18} />}
              {loading ? 'Analyzing...' : 'Analyze Resume'}
            </Button>
          </div>
          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
        </div>
      </Card>

      {analysis && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Score Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 flex flex-col items-center justify-center text-center bg-black text-white border-none md:col-span-1">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Resume Score</p>
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="58"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-white/10"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="58"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={364.4}
                    strokeDashoffset={364.4 - (364.4 * (analysis.score || 0)) / 100}
                    className="text-emerald-400 transition-all duration-1000"
                  />
                </svg>
                <span className="absolute text-4xl font-bold">{analysis.score}</span>
              </div>
              <p className="mt-4 text-sm font-medium text-emerald-400">{analysis.overall_verdict}</p>
            </Card>

            <Card className="p-6 md:col-span-2 space-y-4">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <TrendingUp size={20} className="text-emerald-500" />
                Professional Summary
              </h3>
              <p className="text-zinc-600 leading-relaxed">{analysis.summary}</p>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Strengths</p>
                  <p className="text-xl font-bold text-emerald-700">{analysis.strengths?.length || 0}</p>
                </div>
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                  <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">Improvements</p>
                  <p className="text-xl font-bold text-amber-700">{(analysis.weaknesses?.length || 0) + (analysis.missing_skills?.length || 0)}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Detailed Feedback */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <section>
                <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-500" />
                  Key Strengths
                </h4>
                <div className="space-y-2">
                  {analysis.strengths?.map((s: string, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-white border border-zinc-100 rounded-xl shadow-sm">
                      <div className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                        <CheckCircle size={12} />
                      </div>
                      <p className="text-sm text-zinc-700">{s}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <XCircle size={16} className="text-red-500" />
                  Weaknesses
                </h4>
                <div className="space-y-2">
                  {analysis.weaknesses?.map((w: string, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-white border border-zinc-100 rounded-xl shadow-sm">
                      <div className="w-5 h-5 bg-red-100 text-red-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                        <XCircle size={12} />
                      </div>
                      <p className="text-sm text-zinc-700">{w}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section>
                <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Star size={16} className="text-amber-500" />
                  Missing Skills
                </h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.missing_skills?.map((skill: string, i: number) => (
                    <Badge key={i} variant="warning" className="px-3 py-1">{skill}</Badge>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Search size={16} className="text-blue-500" />
                  ATS Keywords to Add
                </h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.keywords_to_add?.map((kw: string, i: number) => (
                    <Badge key={i} variant="info" className="px-3 py-1">{kw}</Badge>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Filter size={16} className="text-indigo-500" />
                  Formatting Tips
                </h4>
                <div className="space-y-2">
                  {analysis.formatting_tips?.map((tip: string, i: number) => (
                    <div key={i} className="p-3 bg-indigo-50/30 border border-indigo-100 rounded-xl text-sm text-indigo-900">
                      {tip}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </motion.div>
      )}

      {/* History */}
      {history.length > 0 && (
        <section className="pt-8 border-t border-zinc-100">
          <h3 className="text-lg font-bold mb-4">Analysis History</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {history.map((h) => (
              <Card 
                key={h.id} 
                className="p-4 flex items-center justify-between cursor-pointer hover:border-zinc-300 transition-all bg-white"
                onClick={() => setAnalysis(h.analysis_json)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center text-zinc-400">
                    <FileText size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold truncate max-w-[150px]">{h.resume_name}</p>
                    <p className="text-[10px] text-zinc-500 uppercase font-medium">{new Date(h.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{h.score}</p>
                  <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest">Score</p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// --- Dashboard ---

function Dashboard({ user, setView, onRefreshNotifications }: { user: UserType; setView: (v: any) => void; onRefreshNotifications?: () => void }) {
  const [stats, setStats] = useState<any>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [recentApps, setRecentApps] = useState<Application[]>([]);
  const [recentInterviews, setRecentInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [jobsRes, appsRes, interviewsRes] = await Promise.all([
        fetch('/api/jobs'),
        fetch('/api/applications'),
        fetch('/api/interviews')
      ]);
      const allJobs = await jobsRes.json();
      const visibleJobs = user.role === 'RECRUITER' ? allJobs : allJobs.filter((j: Job) => j.status !== 'CLOSED');
      setRecentJobs(visibleJobs.slice(0, 4));
      setRecentApps((await appsRes.json()).slice(0, 4));
      setRecentInterviews((await interviewsRes.json()).slice(0, 3));

      if (user.role === 'ADMIN') {
        const statsRes = await fetch('/api/admin/stats');
        setStats(await statsRes.json());
      } else {
        const statsRes = await fetch('/api/dashboard/stats');
        setStats(await statsRes.json());
      }
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <div className="space-y-10 pb-10">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-black p-8 md:p-12 text-white">
        <div className="relative z-10 max-w-2xl">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge variant="info" className="mb-4 bg-white/10 text-white border-white/20">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              {getGreeting()}, {user.name || user.email.split('@')[0]}
            </h2>
            <p className="text-zinc-400 text-lg leading-relaxed mb-6">
              {user.role === 'STUDENT' 
                ? `Your career journey is looking promising. You have ${stats?.applied || 0} active applications being reviewed right now.`
                : user.role === 'RECRUITER'
                ? `You have ${stats?.pendingReviews || 0} new applicants to review today. Your company profile is ${stats?.isVerified === 'Verified' ? '100%' : '85%'} complete.`
                : "System overview is stable. All platform services are currently operational."}
            </p>
          </motion.div>
        </div>
        {/* Abstract background elements */}
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-emerald-500/20 blur-[100px] rounded-full" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-64 h-64 bg-indigo-500/20 blur-[80px] rounded-full" />
      </section>

      {/* Stats Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {user.role === 'ADMIN' ? (
          <>
            <StatCard label="Total Jobs" value={stats?.totalJobs || 0} icon={<Briefcase size={20} />} trend="+12% this week" />
            <StatCard label="Total Applications" value={stats?.totalApps || 0} icon={<FileText size={20} />} trend="+5% this week" />
            <StatCard label="Shortlisted" value={stats?.totalShortlisted || 0} icon={<CheckCircle size={20} />} trend="+8% this week" />
            <StatCard label="Shortlist Ratio" value={`${(stats?.ratio * 100 || 0).toFixed(0)}%`} icon={<BarChart3 size={20} />} trend="Stable" />
          </>
        ) : user.role === 'STUDENT' ? (
          <>
            <StatCard label="Applied Jobs" value={stats?.applied || 0} icon={<Briefcase size={20} />} trend="Active" />
            <StatCard label="Shortlisted" value={stats?.shortlisted || 0} icon={<CheckCircle size={20} />} trend="Success" />
            <StatCard label="Profile Views" value={stats?.views || 0} icon={<Users size={20} />} trend="+24 today" />
            <StatCard label="Match Score" value={stats?.matchScore || '0%'} icon={<Zap size={20} />} trend="High" />
          </>
        ) : (
          <>
            <StatCard label="Active Jobs" value={stats?.activeJobs || 0} icon={<Briefcase size={20} />} trend="Live" />
            <StatCard label="Total Applicants" value={stats?.totalApplicants || 0} icon={<Users size={20} />} trend="+15 new" />
            <StatCard label="Pending Reviews" value={stats?.pendingReviews || 0} icon={<Clock size={20} />} trend="Action needed" />
            <StatCard label="Verification" value={stats?.isVerified || 'Pending'} icon={<Shield size={20} />} trend="Active" />
          </>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <div className="xl:col-span-2 space-y-8">
          <Card className="p-0 overflow-hidden border-none shadow-sm bg-white">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="font-bold text-xl flex items-center gap-2">
                <TrendingUp size={20} className="text-emerald-500" />
                Recent {user.role === 'RECRUITER' ? 'Job Postings' : 'Opportunities'}
              </h3>
              <button 
                onClick={() => setView('jobs')}
                className="text-sm font-semibold text-zinc-500 hover:text-black flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight size={14} />
              </button>
            </div>
            <div className="divide-y divide-zinc-50">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="p-6 animate-pulse flex items-center gap-4">
                    <div className="w-12 h-12 bg-zinc-100 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-zinc-100 rounded w-1/3" />
                      <div className="h-3 bg-zinc-100 rounded w-1/4" />
                    </div>
                  </div>
                ))
              ) : recentJobs.length > 0 ? recentJobs.map(job => (
                <div key={job.id} className="p-6 flex items-center justify-between hover:bg-zinc-50/50 transition-all group cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-400 group-hover:bg-black group-hover:text-white transition-all">
                      <Building2 size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-zinc-900 group-hover:text-black transition-colors">{job.title}</h4>
                      <p className="text-sm text-zinc-500">{job.company_name || 'Your Company'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden sm:block text-right">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Status</p>
                      <p className="text-xs font-semibold">{job.status}</p>
                    </div>
                    <Badge variant={job.status === 'APPROVED' ? 'success' : job.status === 'CLOSED' ? 'danger' : 'warning'}>
                      {job.status === 'APPROVED' ? 'Active' : job.status === 'CLOSED' ? 'Closed' : 'Pending'}
                    </Badge>
                  </div>
                </div>
              )) : (
                <div className="p-20 text-center">
                  <Briefcase size={40} className="mx-auto text-zinc-200 mb-4" />
                  <p className="text-zinc-400">No recent activity to show.</p>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-0 overflow-hidden border-none shadow-sm bg-white">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="font-bold text-xl flex items-center gap-2">
                <FileText size={20} className="text-indigo-500" />
                Recent Applications
              </h3>
              <button 
                onClick={() => setView('applications')}
                className="text-sm font-semibold text-zinc-500 hover:text-black flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight size={14} />
              </button>
            </div>
            <div className="divide-y divide-zinc-50">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="p-6 animate-pulse flex items-center gap-4">
                    <div className="w-12 h-12 bg-zinc-100 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-zinc-100 rounded w-1/3" />
                      <div className="h-3 bg-zinc-100 rounded w-1/4" />
                    </div>
                  </div>
                ))
              ) : recentApps.length > 0 ? recentApps.map(app => (
                <div key={app.id} className="p-6 flex items-center justify-between hover:bg-zinc-50/50 transition-all group cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-500">
                      <User size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-zinc-900">{app.title}</h4>
                      <p className="text-sm text-zinc-500">{user.role === 'RECRUITER' ? app.student_name : app.company_name}</p>
                    </div>
                  </div>
                  <Badge variant={app.status === 'SHORTLISTED' ? 'success' : app.status === 'PENDING' ? 'warning' : 'danger'}>
                    {app.status}
                  </Badge>
                </div>
              )) : (
                <div className="p-20 text-center">
                  <FileText size={40} className="mx-auto text-zinc-200 mb-4" />
                  <p className="text-zinc-400">No applications found.</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar / Quick Actions */}
        <div className="space-y-8">
          {recentInterviews.length > 0 && (
            <Card className="p-0 overflow-hidden border-none shadow-sm bg-white">
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Calendar size={18} className="text-blue-500" />
                  Upcoming Interviews
                </h3>
                <button onClick={() => setView('interviews')} className="text-xs font-bold text-zinc-400 hover:text-black transition-colors uppercase">View All</button>
              </div>
              <div className="p-4 space-y-3">
                {recentInterviews.map(interview => (
                  <div key={interview.id} className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 hover:border-zinc-200 transition-all cursor-pointer" onClick={() => setView('interviews')}>
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase">{new Date(interview.scheduled_at).toLocaleDateString()}</p>
                      <Badge variant="info">{new Date(interview.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Badge>
                    </div>
                    <h4 className="text-sm font-bold truncate">{interview.job_title}</h4>
                    <p className="text-xs text-zinc-500 truncate">{user.role === 'RECRUITER' ? interview.student_name : interview.company_name}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-6 bg-zinc-900 text-white border-none">
            <h3 className="font-bold text-lg mb-4">Quick Actions</h3>
            <div className="space-y-3">
              {user.role === 'RECRUITER' ? (
                <>
                  <button 
                    onClick={() => setView('jobs')}
                    className="w-full p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all flex items-center gap-3 text-sm font-medium"
                  >
                    <Plus size={18} className="text-emerald-400" /> Post a New Job
                  </button>
                  <button 
                    onClick={() => setView('applications')}
                    className="w-full p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all flex items-center gap-3 text-sm font-medium"
                  >
                    <Users size={18} className="text-indigo-400" /> Review Applicants
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => setView('jobs')}
                    className="w-full p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all flex items-center gap-3 text-sm font-medium"
                  >
                    <Search size={18} className="text-emerald-400" /> Browse New Jobs
                  </button>
                  <button 
                    onClick={() => setView('profile')}
                    className="w-full p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all flex items-center gap-3 text-sm font-medium"
                  >
                    <User size={18} className="text-indigo-400" /> Update My Profile
                  </button>
                </>
              )}
              <button 
                onClick={() => setView('profile')}
                className="w-full p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all flex items-center gap-3 text-sm font-medium"
              >
                <Shield size={18} className="text-amber-400" /> Account Security
              </button>
            </div>
          </Card>

          <Card className="p-6 border-dashed border-2 border-zinc-200 bg-zinc-50/50">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm mx-auto flex items-center justify-center text-emerald-500">
                <Zap size={32} />
              </div>
              <div>
                <h4 className="font-bold text-lg">HireHub Premium</h4>
                <p className="text-sm text-zinc-500">Get 10x more visibility and advanced analytics.</p>
              </div>
              <Button className="w-full py-2.5">Upgrade Now</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, trend, variant = 'default' }: { label: string; value: string | number; icon: React.ReactNode; trend?: string; variant?: 'default' | 'success' | 'info' | 'warning' }) {
  const variantStyles = {
    default: 'text-zinc-900',
    success: 'text-emerald-600',
    info: 'text-blue-600',
    warning: 'text-amber-600'
  };

  return (
    <Card className="p-6 flex flex-col gap-4 hover:shadow-md transition-all border-none bg-white">
      <div className="flex items-center justify-between">
        <div className={cn("w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center border border-zinc-100", variantStyles[variant])}>
          {icon}
        </div>
        {trend && (
          <span className={cn(
            "text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider",
            trend.includes('+') ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-500"
          )}>
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-3xl font-bold tracking-tight text-zinc-900">{value}</p>
      </div>
    </Card>
  );
}

// --- Jobs View ---

function JobsView({ user, savedJobIds, onToggleSave }: { user: UserType, savedJobIds: string[], onToggleSave: (e: React.MouseEvent, jobId: string | number) => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'match' | 'title'>('newest');
  const [minMatch, setMinMatch] = useState<number>(0);
  const [locationType, setLocationType] = useState<'all' | 'remote' | 'nearby' | 'relocation'>('all');
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);

  useEffect(() => {
    fetchJobs();
    if (user.role === 'STUDENT') {
      fetchStudentProfile();
    }
  }, []);

  const fetchStudentProfile = async () => {
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        setStudentProfile(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch student profile:', err);
    }
  };

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/jobs');
      setJobs(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const filteredAndSortedJobs = jobs
    .filter(job => {
      const matchesSearch = 
        job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (job.company_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (job.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (job.requirements || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesMinMatch = (job.matchPercentage || 0) >= minMatch;
      const isVisible = user.role === 'RECRUITER' || job.status !== 'CLOSED';
      
      // Location Intelligence Logic
      let matchesLocation = true;
      if (user.role === 'STUDENT') {
        const studentLoc = (studentProfile?.location || '').toLowerCase().trim();
        const jobLoc = (job.location || '').toLowerCase().trim();
        const isRemote = job.work_type === 'REMOTE';
        const isNearby = studentLoc && jobLoc && (jobLoc.includes(studentLoc) || studentLoc.includes(jobLoc));

        if (locationType === 'remote') {
          matchesLocation = isRemote;
        } else if (locationType === 'nearby') {
          matchesLocation = true; // Show all jobs, but we'll sort them by proximity
        } else if (locationType === 'relocation') {
          matchesLocation = !isNearby && !isRemote;
        }
      }
      
      return matchesSearch && matchesMinMatch && isVisible && matchesLocation;
    })
    .sort((a, b) => {
      if (locationType === 'nearby' && user.role === 'STUDENT' && studentProfile?.location) {
        const studentLoc = studentProfile.location.toLowerCase().trim();
        const locA = (a.location || '').toLowerCase().trim();
        const locB = (b.location || '').toLowerCase().trim();
        
        const isExactA = locA === studentLoc;
        const isExactB = locB === studentLoc;
        if (isExactA && !isExactB) return -1;
        if (!isExactA && isExactB) return 1;

        const isPartialA = locA.includes(studentLoc) || studentLoc.includes(locA);
        const isPartialB = locB.includes(studentLoc) || studentLoc.includes(locB);
        if (isPartialA && !isPartialB) return -1;
        if (!isPartialA && isPartialB) return 1;

        // Remote jobs could be considered "near" in terms of accessibility
        if (a.work_type === 'REMOTE' && b.work_type !== 'REMOTE') return -1;
        if (a.work_type !== 'REMOTE' && b.work_type === 'REMOTE') return 1;
      }

      if (sortBy === 'match') return (b.matchPercentage || 0) - (a.matchPercentage || 0);
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      return b.id - a.id; // newest
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Job Board</h2>
          <p className="text-zinc-500">
            {user.role === 'RECRUITER' ? 'Manage your job postings.' : 'Find your next opportunity.'}
          </p>
        </div>
        
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input 
              type="text"
              placeholder="Search jobs..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all bg-white text-sm"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Filters & Sort */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:flex-none">
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={14} />
              <select 
                className="pl-9 pr-8 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all bg-white text-sm appearance-none cursor-pointer w-full"
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
              >
                <option value="newest">Newest First</option>
                {user.role === 'STUDENT' && <option value="match">Best Match</option>}
                <option value="title">Title A-Z</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={14} />
            </div>

            {user.role === 'STUDENT' && (
              <>
                <div className="relative flex-1 md:flex-none">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={14} />
                  <select 
                    className="pl-9 pr-8 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all bg-white text-sm appearance-none cursor-pointer w-full"
                    value={locationType}
                    onChange={(e: any) => setLocationType(e.target.value)}
                  >
                    <option value="all">All Locations</option>
                    <option value="remote">Remote Only</option>
                    <option value="nearby">Nearby Jobs</option>
                    <option value="relocation">Relocation Jobs</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={14} />
                </div>

                <div className="relative flex-1 md:flex-none">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={14} />
                  <select 
                    className="pl-9 pr-8 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all bg-white text-sm appearance-none cursor-pointer w-full"
                    value={minMatch}
                    onChange={(e: any) => setMinMatch(Number(e.target.value))}
                  >
                    <option value="0">All Matches</option>
                    <option value="50">50%+ Match</option>
                    <option value="75">75%+ Match</option>
                    <option value="90">90%+ Match</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={14} />
                </div>
              </>
            )}

            {user.role === 'RECRUITER' && (
              <Button onClick={() => setShowCreateModal(true)} className="whitespace-nowrap">
                <Plus size={20} />
                <span className="hidden sm:inline">Post Job</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <Card key={i} className="h-48 animate-pulse bg-zinc-50" />)
        ) : filteredAndSortedJobs.length > 0 ? (
          filteredAndSortedJobs.map(job => (
            <Card key={job.id} className="flex flex-col hover:border-zinc-300 transition-all cursor-pointer group" onClick={() => setSelectedJob(job)}>
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-400 group-hover:bg-black group-hover:text-white transition-all">
                  <Building2 size={24} />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    {user.role === 'STUDENT' && (
                      <button 
                        onClick={(e) => onToggleSave(e, job.id)}
                        className={cn(
                          "p-2 rounded-lg transition-all",
                          savedJobIds.includes(String(job.id)) 
                            ? "bg-black text-white" 
                            : "bg-zinc-100 text-zinc-400 hover:text-black"
                        )}
                        title={savedJobIds.includes(String(job.id)) ? "Unsave Job" : "Save Job"}
                      >
                        <Bookmark size={16} fill={savedJobIds.includes(String(job.id)) ? "currentColor" : "none"} />
                      </button>
                    )}
                    {user.role === 'STUDENT' ? (
                      job.is_applied && (
                        <Badge variant="success" className="flex items-center gap-1">
                          <CheckCircle size={12} />
                          Applied
                        </Badge>
                      )
                    ) : (
                      job.status !== 'PENDING' && (
                        <Badge variant={job.status === 'APPROVED' ? 'success' : job.status === 'CLOSED' ? 'danger' : 'warning'}>
                          {job.status}
                        </Badge>
                      )
                    )}
                  </div>
                  {user.role === 'STUDENT' && (
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase">Match</p>
                      <p className={cn('text-lg font-bold', (job.matchPercentage || 0) > 70 ? 'text-emerald-500' : 'text-zinc-700')}>
                        {job.matchPercentage || 0}%
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <h3 className="font-bold text-lg mb-1 group-hover:text-black">{job.title}</h3>
              <p className="text-sm text-zinc-500 mb-2">{job.company_name || 'Your Company'}</p>
              
              <div className="flex items-center gap-3 text-xs text-zinc-400 mb-4">
                <div className="flex items-center gap-1">
                  <MapPin size={12} />
                  <span>{job.work_type === 'REMOTE' ? 'Remote' : job.location || 'Location TBD'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Globe size={12} />
                  <span className="capitalize">{job.work_type?.toLowerCase().replace('_', ' ')}</span>
                </div>
              </div>
              
              <div className="mt-auto flex flex-wrap gap-2">
                {safeParse(job.requirements).slice(0, 3).map((req: string) => (
                  <Badge key={req}>{req}</Badge>
                ))}
              </div>
            </Card>
          ))
        ) : (
          <div className="col-span-full py-20 text-center">
            <Briefcase className="mx-auto text-zinc-200 mb-4" size={48} />
            <p className="text-zinc-500">No jobs found matching your criteria.</p>
          </div>
        )}
      </div>

      {/* Create Job Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-xl">
              <CreateJobForm onSuccess={() => { setShowCreateModal(false); fetchJobs(); }} onCancel={() => setShowCreateModal(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Job Detail Modal */}
      <AnimatePresence>
        {selectedJob && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedJob(null)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-2xl">
              <JobDetail job={selectedJob} user={user} onClose={() => setSelectedJob(null)} onApplied={() => { setSelectedJob(null); fetchJobs(); }} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SavedJobsView({ user, onSelectJob, onToggleSave }: { user: UserType; onSelectJob: (job: Job) => void; onToggleSave: (e: React.MouseEvent, jobId: string | number) => Promise<void> }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSavedJobs();
  }, []);

  const fetchSavedJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/jobs/saved');
      if (res.ok) setJobs(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const unsaveJob = async (e: React.MouseEvent, jobId: string | number) => {
    await onToggleSave(e, jobId);
    fetchSavedJobs();
  };

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-zinc-300" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Saved Jobs</h2>
        <p className="text-zinc-500">Jobs you've bookmarked for later.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {jobs.length > 0 ? (
          jobs.map(job => (
            <Card key={job.id} className="flex flex-col hover:border-zinc-300 transition-all cursor-pointer group" onClick={() => onSelectJob(job)}>
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-400 group-hover:bg-black group-hover:text-white transition-all overflow-hidden">
                  {job.company_logo ? (
                    <img src={job.company_logo} alt={job.company_name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <Building2 size={24} />
                  )}
                </div>
                <button 
                  onClick={(e) => unsaveJob(e, job.id)}
                  className="p-2 bg-black text-white rounded-lg transition-all"
                >
                  <Bookmark size={16} fill="currentColor" />
                </button>
              </div>
              <h3 className="font-bold text-lg mb-1 group-hover:text-black">{job.title}</h3>
              <p className="text-sm text-zinc-500 mb-2">{job.company_name}</p>
              <div className="flex items-center gap-3 text-xs text-zinc-400 mb-4">
                <div className="flex items-center gap-1">
                  <MapPin size={14} />
                  <span>{job.work_type === 'REMOTE' ? 'Remote' : job.location || 'Location TBD'}</span>
                </div>
              </div>
              <div className="mt-auto pt-4 border-t border-zinc-100 flex items-center justify-end">
                <div className="flex items-center gap-1 text-xs font-bold text-black uppercase group-hover:translate-x-1 transition-transform">
                  View & Apply
                  <ArrowRight size={14} />
                </div>
              </div>
            </Card>
          ))
        ) : (
          <div className="col-span-full py-20 text-center">
            <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-400">
              <Bookmark size={32} />
            </div>
            <h3 className="text-lg font-bold text-zinc-900">No saved jobs</h3>
            <p className="text-zinc-500 mt-1">Bookmark jobs you're interested in to see them here.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateJobForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [location, setLocation] = useState('');
  const [workType, setWorkType] = useState<'ON_SITE' | 'REMOTE' | 'HYBRID'>('ON_SITE');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          location,
          work_type: workType,
          requirements: requirements.split(',').map(s => s.trim()).filter(s => s)
        }),
      });
      if (res.ok) onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-8 max-h-[90vh] overflow-y-auto">
      <h3 className="text-xl font-bold mb-6">Post a New Job</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-bold text-zinc-500 uppercase">Job Title</label>
          <Input placeholder="e.g. Senior Frontend Engineer" value={title} onChange={e => setTitle(e.target.value)} required />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-500 uppercase">Location</label>
            <Input placeholder="e.g. New York, NY" value={location} onChange={e => setLocation(e.target.value)} required={workType !== 'REMOTE'} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-500 uppercase">Work Type</label>
            <select 
              className="w-full px-4 py-2 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all bg-white text-sm"
              value={workType}
              onChange={(e: any) => setWorkType(e.target.value)}
            >
              <option value="ON_SITE">On-site</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-zinc-500 uppercase">Description</label>
          <textarea 
            className="w-full px-4 py-2 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all min-h-[120px]" 
            placeholder="Describe the role and responsibilities..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-zinc-500 uppercase">Skills (comma separated)</label>
          <Input placeholder="e.g. React, TypeScript, Node.js" value={requirements} onChange={e => setRequirements(e.target.value)} required />
        </div>
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Post Job'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function JobDetail({ job, user, onClose, onApplied }: { job: Job; user: UserType; onClose: () => void; onApplied: () => void }) {
  const [applying, setApplying] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [answers, setAnswers] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resumeFile) {
      setError('Please select a resume file');
      return;
    }

    setLoading(true);
    setError('');
    try {
      // 1. Upload File
      const formData = new FormData();
      formData.append('file', resumeFile);
      
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!uploadRes.ok) {
        const uploadData = await uploadRes.json();
        throw new Error(uploadData.error || 'Failed to upload resume');
      }
      
      const { url: resumeUrl } = await uploadRes.json();

      // 2. Submit Application
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          resume_url: resumeUrl,
          answers: { cover_letter: answers }
        }),
      });
      const data = await res.json();
      if (res.ok) onApplied();
      else setError(data.error);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseJob = async () => {
    setClosing(true);
    try {
      const res = await fetch(`/api/recruiter/jobs/${job.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED' }),
      });
      if (res.ok) {
        onApplied(); // Refresh jobs
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete job');
      }
    } catch (err: any) {
      alert(err.message || 'An error occurred');
    } finally {
      setClosing(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <Card className="p-8 max-h-[90vh] overflow-y-auto">
      {showDeleteConfirm ? (
        <div className="space-y-6 py-10 text-center">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 size={32} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-zinc-900">Delete Job?</h3>
            <p className="text-sm text-zinc-500 mt-2">
              Are you sure you want to delete <strong>{job.title}</strong>? This action cannot be undone and all associated applications and interviews will be permanently removed.
            </p>
          </div>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" onClick={handleCloseJob} disabled={closing}>
              {closing ? <Loader2 className="animate-spin" size={20} /> : 'Yes, Delete Permanently'}
            </Button>
          </div>
        </div>
      ) : !applying ? (
        <>
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-2xl font-bold">{job.title}</h3>
              <p className="text-zinc-500 flex items-center gap-2 mt-1">
                <Building2 size={16} />
                {job.company_name || 'Your Company'}
              </p>
              <div className="flex flex-wrap gap-4 mt-3">
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <MapPin size={14} className="text-zinc-400" />
                  <span>{job.work_type === 'REMOTE' ? 'Remote' : job.location || 'Location TBD'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Globe size={14} className="text-zinc-400" />
                  <span className="capitalize">{job.work_type?.toLowerCase().replace('_', ' ')}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Clock size={14} className="text-zinc-400" />
                  <span>Posted {new Date(job.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            {user.role === 'STUDENT' ? (
              job.is_applied && (
                <Badge variant="success" className="flex items-center gap-1">
                  <CheckCircle size={12} />
                  Applied
                </Badge>
              )
            ) : (
              job.status !== 'PENDING' && (
                <Badge variant={job.status === 'APPROVED' ? 'success' : job.status === 'CLOSED' ? 'danger' : 'warning'}>{job.status}</Badge>
              )
            )}
          </div>

          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Description</h4>
              <p className="text-zinc-700 whitespace-pre-wrap leading-relaxed">{job.description}</p>
            </div>

            <div>
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Requirements</h4>
              <div className="flex flex-wrap gap-2">
                {safeParse(job.requirements).map((req: string) => (
                  <Badge key={req} variant="info">{req}</Badge>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-6">
              <Button variant="outline" className="flex-1" onClick={onClose}>Close</Button>
              {user.role === 'STUDENT' && job.status !== 'CLOSED' && (
                job.is_applied ? (
                  <Button className="flex-1" disabled>Already Applied</Button>
                ) : (
                  <Button className="flex-1" onClick={() => setApplying(true)}>Apply Now</Button>
                )
              )}
              {user.role === 'STUDENT' && job.status === 'CLOSED' && (
                <Button className="flex-1" disabled>Job Closed</Button>
              )}
              {user.role === 'RECRUITER' && job.status !== 'CLOSED' && (
                <Button variant="danger" className="flex-1" onClick={() => setShowDeleteConfirm(true)} disabled={closing}>
                  {closing ? <Loader2 className="animate-spin" size={20} /> : 'Delete Job'}
                </Button>
              )}
            </div>
          </div>
        </>
      ) : (
        <form onSubmit={handleApply} className="space-y-6">
          <h3 className="text-xl font-bold">Apply for {job.title}</h3>
          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-500 uppercase">Resume (PDF Only)</label>
            <div className="relative">
              <input 
                type="file" 
                accept=".pdf" 
                onChange={e => setResumeFile(e.target.files?.[0] || null)}
                className="hidden"
                id="resume-upload"
                required
              />
              <label 
                htmlFor="resume-upload" 
                className={cn(
                  "flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all",
                  resumeFile ? "border-emerald-200 bg-emerald-50/50 text-emerald-700" : "border-zinc-200 hover:border-zinc-300 text-zinc-500"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  resumeFile ? "bg-emerald-100 text-emerald-600" : "bg-zinc-100 text-zinc-400"
                )}>
                  <FileText size={20} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-semibold truncate">
                    {resumeFile ? resumeFile.name : "Choose PDF file"}
                  </p>
                  <p className="text-[10px] opacity-70">
                    {resumeFile ? `${(resumeFile.size / 1024 / 1024).toFixed(2)} MB` : "Maximum size 5MB"}
                  </p>
                </div>
                {resumeFile && <CheckCircle size={18} className="text-emerald-500" />}
              </label>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-500 uppercase">Why are you a good fit?</label>
            <textarea 
              className="w-full px-4 py-2 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all min-h-[120px]" 
              placeholder="Tell us about your experience..."
              value={answers}
              onChange={e => setAnswers(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setApplying(false)}>Back</Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'Submit Application'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

// --- Applications View ---

function ChatModal({ application, user, onClose }: { application: Application; user: UserType; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [application.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/messages/${application.id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: application.id,
          content: newMessage.trim()
        }),
      });
      if (res.ok) {
        setNewMessage('');
        fetchMessages();
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col h-[600px] overflow-hidden"
      >
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center">
              <MessageCircle size={20} />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900">{application.title}</h3>
              <p className="text-xs text-zinc-500">Chatting with {user.role === 'STUDENT' ? application.company_name : application.student_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
            <X size={20} className="text-zinc-400" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/30">
          {loading ? (
            <div className="flex justify-center p-10"><Loader2 className="animate-spin text-zinc-300" /></div>
          ) : messages.length === 0 ? (
            <div className="text-center p-10 space-y-2">
              <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto text-zinc-300">
                <MessageCircle size={24} />
              </div>
              <p className="text-zinc-400 text-sm">No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div 
                key={msg.id} 
                className={cn(
                  "flex flex-col max-w-[80%]",
                  String(msg.sender_id) === String(user.id) ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                <div 
                  className={cn(
                    "px-4 py-2 rounded-2xl text-sm shadow-sm",
                    String(msg.sender_id) === String(user.id) 
                      ? "bg-black text-white rounded-br-none" 
                      : "bg-white text-zinc-800 border border-zinc-100 rounded-bl-none"
                  )}
                >
                  {msg.content}
                </div>
                <span className="text-[10px] text-zinc-400 mt-1 px-1">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleSendMessage} className="p-4 border-t border-zinc-100 bg-white">
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Type your message..." 
              className="flex-1 px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
            <Button type="submit" disabled={!newMessage.trim() || sending} className="w-10 h-10 p-0 rounded-xl">
              {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function ScheduleInterviewModal({ application, onClose, onSuccess }: { application: Application; onClose: () => void; onSuccess: () => void }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: application.id,
          student_id: application.student_id,
          scheduled_at: `${date}T${time}:00`,
          meeting_link: link,
          notes
        }),
      });
      if (res.ok) {
        onSuccess();
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8"
      >
        <h3 className="text-xl font-bold mb-6">Schedule Interview</h3>
        <p className="text-sm text-zinc-500 mb-6">Scheduling interview for {application.student_name} - {application.title}</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">Date</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-500 uppercase">Time</label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-500 uppercase">Meeting Link</label>
            <Input placeholder="https://meet.google.com/..." value={link} onChange={e => setLink(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-500 uppercase">Notes (Optional)</label>
            <textarea 
              className="w-full px-4 py-2 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all min-h-[80px]" 
              placeholder="Any instructions for the candidate..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'Schedule'}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function InterviewsView({ user }: { user: UserType }) {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInterviews();
  }, []);

  const fetchInterviews = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/interviews');
      setInterviews(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/interviews/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchInterviews();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Interviews</h2>
        <p className="text-zinc-500">Manage your upcoming {user.role === 'RECRUITER' ? 'recruitment' : 'career'} interviews.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse h-48 bg-zinc-50" />
          ))
        ) : interviews.length > 0 ? (
          interviews.map(interview => (
            <Card key={interview.id} className="relative overflow-hidden group">
              <div className={cn(
                "absolute top-0 left-0 w-1 h-full",
                interview.status === 'SCHEDULED' ? "bg-blue-500" : interview.status === 'COMPLETED' ? "bg-emerald-500" : "bg-red-500"
              )} />
              
              <div className="flex justify-between items-start mb-4">
                <Badge variant={interview.status === 'SCHEDULED' ? 'info' : interview.status === 'COMPLETED' ? 'success' : 'danger'}>
                  {interview.status}
                </Badge>
                <div className="text-right">
                  <p className="text-xs font-bold text-zinc-400 uppercase">{new Date(interview.scheduled_at).toLocaleDateString()}</p>
                  <p className="text-sm font-bold">{new Date(interview.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>

              <h3 className="font-bold text-lg mb-1">{interview.job_title}</h3>
              <p className="text-sm text-zinc-500 mb-4 flex items-center gap-1">
                {user.role === 'RECRUITER' ? <User size={14} /> : <Building2 size={14} />}
                {user.role === 'RECRUITER' ? interview.student_name : interview.company_name}
              </p>

              <div className="space-y-3">
                <a 
                  href={interview.meeting_link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 bg-zinc-50 rounded-xl text-sm font-medium hover:bg-zinc-100 transition-all text-blue-600"
                >
                  <Video size={18} />
                  Join Meeting
                </a>
                
                {interview.notes && (
                  <p className="text-xs text-zinc-500 italic line-clamp-2" title={interview.notes}>
                    "{interview.notes}"
                  </p>
                )}

                {user.role === 'RECRUITER' && interview.status === 'SCHEDULED' && (
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => updateStatus(interview.id, 'COMPLETED')}>Mark Completed</Button>
                    <Button variant="danger" size="sm" className="flex-1 text-xs" onClick={() => updateStatus(interview.id, 'CANCELLED')}>Cancel</Button>
                  </div>
                )}
              </div>
            </Card>
          ))
        ) : (
          <div className="col-span-full py-20 text-center">
            <Calendar size={48} className="mx-auto text-zinc-200 mb-4" />
            <p className="text-zinc-400">No interviews scheduled yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StudentProfileModal({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch(`/api/students/${studentId}`);
        if (res.ok) {
          setProfile(await res.json());
        }
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [studentId]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl"
      >
        <Card className="p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
            <h3 className="text-xl font-bold">Student Profile</h3>
            <button onClick={onClose} className="p-2 hover:bg-zinc-200 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-8 space-y-8">
            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-300" /></div>
            ) : profile ? (
              <>
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 rounded-2xl bg-zinc-100 border-2 border-zinc-200 overflow-hidden flex items-center justify-center">
                    {profile.profile_picture_url ? (
                      <img src={profile.profile_picture_url} alt={profile.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <User size={32} className="text-zinc-300" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-2xl font-bold">{profile.name}</h4>
                    {profile.headline && (
                      <p className="text-zinc-600 font-medium mt-1">{profile.headline}</p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-2">
                      {profile.location && (
                        <div className="flex items-center gap-1 text-sm text-zinc-500">
                          <MapPin size={14} />
                          {profile.location}
                        </div>
                      )}
                      {profile.phone && (
                        <div className="flex items-center gap-1 text-sm text-zinc-500">
                          <Phone size={14} />
                          {profile.phone}
                        </div>
                      )}
                      {profile.email && (
                        <div className="flex items-center gap-1 text-sm text-zinc-500">
                          <Mail size={14} />
                          {profile.email}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <h5 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Education</h5>
                      <div className="space-y-2">
                        <p className="text-zinc-700 font-bold">{profile.college_name || 'Not specified'}</p>
                        <p className="text-zinc-600 text-sm">{profile.degree} {profile.branch ? `in ${profile.branch}` : ''}</p>
                        <div className="flex items-center gap-4 text-xs text-zinc-500">
                          {profile.graduation_year && (
                            <span className="flex items-center gap-1"><Calendar size={12} /> Class of {profile.graduation_year}</span>
                          )}
                          {profile.cgpa && (
                            <span className="flex items-center gap-1"><Star size={12} className="text-amber-500" /> CGPA: {profile.cgpa}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Experience</h5>
                      <p className="text-zinc-700">{profile.experience_years ? `${profile.experience_years} years` : 'Not specified'}</p>
                    </div>
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Skills</h5>
                    <div className="flex flex-wrap gap-2">
                      {profile.skills?.map((skill: string) => (
                        <Badge key={skill} variant="info">{skill}</Badge>
                      )) || <span className="text-zinc-400 text-sm italic">No skills listed</span>}
                    </div>
                  </div>
                </div>

                <div>
                  <h5 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">About</h5>
                  <p className="text-zinc-700 whitespace-pre-wrap leading-relaxed">{profile.bio || 'No bio provided.'}</p>
                </div>

                <div className="flex gap-4 pt-4 border-t border-zinc-100">
                  {profile.linkedin_url && (
                    <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer" className="p-2 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition-colors">
                      <Linkedin size={20} className="text-blue-600" />
                    </a>
                  )}
                  {profile.github_url && (
                    <a href={profile.github_url} target="_blank" rel="noopener noreferrer" className="p-2 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition-colors">
                      <Github size={20} />
                    </a>
                  )}
                  {profile.portfolio_url && (
                    <a href={profile.portfolio_url} target="_blank" rel="noopener noreferrer" className="p-2 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition-colors">
                      <Globe size={20} className="text-emerald-600" />
                    </a>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-20 text-zinc-400">Profile not found.</div>
            )}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

function ApplicationsView({ user, viewParams }: { user: UserType; viewParams?: any }) {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<Application | null>(null);
  const [schedulingInterview, setSchedulingInterview] = useState<Application | null>(null);
  const [viewingStudentId, setViewingStudentId] = useState<string | null>(null);

  useEffect(() => {
    fetchApps();
  }, []);

  useEffect(() => {
    if (viewParams?.applicationId && apps.length > 0) {
      const app = apps.find(a => String(a.id) === String(viewParams.applicationId));
      if (app) {
        setSelectedChat(app);
      }
    }
  }, [viewParams, apps]);

  const fetchApps = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/applications');
      setApps(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: number, status: string) => {
    await fetch(`/api/applications/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchApps();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Applications</h2>
        <p className="text-zinc-500">Track the status of your {user.role === 'RECRUITER' ? 'received' : 'sent'} applications.</p>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-100">
              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Job Title</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Job Status</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">{user.role === 'RECRUITER' ? 'Student' : 'Company'}</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Applied On</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Resume</th>
              {user.role === 'RECRUITER' && <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Fit Description</th>}
              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={8} className="px-6 py-8 bg-zinc-50/50" />
                </tr>
              ))
            ) : apps.length > 0 ? (
              apps.map(app => (
                <tr key={app.id} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium">{app.title}</td>
                  <td className="px-6 py-4">
                    <Badge variant={app.job_status === 'APPROVED' ? 'success' : app.job_status === 'CLOSED' ? 'danger' : 'warning'}>
                      {app.job_status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-zinc-500">
                    {user.role === 'RECRUITER' ? (
                      <button 
                        onClick={() => setViewingStudentId(app.student_id)}
                        className="text-sm font-medium hover:text-black hover:underline transition-all flex items-center gap-2"
                      >
                        <User size={14} className="text-zinc-400" />
                        {app.student_name}
                      </button>
                    ) : (
                      app.company_name
                    )}
                  </td>
                  <td className="px-6 py-4 text-zinc-500 text-sm">{new Date(app.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <a 
                      href={app.resume_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      download={app.resume_url.split('/').pop()}
                      className="inline-flex items-center gap-1 text-xs font-bold text-zinc-400 hover:text-black transition-colors uppercase"
                    >
                      <FileText size={14} />
                      View PDF
                    </a>
                  </td>
                  {user.role === 'RECRUITER' && (
                    <td className="px-6 py-4">
                      <div className="max-w-xs">
                        <p className="text-xs text-zinc-600 line-clamp-2 hover:line-clamp-none transition-all cursor-help" title={safeParse(app.answers, {}).cover_letter}>
                          {safeParse(app.answers, {}).cover_letter || 'No description provided.'}
                        </p>
                      </div>
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <Badge variant={app.status === 'SHORTLISTED' ? 'success' : app.status === 'PENDING' ? 'warning' : 'danger'}>
                      {app.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      {app.status === 'SHORTLISTED' && (
                        <>
                          <button 
                            onClick={() => setSelectedChat(app)} 
                            className="p-1.5 text-black hover:bg-zinc-100 rounded-lg transition-colors" 
                            title="Chat"
                          >
                            <MessageCircle size={18} />
                          </button>
                          {user.role === 'RECRUITER' && (
                            <button 
                              onClick={() => setSchedulingInterview(app)} 
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                              title="Schedule Interview"
                            >
                              <Calendar size={18} />
                            </button>
                          )}
                        </>
                      )}
                      {user.role === 'RECRUITER' && (
                        <>
                          <button onClick={() => updateStatus(app.id, 'SHORTLISTED')} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Shortlist">
                            <CheckCircle size={18} />
                          </button>
                          <button onClick={() => updateStatus(app.id, 'REJECTED')} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Reject">
                            <XCircle size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-6 py-20 text-center text-zinc-400 text-sm">No applications found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <AnimatePresence>
        {selectedChat && (
          <ChatModal 
            application={selectedChat} 
            user={user} 
            onClose={() => setSelectedChat(null)} 
          />
        )}
        {schedulingInterview && (
          <ScheduleInterviewModal 
            application={schedulingInterview} 
            onClose={() => setSchedulingInterview(null)} 
            onSuccess={() => {
              alert('Interview scheduled successfully!');
              fetchApps();
            }}
          />
        )}
        {viewingStudentId && (
          <StudentProfileModal 
            studentId={viewingStudentId} 
            onClose={() => setViewingStudentId(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Profile View ---

function ProfileView({ user, onUpdate }: { user: UserType; onUpdate: () => void }) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'personal' | 'professional' | 'links'>('personal');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    const res = await fetch('/api/profile');
    const data = await res.json();
    setProfile(data || {});
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const { url } = await res.json();
        const updatedProfile = { ...profile, profile_picture_url: url };
        setProfile(updatedProfile);
        
        // Save immediately to ensure persistence
        await fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedProfile),
        });
      }
    } catch (err) {
      alert('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        onUpdate();
        alert('Profile updated successfully!');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update profile');
      }
    } catch (err) {
      alert('An error occurred while saving your profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-zinc-300" /></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Profile Settings</h2>
          <p className="text-zinc-500">Manage your personal and professional presence on HireHub.</p>
        </div>
        <div className="flex p-1 bg-zinc-100 rounded-xl">
          <button onClick={() => setActiveTab('personal')} className={cn("px-4 py-1.5 text-sm font-medium rounded-lg transition-all", activeTab === 'personal' ? "bg-white shadow-sm text-black" : "text-zinc-500 hover:text-zinc-700")}>Personal</button>
          <button onClick={() => setActiveTab('professional')} className={cn("px-4 py-1.5 text-sm font-medium rounded-lg transition-all", activeTab === 'professional' ? "bg-white shadow-sm text-black" : "text-zinc-500 hover:text-zinc-700")}>Professional</button>
          <button onClick={() => setActiveTab('links')} className={cn("px-4 py-1.5 text-sm font-medium rounded-lg transition-all", activeTab === 'links' ? "bg-white shadow-sm text-black" : "text-zinc-500 hover:text-zinc-700")}>Links</button>
        </div>
      </header>

      <Card className="p-0 overflow-hidden">
        <form onSubmit={handleSave}>
          <div className="p-8 space-y-8">
            {activeTab === 'personal' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-6">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-2xl bg-zinc-100 border-2 border-zinc-200 overflow-hidden flex items-center justify-center">
                      {profile?.profile_picture_url ? (
                        <img src={profile.profile_picture_url} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <User size={32} className="text-zinc-300" />
                      )}
                      {uploading && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Loader2 className="animate-spin text-white" size={20} />
                        </div>
                      )}
                    </div>
                    <label className="absolute -bottom-2 -right-2 p-2 bg-white border border-zinc-200 rounded-lg shadow-sm cursor-pointer hover:bg-zinc-50 transition-colors">
                      <Camera size={14} />
                      <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={uploading} />
                    </label>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-lg">{user.role === 'STUDENT' ? (profile?.name || 'Your Name') : (profile?.company_name || 'Your Company')}</h4>
                    <p className="text-sm text-zinc-500">{user.email}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                      <User size={14} />
                      {user.role === 'STUDENT' ? 'Full Name' : 'Company Name'}
                    </label>
                    <Input 
                      value={user.role === 'STUDENT' ? (profile?.name || '') : (profile?.company_name || '')} 
                      onChange={e => setProfile({ ...profile, [user.role === 'STUDENT' ? 'name' : 'company_name']: e.target.value })} 
                    />
                  </div>
                  {user.role === 'STUDENT' && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                        <FileText size={14} />
                        Headline
                      </label>
                      <Input 
                        placeholder="e.g. Frontend Developer | React Enthusiast"
                        value={profile?.headline || ''} 
                        onChange={e => setProfile({ ...profile, headline: e.target.value })} 
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                      <MapPin size={14} />
                      Location
                    </label>
                    <Input 
                      placeholder="e.g. San Francisco, CA"
                      value={profile?.location || ''} 
                      onChange={e => setProfile({ ...profile, location: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                      <Mail size={14} />
                      Email Address
                    </label>
                    <Input 
                      disabled
                      value={user.email} 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                      <Phone size={14} />
                      Phone Number
                    </label>
                    <Input 
                      placeholder="+1 (555) 000-0000"
                      value={profile?.phone || ''} 
                      onChange={e => setProfile({ ...profile, phone: e.target.value })} 
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                    <FileText size={14} />
                    {user.role === 'STUDENT' ? 'Bio' : 'Company Bio'}
                  </label>
                  <textarea 
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all min-h-[120px]" 
                    placeholder={user.role === 'STUDENT' ? "Tell us about yourself..." : "Tell us about your company..."}
                    value={user.role === 'STUDENT' ? (profile?.bio || '') : (profile?.company_bio || '')} 
                    onChange={e => setProfile({ ...profile, [user.role === 'STUDENT' ? 'bio' : 'company_bio']: e.target.value })} 
                  />
                </div>
              </div>
            )}

            {activeTab === 'professional' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {user.role === 'STUDENT' ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                          <Building2 size={14} />
                          College Name
                        </label>
                        <Input 
                          placeholder="e.g. Stanford University"
                          value={profile?.college_name || ''} 
                          onChange={e => setProfile({ ...profile, college_name: e.target.value })} 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                          <GraduationCap size={14} />
                          Degree
                        </label>
                        <Input 
                          placeholder="e.g. B.Tech, BS, MS"
                          value={profile?.degree || ''} 
                          onChange={e => setProfile({ ...profile, degree: e.target.value })} 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                          <Briefcase size={14} />
                          Branch
                        </label>
                        <Input 
                          placeholder="e.g. Computer Science, IT"
                          value={profile?.branch || ''} 
                          onChange={e => setProfile({ ...profile, branch: e.target.value })} 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                          <Calendar size={14} />
                          Graduation Year
                        </label>
                        <Input 
                          placeholder="e.g. 2025"
                          value={profile?.graduation_year || ''} 
                          onChange={e => setProfile({ ...profile, graduation_year: e.target.value })} 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                          <Star size={14} />
                          CGPA / Percentage
                        </label>
                        <Input 
                          placeholder="e.g. 9.0 or 85%"
                          value={profile?.cgpa || ''} 
                          onChange={e => setProfile({ ...profile, cgpa: e.target.value })} 
                        />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                          <Briefcase size={14} />
                          Total Years of Experience
                        </label>
                        <Input 
                          type="number"
                          placeholder="e.g. 2"
                          value={profile?.experience_years ?? ''} 
                          onChange={e => setProfile({ ...profile, experience_years: e.target.value ? parseInt(e.target.value) : null })} 
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                        <CheckCircle size={14} />
                        Skills (comma separated)
                      </label>
                      <Input 
                        placeholder="e.g. React, TypeScript, Node.js"
                        value={profile?.skills?.join(', ') || ''} 
                        onChange={e => setProfile({ ...profile, skills: e.target.value.split(',').map(s => s.trim()) })} 
                      />
                      <p className="text-[10px] text-zinc-400">Add skills to see your match percentage on jobs.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                          <Building2 size={14} />
                          Industry
                        </label>
                        <Input 
                          placeholder="e.g. Technology, Healthcare"
                          value={profile?.industry || ''} 
                          onChange={e => setProfile({ ...profile, industry: e.target.value })} 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                          <Users size={14} />
                          Company Size
                        </label>
                        <select 
                          className="w-full px-4 py-2 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all bg-white text-sm"
                          value={profile?.company_size || ''} 
                          onChange={e => setProfile({ ...profile, company_size: e.target.value })}
                        >
                          <option value="">Select size...</option>
                          <option value="1-10">1-10 employees</option>
                          <option value="11-50">11-50 employees</option>
                          <option value="51-200">51-200 employees</option>
                          <option value="201-500">201-500 employees</option>
                          <option value="500+">500+ employees</option>
                        </select>
                      </div>
                    </div>
                    <div className="p-4 bg-zinc-50 rounded-xl flex items-center gap-3">
                      {profile?.is_verified ? (
                        <CheckCircle className="text-emerald-500" size={20} />
                      ) : (
                        <Loader2 className="text-amber-500" size={20} />
                      )}
                      <div>
                        <p className="text-sm font-bold">{profile?.is_verified ? 'Verified Company' : 'Verification Pending'}</p>
                        <p className="text-xs text-zinc-500">{profile?.is_verified ? 'You can post jobs that are automatically approved.' : 'Your jobs will need admin approval until verified.'}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'links' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {user.role === 'STUDENT' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                        <Linkedin size={14} />
                        LinkedIn URL
                      </label>
                      <Input 
                        placeholder="https://linkedin.com/in/username"
                        value={profile?.linkedin_url || ''} 
                        onChange={e => setProfile({ ...profile, linkedin_url: e.target.value })} 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                        <Github size={14} />
                        GitHub URL
                      </label>
                      <Input 
                        placeholder="https://github.com/username"
                        value={profile?.github_url || ''} 
                        onChange={e => setProfile({ ...profile, github_url: e.target.value })} 
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                        <Globe size={14} />
                        Portfolio URL
                      </label>
                      <Input 
                        placeholder="https://yourportfolio.com"
                        value={profile.portfolio_url || ''} 
                        onChange={e => setProfile({ ...profile, portfolio_url: e.target.value })} 
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                      <Globe size={14} />
                      Company Website
                    </label>
                    <Input 
                      placeholder="https://company.com"
                      value={profile.company_website || ''} 
                      onChange={e => setProfile({ ...profile, company_website: e.target.value })} 
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="px-8 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
            <p className="text-xs text-zinc-400">Last updated: {new Date().toLocaleDateString()}</p>
            <Button type="submit" disabled={saving} className="min-w-[140px]">
              {saving ? <Loader2 className="animate-spin" size={20} /> : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Card>

      {user.role === 'STUDENT' && (
        <div className="mt-12 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">Recommended Jobs</h3>
            <Badge variant="info">Based on your skills</Badge>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <RecommendedJobs user={user} />
          </div>
        </div>
      )}
    </div>
  );
}

function RecommendedJobs({ user }: { user: UserType }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/jobs')
      .then(res => res.json())
      .then(data => {
        setJobs(data.sort((a: any, b: any) => (b.matchPercentage || 0) - (a.matchPercentage || 0)).slice(0, 3));
        setLoading(false);
      });
  }, []);

  if (loading) return <Loader2 className="animate-spin mx-auto text-zinc-200" />;
  if (jobs.length === 0) return <p className="text-zinc-400 text-sm text-center">No recommendations yet.</p>;

  return (
    <>
      {jobs.map(job => (
        <Card key={job.id} className="p-4 flex items-center justify-between hover:border-zinc-300 transition-all cursor-pointer">
          <div>
            <h4 className="font-bold">{job.title}</h4>
            <p className="text-sm text-zinc-500">{job.company_name}</p>
          </div>
          <div className="text-right">
            <Badge variant="info">{job.matchPercentage || 0}% Match</Badge>
            <p className="text-[10px] text-zinc-400 mt-1 uppercase font-bold">{job.status}</p>
          </div>
        </Card>
      ))}
    </>
  );
}

// --- Admin View ---

function AdminView() {
  const [recruiters, setRecruiters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecruiters();
  }, []);

  const fetchRecruiters = async () => {
    const res = await fetch('/api/admin/recruiters');
    setRecruiters(await res.json());
    setLoading(false);
  };

  const toggleVerify = async (id: number, current: boolean) => {
    await fetch(`/api/admin/recruiters/${id}/verify`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_verified: !current }),
    });
    fetchRecruiters();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Admin Console</h2>
        <p className="text-zinc-500">Manage platform users and verification.</p>
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-100">
              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Company</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Email</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <tr><td colSpan={4} className="px-6 py-20 text-center"><Loader2 className="animate-spin mx-auto text-zinc-200" /></td></tr>
            ) : recruiters.map(r => (
              <tr key={r.user_id} className="hover:bg-zinc-50/50 transition-colors">
                <td className="px-6 py-4 font-medium">{r.company_name}</td>
                <td className="px-6 py-4 text-zinc-500">{r.email}</td>
                <td className="px-6 py-4">
                  <Badge variant={r.is_verified ? 'success' : 'warning'}>
                    {r.is_verified ? 'Verified' : 'Pending'}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-right">
                  <Button variant={r.is_verified ? 'outline' : 'primary'} size="sm" onClick={() => toggleVerify(r.user_id, r.is_verified)}>
                    {r.is_verified ? 'Unverify' : 'Verify'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// --- Network View ---

function NetworkView({ user, setToast }: { user: UserType; setToast: (toast: any) => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserType[]>([]);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingRequestId, setSendingRequestId] = useState<string | number | null>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [chatFriend, setChatFriend] = useState<any>(null);

  useEffect(() => {
    fetchFriends();
    fetchRequests();
  }, []);

  const fetchFriends = async () => {
    const res = await fetch('/api/social/friends');
    if (res.ok) setFriends(await res.json());
  };

  const fetchRequests = async () => {
    const res = await fetch('/api/social/friend-requests');
    if (res.ok) setRequests(await res.json());
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/social/users/search?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) setSearchResults(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const sendFriendRequest = async (receiverId: string | number) => {
    setSendingRequestId(receiverId);
    try {
      const res = await fetch('/api/social/friend-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setToast({
          title: 'Request Sent',
          content: 'Your friend request has been sent successfully.',
        });
      } else {
        setToast({
          title: 'Request Failed',
          content: data.error || 'Failed to send friend request.',
        });
      }
    } catch (error) {
      setToast({
        title: 'Error',
        content: 'A network error occurred. Please try again.',
      });
    } finally {
      setSendingRequestId(null);
    }
  };

  const respondToRequest = async (id: string | number, action: 'ACCEPT' | 'REJECT') => {
    try {
      const res = await fetch(`/api/social/friend-request/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      
      if (res.ok) {
        setToast({
          title: action === 'ACCEPT' ? 'Request Accepted' : 'Request Rejected',
          content: action === 'ACCEPT' ? 'You are now friends!' : 'The request has been removed.',
        });
        fetchRequests();
        fetchFriends();
        if (searchQuery) {
          fetch(`/api/social/users/search?q=${encodeURIComponent(searchQuery)}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => setSearchResults(data));
        }
      } else {
        const data = await res.json();
        setToast({
          title: 'Error',
          content: data.error || 'Failed to respond to request.',
        });
      }
    } catch (error) {
      setToast({
        title: 'Error',
        content: 'A network error occurred.',
      });
    }
  };

  const viewUserProfile = async (userId: string) => {
    const res = await fetch(`/api/social/users/${userId}`);
    if (res.ok) setSelectedUser(await res.json());
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Your Network</h2>
          <p className="text-zinc-500 text-sm">Connect with other students and recruiters.</p>
        </div>
        <form onSubmit={handleSearch} className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <Input 
            placeholder="Search by username, name or email..." 
            className="pl-10 pr-20"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <Button type="submit" size="sm" className="absolute right-1.5 top-1.5 h-7 px-3 text-[10px]" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={14} /> : 'Search'}
          </Button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Friends & Requests */}
        <div className="lg:col-span-2 space-y-8">
          {requests.length > 0 && (
            <section>
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Pending Requests ({requests.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {requests.map(req => (
                  <Card key={req.id} className="p-4 flex items-center justify-between bg-zinc-50/50 border-zinc-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-zinc-200 rounded-full overflow-hidden flex-shrink-0">
                        {req.sender_avatar ? (
                          <img src={req.sender_avatar} alt={req.sender_name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-500 font-bold">
                            {req.sender_username?.[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{req.sender_name || req.sender_username}</p>
                        <p className="text-xs text-zinc-500">@{req.sender_username}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => respondToRequest(req.id, 'ACCEPT')} className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors">
                        <CheckCircle size={18} />
                      </button>
                      <button onClick={() => respondToRequest(req.id, 'REJECT')} className="p-2 bg-zinc-200 text-zinc-600 rounded-lg hover:bg-zinc-300 transition-colors">
                        <XCircle size={18} />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Friends ({friends.length})</h3>
            {friends.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {friends.map(friend => (
                  <Card key={friend.id} className="p-4 flex items-center justify-between hover:shadow-md transition-all cursor-pointer" onClick={() => viewUserProfile(friend.friend_id)}>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-zinc-100 rounded-full overflow-hidden flex-shrink-0">
                        {friend.friend_avatar ? (
                          <img src={friend.friend_avatar} alt={friend.friend_name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-400">
                            <User size={24} />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-bold">{friend.friend_name || friend.friend_username}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500">@{friend.friend_username}</span>
                          <Badge variant="info" className="text-[8px] px-1.5 py-0 h-4">{friend.friend_role}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setChatFriend(friend);
                        }}
                        className="p-2 bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 transition-colors"
                        title="Chat"
                      >
                        <MessageSquare size={18} />
                      </button>
                      <ChevronRight className="text-zinc-300" size={20} />
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
                <Users className="mx-auto text-zinc-300 mb-3" size={40} />
                <p className="text-zinc-500">You haven't made any friends yet.</p>
                <p className="text-xs text-zinc-400 mt-1">Search for users to expand your network.</p>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Search Results */}
        <div className="space-y-6">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Search Results</h3>
          {searchResults.length > 0 ? (
            <div className="space-y-3">
              {searchResults.map(result => (
                <Card key={result.id} className="p-3 flex items-center justify-between border-zinc-100">
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => viewUserProfile(result.id)}>
                    <div className="w-10 h-10 bg-zinc-100 rounded-full overflow-hidden flex-shrink-0">
                      {result.profile_picture_url ? (
                        <img src={result.profile_picture_url} alt={result.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400">
                          <User size={20} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{result.name || result.username}</p>
                      <p className="text-[10px] text-zinc-500 truncate">@{result.username}</p>
                    </div>
                  </div>
                  {result.id.toString() !== user.id.toString() && !result.is_friend && !result.has_sent_request && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        sendFriendRequest(result.id);
                      }}
                      disabled={sendingRequestId === result.id}
                      className="p-1.5 bg-black text-white rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
                      title="Send Friend Request"
                    >
                      {sendingRequestId === result.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Plus size={16} />
                      )}
                    </button>
                  )}
                  {result.has_sent_request && !result.is_friend && (
                    <Badge variant="warning" className="text-[10px]">Pending</Badge>
                  )}
                  {result.is_friend && (
                    <div className="flex items-center gap-2">
                      <Badge variant="success" className="text-[10px]">Friend</Badge>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setChatFriend({
                            friend_id: result.id,
                            friend_username: result.username,
                            friend_name: result.name,
                            friend_avatar: result.profile_picture_url
                          });
                        }}
                        className="p-1.5 bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 transition-colors"
                        title="Chat"
                      >
                        <MessageSquare size={16} />
                      </button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          ) : searchQuery ? (
            <p className="text-center py-8 text-zinc-400 text-sm italic">No users found matching "{searchQuery}"</p>
          ) : (
            <p className="text-center py-8 text-zinc-400 text-sm italic">Search for users above</p>
          )}
        </div>
      </div>

      {/* Chat Modal */}
      <AnimatePresence>
        {chatFriend && (
          <FriendChatModal 
            isOpen={!!chatFriend} 
            onClose={() => setChatFriend(null)} 
            friend={chatFriend} 
            currentUser={user} 
          />
        )}
      </AnimatePresence>

      {/* User Profile Modal */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSelectedUser(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <button onClick={() => setSelectedUser(null)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-black/5 rounded-full transition-all z-10">
                <X size={20} />
              </button>

              <div className="h-32 bg-gradient-to-r from-zinc-900 to-zinc-700" />
              <div className="px-8 pb-8">
                <div className="relative -mt-16 mb-6 flex items-end justify-between">
                  <div className="w-32 h-32 bg-white p-1 rounded-3xl shadow-xl">
                    <div className="w-full h-full bg-zinc-100 rounded-[22px] overflow-hidden">
                      {selectedUser.profile?.profile_picture_url ? (
                        <img src={selectedUser.profile.profile_picture_url} alt={selectedUser.profile.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-300">
                          <User size={64} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {selectedUser.id.toString() !== user.id.toString() && !selectedUser.is_friend && !selectedUser.has_sent_request && (
                      <Button 
                        onClick={() => sendFriendRequest(selectedUser.id)}
                        disabled={sendingRequestId === selectedUser.id}
                      >
                        {sendingRequestId === selectedUser.id ? (
                          <Loader2 size={18} className="animate-spin mr-2" />
                        ) : null}
                        Connect
                      </Button>
                    )}
                    {selectedUser.has_sent_request && !selectedUser.is_friend && (
                      <Badge variant="warning">Request Pending</Badge>
                    )}
                    {selectedUser.is_friend && (
                      <Button 
                        variant="neutral"
                        onClick={() => {
                          setChatFriend({
                            friend_id: selectedUser.id,
                            friend_username: selectedUser.username,
                            friend_name: selectedUser.profile?.name,
                            friend_avatar: selectedUser.profile?.profile_picture_url
                          });
                          setSelectedUser(null);
                        }}
                      >
                        <MessageSquare size={18} className="mr-2" />
                        Chat
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">{selectedUser.profile?.name || selectedUser.username}</h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-zinc-500 font-medium">@{selectedUser.username}</span>
                      <Badge variant="info">{selectedUser.role}</Badge>
                    </div>
                  </div>

                  {selectedUser.profile?.bio && (
                    <div>
                      <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">About</h4>
                      <p className="text-zinc-600 leading-relaxed">{selectedUser.profile.bio}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {selectedUser.profile?.location && (
                      <div className="flex items-center gap-3 text-zinc-600">
                        <MapPin size={18} className="text-zinc-400" />
                        <span>{selectedUser.profile.location}</span>
                      </div>
                    )}
                    {selectedUser.role === 'STUDENT' && selectedUser.profile?.education && (
                      <div className="flex items-center gap-3 text-zinc-600">
                        <GraduationCap size={18} className="text-zinc-400" />
                        <span>{selectedUser.profile.education}</span>
                      </div>
                    )}
                    {selectedUser.role === 'RECRUITER' && selectedUser.profile?.company_name && (
                      <div className="flex items-center gap-3 text-zinc-600">
                        <Building2 size={18} className="text-zinc-400" />
                        <span>{selectedUser.profile.company_name}</span>
                      </div>
                    )}
                  </div>

                  {selectedUser.role === 'STUDENT' && selectedUser.profile?.skills && (
                    <div>
                      <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedUser.profile.skills.map((skill: string) => (
                          <Badge key={skill} variant="neutral" className="bg-zinc-50">{skill}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FriendChatModal({ isOpen, onClose, friend, currentUser }: { isOpen: boolean; onClose: () => void; friend: any; currentUser: UserType }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && friend) {
      fetchMessages();
      const interval = setInterval(fetchMessages, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen, friend]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchMessages = async () => {
    if (!friend) return;
    try {
      const res = await fetch(`/api/chat/messages/${friend.friend_id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || loading || !friend) return;

    setLoading(true);
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId: friend.friend_id, content: newMessage }),
      });
      if (res.ok) {
        setNewMessage('');
        fetchMessages();
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !friend) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[600px]"
      >
        <div className="p-4 border-b flex items-center justify-between bg-zinc-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-200 rounded-full overflow-hidden">
              {friend.friend_avatar ? (
                <img src={friend.friend_avatar} alt={friend.friend_name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-500">
                  <User size={20} />
                </div>
              )}
            </div>
            <div>
              <p className="font-bold text-sm">{friend.friend_name || friend.friend_username}</p>
              <p className="text-[10px] text-zinc-500">@{friend.friend_username}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-200 rounded-full transition-all">
            <X size={20} />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/30">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex ${msg.sender_id.toString() === currentUser.id.toString() ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                  msg.sender_id.toString() === currentUser.id.toString() 
                    ? 'bg-black text-white rounded-tr-none' 
                    : 'bg-white border text-zinc-800 rounded-tl-none'
                }`}
              >
                {msg.content}
                <p className={`text-[8px] mt-1 opacity-50 ${msg.sender_id.toString() === currentUser.id.toString() ? 'text-right' : 'text-left'}`}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400">
              <MessageSquare size={40} className="mb-2 opacity-20" />
              <p className="text-xs">No messages yet. Say hi!</p>
            </div>
          )}
        </div>

        <form onSubmit={sendMessage} className="p-4 border-t bg-white flex gap-2">
          <Input 
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
          />
          <Button type="submit" disabled={!newMessage.trim() || loading}>
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
