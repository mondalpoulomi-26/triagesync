import { useState } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { AuthProvider, useAuth } from "./context/AuthContext";
import AuthPage from './pages/AuthPage';
import TriageQueuePage from './pages/TriageQueuePage';
import ResourcesPage from './pages/ResourcesPage';
import MyBookingsPage from './pages/MyBookingsPage';
import AdminPage from './pages/AdminPage';
import { LoadingState } from './components/Feedback';

function Shell() {
  const { user, loading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('triage');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingState label="Restoring session..." />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const navItems = [
    { id: 'triage', label: 'Triage Queue' },
    { id: 'resources', label: 'Resources & Slots' },
    { id: 'bookings', label: 'My Bookings' },
    ...(user.role === 'ADMIN' ? [{ id: 'admin', label: 'Admin Console' }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-base font-bold tracking-tight">TriageSync</span>
          </div>

          <nav className="flex flex-wrap items-center gap-1.5">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition ${
                  activeTab === item.id
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-slate-800">{user.name}</p>
              <p className="text-[11px] text-slate-500">{user.role}</p>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {activeTab === 'triage' && <TriageQueuePage />}
        {activeTab === 'resources' && <ResourcesPage />}
        {activeTab === 'bookings' && <MyBookingsPage />}
        {activeTab === 'admin' && user.role === 'ADMIN' && <AdminPage />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}