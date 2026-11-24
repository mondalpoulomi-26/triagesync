import { useEffect, useState, useCallback } from 'react';
import { apiRequest, formatLocalDateTime } from '../lib/api';
import { Badge, ErrorBanner, LoadingState } from '../components/Feedback';

async function fetchAdminData(bookingStatus) {
  const [statsData, bookingsData, resourcesData] = await Promise.all([
    apiRequest('/admin/stats'),
    apiRequest(`/bookings${bookingStatus ? `?status=${bookingStatus}` : ''}`),
    apiRequest('/resources?page=1'),
  ]);

  return {
    stats: statsData,
    bookings: bookingsData.data || [],
    resources: resourcesData.data || [],
  };
}

export default function AdminPage() {
  const [tab, setTab] = useState('bookings');
  const [adminStats, setAdminStats] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [resources, setResources] = useState([]);
  const [bookingStatus, setBookingStatus] = useState('PENDING');

  const [rejectId, setRejectId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');

  // New Resource Form
  const [newRes, setNewRes] = useState({ name: '', type: 'ROOM', capacity: 4, description: '' });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminData(bookingStatus);
      setAdminStats(data.stats);
      setBookings(data.bookings);
      setResources(data.resources);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [bookingStatus]);

  useEffect(() => {
    let active = true;

    fetchAdminData(bookingStatus)
      .then((data) => {
        if (!active) return;
        setAdminStats(data.stats);
        setBookings(data.bookings);
        setResources(data.resources);
        setError('');
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [bookingStatus]);
  const handleApprove = async (id) => {
    setError('');
    try {
      await apiRequest(`/bookings/${id}/approve`, { method: 'PATCH' });
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest(`/bookings/${rejectId}/reject`, {
        method: 'PATCH',
        body: { note: rejectNote.trim() },
      });
      setRejectId(null);
      setRejectNote('');
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateResource = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/resources', {
        method: 'POST',
        body: {
          name: newRes.name.trim(),
          type: newRes.type,
          capacity: Number(newRes.capacity),
          description: newRes.description.trim() || undefined,
        },
      });
      setNewRes({ name: '', type: 'ROOM', capacity: 4, description: '' });
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleResource = async (res) => {
    setError('');
    try {
      await apiRequest(`/resources/${res.id}`, {
        method: 'PATCH',
        body: { isActive: !res.isActive },
      });
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading && !adminStats) return <LoadingState label="Loading admin console..." />;

  return (
    <div className="space-y-6">
      {/* Analytics Summary */}
      {adminStats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Active Resources</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{adminStats.activeResources}</p>
          </div>
          {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((st) => (
            <div key={st} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">{st}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {adminStats.bookingsByStatus?.[st] ?? 0}
              </p>
            </div>
          ))}
        </div>
      )}

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {/* Sub-navigation */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setTab('bookings')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            tab === 'bookings' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200'
          }`}
        >
          Booking Approvals
        </button>
        <button
          onClick={() => setTab('resources')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            tab === 'resources' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200'
          }`}
        >
          Manage Resources
        </button>
      </div>

      {tab === 'bookings' ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <select
              value={bookingStatus}
              onChange={(e) => setBookingStatus(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="PENDING">PENDING</option>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          <div className="space-y-3">
            {bookings.map((b) => (
              <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {b.resource?.name || b.resourceId}
                    </span>
                    <Badge variant={b.status === 'PENDING' ? 'amber' : b.status === 'APPROVED' ? 'emerald' : 'slate'}>
                      {b.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatLocalDateTime(b.startTime)} → {formatLocalDateTime(b.endTime)}
                  </p>
                  <p className="text-xs text-slate-700">{b.purpose}</p>
                </div>

                {b.status === 'PENDING' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleApprove(b.id)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => { setRejectId(b.id); setRejectNote(''); }}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Rejection Modal */}
          {rejectId && (
            <form onSubmit={handleReject} className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
              <p className="text-xs font-bold text-red-900">Rejection Note (required, 5–200 chars)</p>
              <input
                type="text"
                required
                minLength={5}
                maxLength={200}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Reason for rejecting this booking..."
                className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button type="submit" className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">
                  Confirm Rejection
                </button>
                <button
                  type="button"
                  onClick={() => setRejectId(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={handleCreateResource} className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-4 space-y-3 h-fit">
            <h3 className="text-sm font-bold text-slate-900">Add New Resource</h3>
            <input
              type="text"
              required
              minLength={3}
              maxLength={60}
              value={newRes.name}
              onChange={(e) => setNewRes((r) => ({ ...r, name: e.target.value }))}
              placeholder="Resource Name (e.g. Network Lab B)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={newRes.type}
                onChange={(e) => setNewRes((r) => ({ ...r, type: e.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="ROOM">ROOM</option>
                <option value="LAB">LAB</option>
                <option value="EQUIPMENT">EQUIPMENT</option>
              </select>
              <input
                type="number"
                required
                min={1}
                max={500}
                value={newRes.capacity}
                onChange={(e) => setNewRes((r) => ({ ...r, capacity: e.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <input
              type="text"
              maxLength={300}
              value={newRes.description}
              onChange={(e) => setNewRes((r) => ({ ...r, description: e.target.value }))}
              placeholder="Description (optional)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white">
              Create Resource
            </button>
          </form>

          <div className="lg:col-span-7 space-y-2.5">
            {resources.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5">
                <div>
                  <p className="text-sm font-bold text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-500">{r.type} • Capacity {r.capacity}</p>
                </div>
                <button
                  onClick={() => handleToggleResource(r)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    r.isActive
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {r.isActive ? 'Active (Click to Disable)' : 'Inactive (Click to Enable)'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}