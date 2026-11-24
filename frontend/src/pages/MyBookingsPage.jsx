import { useEffect, useState, useCallback } from 'react';
import { apiRequest, formatLocalDateTime } from '../lib/api';
import { Badge, EmptyState, ErrorBanner, LoadingState } from '../components/Feedback';

async function fetchMyBookings(statusFilter) {
  const params = new URLSearchParams();
  if (statusFilter) params.set('status', statusFilter);
  const res = await apiRequest(`/bookings/mine?${params.toString()}`);
  return res.data || [];
}

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmCancelId, setConfirmCancelId] = useState(null);

  const fetchMine = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchMyBookings(statusFilter);
      setBookings(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    let active = true;

    fetchMyBookings(statusFilter)
      .then((data) => {
        if (!active) return;
        setBookings(data);
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
  }, [statusFilter]);

  const handleCancel = async (bookingId) => {
    setError('');
    try {
      await apiRequest(`/bookings/${bookingId}/cancel`, { method: 'PATCH' });
      setConfirmCancelId(null);
      fetchMine();
    } catch (err) {
      setError(err.message);
    }
  };

  const statusVariant = (s) =>
    s === 'APPROVED' ? 'emerald' : s === 'PENDING' ? 'amber' : s === 'REJECTED' ? 'red' : 'slate';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">My Resource Bookings</h2>
          <p className="text-xs text-slate-500">Manage your upcoming and past slot reservations.</p>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setLoading(true);
            setError('');
            setStatusFilter(e.target.value);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="PENDING">PENDING</option>
          <option value="APPROVED">APPROVED</option>
          <option value="REJECTED">REJECTED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {loading ? (
        <LoadingState label="Loading your bookings..." />
      ) : bookings.length === 0 ? (
        <EmptyState
          title="No bookings found"
          description="Reserve a room, lab, or equipment slot from the Resources tab."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {bookings.map((b) => {
            const canCancel =
              (b.status === 'PENDING' || b.status === 'APPROVED') &&
              new Date(b.startTime) > new Date();

            return (
              <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {b.resource?.name || `Resource ${b.resourceId}`}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatLocalDateTime(b.startTime)} → {formatLocalDateTime(b.endTime)}
                    </p>
                  </div>
                  <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
                </div>

                <p className="text-xs text-slate-700">{b.purpose}</p>

                {b.decisionNote && (
                  <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-800">
                    <strong>Admin Note:</strong> {b.decisionNote}
                  </div>
                )}

                {canCancel && (
                  <div className="pt-1">
                    {confirmCancelId === b.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCancel(b.id)}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                        >
                          Confirm Cancel
                        </button>
                        <button
                          onClick={() => setConfirmCancelId(null)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                        >
                          Keep Slot
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmCancelId(b.id)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        Cancel Booking
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}