import { useEffect, useState, useCallback } from 'react';
import { Calendar, Clock, Users, CheckCircle } from 'lucide-react';
import { apiRequest, formatLocalDateTime, toUtcIso } from '../lib/api';
import { Badge, EmptyState, ErrorBanner, LoadingState } from '../components/Feedback';

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

async function queryResources(page, filters) {
  const params = new URLSearchParams({ page: String(page) });
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.type) params.set('type', filters.type);
  if (filters.minCapacity) params.set('minCapacity', filters.minCapacity);

  const res = await apiRequest(`/resources?${params.toString()}`);
  return {
    data: res.data || [],
    pagination: { page: res.page, totalPages: res.totalPages || 1 },
  };
}

async function queryAvailability(resourceId, dateStr) {
  const from = toUtcIso(dateStr, '00:00');
  const nextDay = new Date(new Date(from).getTime() + 86400000).toISOString();
  const res = await apiRequest(
    `/resources/${resourceId}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(nextDay)}`
  );
  return res.bookings || [];
}

export default function ResourcesPage() {
  const [resources, setResources] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [filters, setFilters] = useState({ search: '', type: '', minCapacity: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedResource, setSelectedResource] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    const tomorrow = new Date(Date.now() + 86400000);
    return tomorrow.toISOString().split('T')[0];
  });
  const [availability, setAvailability] = useState([]);
  const [loadingAvail, setLoadingAvail] = useState(false);

  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [purpose, setPurpose] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [bookingMsg, setBookingMsg] = useState('');
  const [bookingErr, setBookingErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchResources = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError('');
      try {
        const result = await queryResources(page, filters);
        setResources(result.data);
        setPagination(result.pagination);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    let active = true;

    queryResources(1, filters)
      .then((result) => {
        if (!active) return;
        setResources(result.data);
        setPagination(result.pagination);
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
  }, [filters]);

  const fetchAvailability = useCallback(async (resourceId, dateStr) => {
    if (!resourceId || !dateStr) return;
    setLoadingAvail(true);
    try {
      const bookings = await queryAvailability(resourceId, dateStr);
      setAvailability(bookings);
    } catch (err) {
      setBookingErr(err.message);
    } finally {
      setLoadingAvail(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedResource || !selectedDate) return;
    let active = true;

    queryAvailability(selectedResource.id, selectedDate)
      .then((bookings) => {
        if (active) setAvailability(bookings);
      })
      .catch((err) => {
        if (active) setBookingErr(err.message);
      })
      .finally(() => {
        if (active) setLoadingAvail(false);
      });

    return () => {
      active = false;
    };
  }, [selectedResource, selectedDate]);

  const handleFilterChange = (updater) => {
    setLoading(true);
    setError('');
    setFilters(updater);
  };

  const handleBookSlot = async (e) => {
    e.preventDefault();
    setBookingErr('');
    setBookingMsg('');
    setSubmitting(true);

    try {
      const payload = {
        resourceId: selectedResource.id,
        startTime: toUtcIso(selectedDate, startTime),
        endTime: toUtcIso(selectedDate, endTime),
        purpose: purpose.trim(),
        ...(ticketId.trim() ? { ticketId: ticketId.trim() } : {}),
      };

      await apiRequest('/bookings', { method: 'POST', body: payload });
      setBookingMsg('Slot booked! Status is PENDING admin approval.');
      setPurpose('');
      setTicketId('');
      fetchAvailability(selectedResource.id, selectedDate);
    } catch (err) {
      setBookingErr(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <input
          type="text"
          value={filters.search}
          onChange={(e) => handleFilterChange((f) => ({ ...f, search: e.target.value }))}
          placeholder="Search resource name..."
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={filters.type}
          onChange={(e) => handleFilterChange((f) => ({ ...f, type: e.target.value }))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">All Resource Types</option>
          <option value="ROOM">ROOM</option>
          <option value="LAB">LAB</option>
          <option value="EQUIPMENT">EQUIPMENT</option>
        </select>
        <input
          type="number"
          min={1}
          max={500}
          value={filters.minCapacity}
          onChange={(e) => handleFilterChange((f) => ({ ...f, minCapacity: e.target.value }))}
          placeholder="Min capacity (e.g. 4)"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-6 space-y-3">
          {loading ? (
            <LoadingState label="Loading resources..." />
          ) : resources.length === 0 ? (
            <EmptyState
              title="No resources found"
              description="Try clearing your search or capacity filters."
            />
          ) : (
            <>
              {resources.map((res) => (
                <div
                  key={res.id}
                  onClick={() => {
                    setSelectedResource(res);
                    setLoadingAvail(true);
                    setBookingErr('');
                    setBookingMsg('');
                  }}
                  className={`cursor-pointer rounded-xl border p-4 transition ${
                    selectedResource?.id === res.id
                      ? 'border-indigo-500 bg-indigo-50/40'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{res.name}</h3>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="indigo">{res.type}</Badge>
                      <Badge variant={res.isActive ? 'emerald' : 'red'}>
                        {res.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{res.description || 'No description provided.'}</p>
                  <div className="mt-2 flex items-center gap-1 text-xs font-medium text-slate-500">
                    <Users className="h-3.5 w-3.5" /> Capacity: {res.capacity}
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-500">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => fetchResources(pagination.page - 1)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => fetchResources(pagination.page + 1)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="lg:col-span-6">
          {!selectedResource ? (
            <EmptyState
              title="Select a resource"
              description="Choose a room, lab, or equipment item to inspect daily slot availability and book a 30-minute block."
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">{selectedResource.name}</h2>
                <p className="text-xs text-slate-500">
                  All times shown in your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Check Availability Date
                </label>
                <div className="relative max-w-xs">
                  <Calendar className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      setLoadingAvail(true);
                      setSelectedDate(e.target.value);
                    }}
                    className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-sm"
                  />
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-indigo-600" /> Blocked Slots on {selectedDate}
                </p>
                {loadingAvail ? (
                  <p className="text-xs text-slate-400">Checking slots...</p>
                ) : availability.length === 0 ? (
                  <p className="text-xs text-emerald-700 font-medium">All 30-minute slots are open on this date.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {availability.map((b, idx) => (
                      <li key={idx} className="flex items-center justify-between text-xs bg-white px-2.5 py-1.5 rounded border border-slate-200">
                        <span>
                          {formatLocalDateTime(b.startTime)} → {formatLocalDateTime(b.endTime)}
                        </span>
                        <Badge variant={b.status === 'APPROVED' ? 'emerald' : 'amber'}>{b.status}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <ErrorBanner message={bookingErr} onDismiss={() => setBookingErr('')} />
              {bookingMsg && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-800">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>{bookingMsg}</span>
                </div>
              )}

              <form onSubmit={handleBookSlot} className="space-y-3 border-t border-slate-100 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Start (30-min step)</label>
                    <select
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white"
                    >
                      {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">End (30-min step)</label>
                    <select
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white"
                    >
                      {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Purpose (5–200 chars)
                  </label>
                  <input
                    type="text"
                    required
                    minLength={5}
                    maxLength={200}
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="Live customer reproduction & packet capture"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Linked Ticket ID (optional)
                  </label>
                  <input
                    type="text"
                    value={ticketId}
                    onChange={(e) => setTicketId(e.target.value)}
                    placeholder="Optional ticket UUID"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || !selectedResource.isActive}
                  className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Booking Slot...' : 'Request Slot Booking'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}