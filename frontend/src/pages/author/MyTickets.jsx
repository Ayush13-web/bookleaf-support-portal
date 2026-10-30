import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useEventStream } from '../../hooks/useEventStream.js';
import { StatusBadge } from '../../components/Badges.jsx';
import Thread from '../../components/Thread.jsx';
import { Empty, ErrorBanner, Spinner, fmtDate } from '../../components/ui.jsx';

export default function MyTickets() {
  const [params, setParams] = useSearchParams();
  const { data: tickets, error, loading, reload } = useAsync(api.myTickets);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [replyError, setReplyError] = useState(null);
  const [unread, setUnread] = useState(new Set());
  const selectedId = Number(params.get('ticket')) || null;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  // Real-time: the server pushes "ticket.updated" when an admin responds or changes status.
  useEventStream((evt) => {
    if (evt.type === 'stream.connected') return;
    reload({ silent: true });
    if (evt.type === 'ticket.updated' && evt.ticketId !== selectedRef.current) {
      setUnread((s) => new Set(s).add(evt.ticketId));
    }
  });

  const selected = tickets?.find((t) => t.id === selectedId) ?? null;
  useEffect(() => {
    if (tickets?.length && !selected) setParams({ ticket: tickets[0].id }, { replace: true });
  }, [tickets, selected, setParams]);
  useEffect(() => {
    if (selectedId) setUnread((s) => { const n = new Set(s); n.delete(selectedId); return n; });
  }, [selectedId, tickets]);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setReplyError(null);
    try {
      await api.replyAsAuthor(selected.id, reply);
      setReply('');
      await reload({ silent: true });
    } catch (err) {
      setReplyError(err);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner error={error} onRetry={reload} />;

  return (
    <>
      <div className="page-head">
        <div><h1>My tickets</h1><p>Replies from our team appear here automatically.</p></div>
        <div className="row"><span className="live">Live</span><Link to="/author/tickets/new"><button>New query</button></Link></div>
      </div>

      {params.get('created') && <div className="banner ok" style={{ marginBottom: '1rem' }}>Your query has been submitted. We'll reply here, usually within 48 hours.</div>}

      {!tickets.length ? (
        <Empty title="You haven't raised any queries yet">
          <p>Questions about royalties, your ISBN, printing or availability? <Link to="/author/tickets/new">Submit a query</Link>.</p>
        </Empty>
      ) : (
        <div className="split">
          <div className="ticket-list">
            {tickets.map((t) => (
              <button key={t.id} className={`ticket-item ${t.id === selectedId ? 'selected' : ''}`} onClick={() => setParams({ ticket: t.id })}>
                <b>{unread.has(t.id) && <span className="dot" title="New activity" />}{t.subject}</b>
                <div className="row between small">
                  <StatusBadge status={t.status} />
                  <span className="muted">{fmtDate(t.updatedAt)}</span>
                </div>
                <div className="small muted">{t.bookTitle || 'General / Account level'}</div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="card">
              <div className="row between">
                <h2>{selected.subject}</h2>
                <StatusBadge status={selected.status} />
              </div>
              <p className="small muted">#{selected.id} · {selected.bookTitle || 'General / Account level'} · {selected.category} · opened {fmtDate(selected.createdAt)}</p>
              <Thread ticket={selected} viewerRole="author" />
              <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '1rem 0' }} />
              {selected.status === 'Closed' ? (
                <div className="banner info">This ticket is closed. <Link to="/author/tickets/new">Open a new query</Link> if you need more help.</div>
              ) : (
                <form onSubmit={send}>
                  <label htmlFor="reply">{selected.status === 'Resolved' ? 'Not fully solved? Reply to re-open this ticket' : 'Add a reply'}</label>
                  <textarea id="reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={5000} />
                  <ErrorBanner error={replyError} />
                  <div style={{ marginTop: '.6rem' }}><button disabled={busy || !reply.trim()}>{busy ? 'Sending...' : 'Send reply'}</button></div>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
