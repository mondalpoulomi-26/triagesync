import { useEffect, useState, useCallback } from 'react';
import { Search, ShieldAlert, CheckCircle2, History, Upload } from 'lucide-react';
import { apiRequest, formatLocalDateTime } from '../lib/api';
import { Badge, EmptyState, ErrorBanner, LoadingState } from '../components/Feedback';

const CATEGORIES = ['BILLING', 'BUG', 'FEATURE_REQUEST', 'LOGIN', 'DELIVERY'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

const SAMPLE_FEED = [
  {
    externalId: 'EXT-9001',
    subject: 'My package has not arrived after 10 days',
    body: 'Tracking number shows stuck in transit. Please check delivery status.',
  },
  {
    externalId: 'EXT-9002',
    subject: 'Duplicate invoice charge on credit card',
    body: 'I need a refund for the double billing charge this morning.',
  },
  {
    externalId: 'EXT-9003',
    subject: 'Production down: 500 exception on login <script>alert("xss")</script>',
    body: 'Users are locked out when entering 2FA password codes.',
  },
];

async function queryStats() {
  return apiRequest('/stats');
}

async function queryTickets(page, filterState, queryText) {
  const params = new URLSearchParams({ page: String(page), limit: '10' });
  if (filterState.status) params.set('status', filterState.status);
  if (filterState.category) params.set('category', filterState.category);
  if (filterState.priority) params.set('priority', filterState.priority);
  if (queryText.trim()) params.set('q', queryText.trim());

  const res = await apiRequest(`/tickets?${params.toString()}`);
  return {
    data: res.data || [],
    pagination: { page: res.page, totalPages: res.totalPages || 1, total: res.total || 0 },
  };
}

export default function TriageQueuePage() {
  const [stats, setStats] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [filters, setFilters] = useState({ status: '', category: '', priority: '', q: '' });
  const [debouncedQ, setDebouncedQ] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [optimisticError, setOptimisticError] = useState('');
  const [importBanner, setImportBanner] = useState('');
  const [importing, setImporting] = useState(false);

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [events, setEvents] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => clearTimeout(t);
  }, [filters.q]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await queryStats();
      setStats(data);
    } catch {
      // Non-blocking stats fetch
    }
  }, []);

  const fetchTickets = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError('');
      try {
        const result = await queryTickets(page, filters, debouncedQ);
        setTickets(result.data);
        setPagination(result.pagination);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [filters, debouncedQ]
  );

  useEffect(() => {
    let active = true;

    queryStats()
      .then((data) => {
        if (active) setStats(data);
      })
      .catch(() => {
        // Non-blocking stats fetch
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    queryTickets(1, filters, debouncedQ)
      .then((result) => {
        if (!active) return;
        setTickets(result.data);
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
  }, [filters, debouncedQ]);

  const openTicketDetail = async (ticket) => {
    setSelectedTicket(ticket);
    setLoadingDetail(true);
    setOptimisticError('');
    try {
      const res = await apiRequest(`/tickets/${ticket.id}`);
      setSelectedTicket(res.ticket);
      setEvents(res.events || []);
    } catch (err) {
      setOptimisticError(err.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleOptimisticPatch = async (ticketId, patchPayload) => {
    setOptimisticError('');

    const previousTickets = [...tickets];
    const previousSelected = selectedTicket ? { ...selectedTicket } : null;

    const applyOptimistic = (t) => {
      if (t.id !== ticketId) return t;
      const next = { ...t, ...patchPayload };
      if (patchPayload.category && patchPayload.category !== t.category) {
        next.isHumanOverride = true;
        next.isReviewed = true;
      }
      if (patchPayload.status && t.status === 'OPEN' && patchPayload.status !== 'OPEN') {
        next.isReviewed = true;
      }
      return next;
    };

    setTickets((prev) => prev.map(applyOptimistic));
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket((prev) => applyOptimistic(prev));
    }

    try {
      const res = await apiRequest(`/tickets/${ticketId}`, {
        method: 'PATCH',
        body: patchPayload,
      });

      setTickets((prev) => prev.map((t) => (t.id === ticketId ? res.ticket : t)));
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket(res.ticket);
        setEvents(res.events || []);
      }
      fetchStats();
    } catch (err) {
      setTickets(previousTickets);
      if (previousSelected) setSelectedTicket(previousSelected);
      setOptimisticError(`Update rolled back: ${err.message}`);
    }
  };

  const handleReimportFeed = async () => {
    setImporting(true);
    setImportBanner('');
    setError('');
    try {
      const res = await apiRequest('/tickets/import', {
        method: 'POST',
        body: { tickets: SAMPLE_FEED },
      });
      setImportBanner(
        `Feed synced: ${res.importedCount} imported, ${res.updatedCount} updated, ${res.skippedOverrideCount} human overrides preserved.`
      );
      fetchTickets(1);
      fetchStats();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const priorityVariant = (p) =>
    p === 'URGENT' ? 'red' : p === 'HIGH' ? 'amber' : p === 'MEDIUM' ? 'indigo' : 'slate';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Tickets</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{pagination.total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Reviewed by Agents</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{stats?.reviewedCount ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Model Agreement Rate</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">
            {stats?.modelAgreementRate !== undefined ? `${Number(stats.modelAgreementRate).toFixed(1)}%` : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between">
          <p className="text-xs font-medium text-slate-500">Ingestion Feed</p>
          <button
            type="button"
            onClick={handleReimportFeed}
            disabled={importing}
            className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            {importing ? 'Syncing...' : 'Re-Import Feed'}
          </button>
        </div>
      </div>

      {importBanner && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800">
          <span>{importBanner}</span>
          <button onClick={() => setImportBanner('')} className="underline">Dismiss</button>
        </div>
      )}

      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <ErrorBanner message={optimisticError} onDismiss={() => setOptimisticError('')} />

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search subject or body..."
            className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <select
          value={filters.status}
          onChange={(e) => {
            setLoading(true);
            setError('');
            setFilters((f) => ({ ...f, status: e.target.value }));
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={filters.category}
          onChange={(e) => {
            setLoading(true);
            setError('');
            setFilters((f) => ({ ...f, category: e.target.value }));
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={filters.priority}
          onChange={(e) => {
            setLoading(true);
            setError('');
            setFilters((f) => ({ ...f, priority: e.target.value }));
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-3">
          {loading ? (
            <LoadingState label="Loading triage queue..." />
          ) : tickets.length === 0 ? (
            <EmptyState
              title="No matching tickets"
              description="Adjust your search query or filter dropdowns, or re-import the ticket feed."
            />
          ) : (
            <>
              {tickets.map((ticket) => {
                const isSelected = selectedTicket?.id === ticket.id;
                return (
                  <div
                    key={ticket.id}
                    onClick={() => openTicketDetail(ticket)}
                    className={`cursor-pointer rounded-xl border p-4 transition ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/40 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-xs text-slate-500">{ticket.externalId}</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {ticket.isHumanOverride && (
                          <Badge variant="amber">
                            <ShieldAlert className="mr-1 h-3 w-3" /> Override
                          </Badge>
                        )}
                        {ticket.isReviewed && (
                          <Badge variant="emerald">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Reviewed
                          </Badge>
                        )}
                        <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority}</Badge>
                        <Badge variant="indigo">{ticket.category}</Badge>
                        <Badge>{ticket.status}</Badge>
                      </div>
                    </div>

                    <h3 className="text-sm font-semibold text-slate-900 wrap-break-word">
                      {ticket.subject}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600 wrap-break-word">
                      {ticket.body}
                    </p>
                  </div>
                );
              })}

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-500">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => fetchTickets(pagination.page - 1)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => fetchTickets(pagination.page + 1)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="lg:col-span-5">
          {!selectedTicket ? (
            <EmptyState
              title="Select a ticket"
              description="Click any ticket in the queue to inspect its full body, apply optimistic triage edits, and view its audit trail."
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5 sticky top-4">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span className="font-mono">{selectedTicket.externalId}</span>
                  <span>Auto-predicted: <strong>{selectedTicket.autoCategory}</strong></span>
                </div>
                <h2 className="text-base font-bold text-slate-900 wrap-break-word">
                  {selectedTicket.subject}
                </h2>
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700 wrap-break-word border border-slate-100">
                  {selectedTicket.body}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 border-t border-slate-100 pt-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                    Category
                  </label>
                  <select
                    value={selectedTicket.category}
                    onChange={(e) =>
                      handleOptimisticPatch(selectedTicket.id, { category: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium bg-white"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                    Priority
                  </label>
                  <select
                    value={selectedTicket.priority}
                    onChange={(e) =>
                      handleOptimisticPatch(selectedTicket.id, { priority: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium bg-white"
                  >
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                    Status
                  </label>
                  <select
                    value={selectedTicket.status}
                    onChange={(e) =>
                      handleOptimisticPatch(selectedTicket.id, { status: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium bg-white"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mb-3">
                  <History className="h-4 w-4 text-indigo-600" />
                  <span>Audit History ({events.length})</span>
                </div>

                {loadingDetail ? (
                  <p className="text-xs text-slate-400">Loading audit events...</p>
                ) : events.length === 0 ? (
                  <p className="text-xs text-slate-400">No agent changes recorded yet.</p>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {events.map((ev) => (
                      <div key={ev.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs">
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="font-semibold text-slate-700">{ev.actor}</span>
                          <span>{formatLocalDateTime(ev.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-slate-700">
                          Changed <span className="font-mono font-semibold">{ev.field}</span> from{' '}
                          <span className="line-through text-slate-400">{ev.oldValue || 'none'}</span> to{' '}
                          <span className="font-semibold text-indigo-700">{ev.newValue}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}