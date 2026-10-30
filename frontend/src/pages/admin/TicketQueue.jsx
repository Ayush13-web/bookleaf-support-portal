import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useEventStream } from '../../hooks/useEventStream.js';
import { CategoryLabel, PriorityBadge, StatusBadge } from '../../components/Badges.jsx';
import { Empty, ErrorBanner, Spinner, ageOf } from '../../components/ui.jsx';

const INITIAL = { status: '', category: '', priority: '', assigned: '', q: '', from: '', to: '', sort: 'urgency' };
const STALE_HOURS = 48;

export default function TicketQueue() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(INITIAL);
  const [debouncedQ, setDebouncedQ] = useState('');
  const meta = useAsync(api.adminMeta);
  const stats = useAsync(api.adminStats);
  const list = useAsync(() => api.adminTickets({ ...filters, q: debouncedQ, limit: 100 }), [
    filters.status, filters.category, filters.priority, filters.assigned, filters.from, filters.to, filters.sort, debouncedQ,
  ]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => clearTimeout(t);
  }, [filters.q]);

  // New tickets and AI triage results arrive live.
  useEventStream(() => { list.reload({ silent: true }); stats.reload({ silent: true }); });

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const options = (items) => items?.map((i) => <option key={i} value={i}>{i}</option>);
  const tickets = list.data?.data ?? [];
  const s = stats.data;
  const open = (s?.byStatus?.Open ?? 0);
  const inProgress = (s?.byStatus?.['In Progress'] ?? 0);

  return (
    <>
      <div className="page-head">
        <div><h1>Ticket queue</h1><p>Most urgent and oldest unresolved tickets first.</p></div>
        <span className="live">Live</span>
      </div>

      {s && (
        <div className="stats">
          <div className="stat"><b>{open}</b><span>Open</span></div>
          <div className="stat"><b>{inProgress}</b><span>In progress</span></div>
          <div className="stat alert"><b>{(s.openByPriority.Critical ?? 0) + (s.openByPriority.High ?? 0)}</b><span>Critical + High unresolved</span></div>
          <div className="stat"><b>{s.unassigned}</b><span>Unassigned</span></div>
          <div className={`stat ${s.stale ? 'alert' : ''}`}><b>{s.stale}</b><span>Unresolved over {STALE_HOURS}h</span></div>
        </div>
      )}

      <div className="filters">
        <div className="field"><label htmlFor="f-q">Search</label><input id="f-q" placeholder="Subject, author, book" value={filters.q} onChange={set('q')} /></div>
        <div className="field"><label htmlFor="f-status">Status</label><select id="f-status" value={filters.status} onChange={set('status')}><option value="">All</option>{options(meta.data?.statuses)}</select></div>
        <div className="field"><label htmlFor="f-cat">Category</label><select id="f-cat" value={filters.category} onChange={set('category')}><option value="">All</option>{options(meta.data?.categories)}</select></div>
        <div className="field"><label htmlFor="f-pri">Priority</label><select id="f-pri" value={filters.priority} onChange={set('priority')}><option value="">All</option>{options(meta.data?.priorities)}</select></div>
        <div className="field"><label htmlFor="f-asg">Assignment</label><select id="f-asg" value={filters.assigned} onChange={set('assigned')}><option value="">Anyone</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option></select></div>
        <div className="field"><label htmlFor="f-from">Created from</label><input id="f-from" type="date" value={filters.from} onChange={set('from')} /></div>
        <div className="field"><label htmlFor="f-to">Created to</label><input id="f-to" type="date" value={filters.to} onChange={set('to')} /></div>
        <div className="field"><label htmlFor="f-sort">Sort</label><select id="f-sort" value={filters.sort} onChange={set('sort')}><option value="urgency">Urgency</option><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></div>
      </div>
      <div className="row" style={{ marginBottom: '.75rem' }}>
        <button className="ghost small" onClick={() => { setFilters(INITIAL); setDebouncedQ(''); }}>Clear filters</button>
        <span className="muted small">{list.data ? `${list.data.meta.total} ticket${list.data.meta.total === 1 ? '' : 's'}` : ''}</span>
      </div>

      {list.loading && !list.data ? <Spinner /> : <ErrorBanner error={list.error} onRetry={list.reload} />}
      {list.data && !tickets.length && <Empty title="No tickets match these filters">Try clearing a filter.</Empty>}
      {tickets.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Priority</th><th>Subject</th><th>Author / book</th><th>Category</th><th>Status</th><th>Assignee</th><th>Age</th></tr></thead>
            <tbody>
              {tickets.map((t) => {
                const closed = ['Resolved', 'Closed'].includes(t.status);
                const age = ageOf(t.createdAt);
                const stale = !closed && age.hours >= STALE_HOURS;
                return (
                  <tr key={t.id} className={`clickable ${stale ? 'stale' : ''}`} onClick={() => navigate(`/admin/tickets/${t.id}`)}>
                    <td>{t.id}</td>
                    <td><PriorityBadge priority={t.priority} source={t.prioritySource} /></td>
                    <td><b>{t.subject}</b></td>
                    <td>{t.authorName}<div className="small muted">{t.bookTitle || 'General / Account level'}</div></td>
                    <td><CategoryLabel category={t.category} source={t.categorySource} /></td>
                    <td><StatusBadge status={t.status} /></td>
                    <td>{t.assignedToName || <span className="muted">Unassigned</span>}</td>
                    <td className={stale ? 'age-stale' : ''}>{closed ? '-' : age.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
