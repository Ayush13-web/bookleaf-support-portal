import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useEventStream } from '../../hooks/useEventStream.js';
import { CategoryLabel, PriorityBadge, StatusBadge } from '../../components/Badges.jsx';
import Thread from '../../components/Thread.jsx';
import { ErrorBanner, Spinner, fmtDate, fmtDateTime, inr } from '../../components/ui.jsx';

export default function TicketDetail() {
  const id = Number(useParams().id);
  const meta = useAsync(api.adminMeta);
  const { data: ticket, error, loading, reload } = useAsync(() => api.adminTicket(id), [id]);

  // Reply composer + AI draft state
  const [reply, setReply] = useState('');
  const [dirty, setDirty] = useState(false);           // admin has typed/edited: never overwrite their work
  const [draft, setDraft] = useState({ state: 'idle', flags: [], error: null }); // idle | loading | ready | unavailable
  const [sendStatus, setSendStatus] = useState('In Progress');
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [note, setNote] = useState('');
  const requestedFor = useRef(null);

  const requestDraft = useCallback(async (regenerate = false) => {
    setDraft((d) => ({ ...d, state: 'loading', error: null }));
    try {
      const r = await api.adminDraft(id, regenerate);
      setDraft({ state: 'ready', flags: r.flags ?? [], error: null });
      setReply(r.draft);
      setDirty(false);
    } catch (err) {
      // AI down / rate limited / not configured: ticket stays fully workable, admin writes manually.
      setDraft({ state: 'unavailable', flags: [], error: err });
    }
  }, [id]);

  // Opening a ticket fetches (or reuses the cached) draft exactly once per ticket + draft version.
  useEffect(() => {
    if (!ticket || ticket.id !== id) return;
    const key = `${id}:${ticket.messages.length}:${ticket.category}`;
    if (ticket.aiDraft) {
      if (!dirty && requestedFor.current !== key) { setReply(ticket.aiDraft); setDraft({ state: 'ready', flags: ticket.aiDraftFlags ?? [], error: null }); }
      requestedFor.current = key;
    } else if (requestedFor.current !== key && draft.state !== 'loading') {
      requestedFor.current = key;
      // Only auto-draft when the author spoke last; after an admin reply, drafting is on demand (saves tokens).
      const authorSpokeLast = ticket.messages.at(-1)?.senderRole !== 'admin';
      if (!dirty && authorSpokeLast) requestDraft(false);
    }
  }, [ticket, id, dirty, draft.state, requestDraft]);

  useEffect(() => { requestedFor.current = null; setReply(''); setDirty(false); setDraft({ state: 'idle', flags: [], error: null }); }, [id]);

  useEventStream((evt) => { if (evt.type === 'stream.connected' || evt.ticketId === id) reload({ silent: true }); });

  const run = async (fn) => {
    setActionError(null);
    try { await fn(); await reload({ silent: true }); } catch (err) { setActionError(err); }
  };
  const patch = (body) => run(() => api.adminUpdate(id, body));

  const send = () => run(async () => {
    setSending(true);
    try {
      await api.adminRespond(id, reply, sendStatus);
      setReply(''); setDirty(false); setDraft({ state: 'idle', flags: [], error: null });
    } finally { setSending(false); }
  });

  const addNote = () => run(async () => { await api.adminNote(id, note); setNote(''); });

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner error={error} onRetry={reload} />;
  const t = ticket;
  const closed = ['Resolved', 'Closed'].includes(t.status);

  return (
    <>
      <p><Link to="/admin">← Back to queue</Link></p>
      <div className="page-head">
        <div>
          <h1>#{t.id} · {t.subject}</h1>
          <p>{t.author.name} · {t.book ? t.book.title : 'General / Account level'} · opened {fmtDateTime(t.createdAt)}</p>
        </div>
        <span className="live">Live</span>
      </div>
      <ErrorBanner error={actionError} />

      <div className="grid-2" style={{ marginTop: '.75rem' }}>
        <div className="stack">
          <div className="card"><h3>Conversation</h3><Thread ticket={t} viewerRole="admin" /></div>

          <div className="card">
            <div className="row between">
              <h3>Reply to author</h3>
              <button className="ghost small" disabled={draft.state === 'loading'}
                onClick={() => { if (!dirty || window.confirm('Replace your edits with a fresh AI draft?')) requestDraft(true); }}>
                {draft.state === 'unavailable' ? 'Try AI draft again' : 'Regenerate AI draft'}
              </button>
            </div>

            {draft.state === 'loading' && <div className="banner info"><span className="spinner" />Drafting a reply from the knowledge base and this author's account...</div>}
            {draft.state === 'unavailable' && (
              <div className="banner warn" role="status">
                AI drafting isn't available right now ({draft.error?.message}). The ticket works as normal: write your reply below.
              </div>
            )}
            {draft.state === 'ready' && !dirty && (
              <div className="banner ok">AI-generated draft. Review and edit before sending: facts come from this author's account and BookLeaf policy.</div>
            )}
            {draft.flags.length > 0 && (
              <div className="banner warn" style={{ marginTop: '.5rem' }}>
                Check before sending:
                <ul className="flags">{draft.flags.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
            )}

            <div className="field" style={{ marginTop: '.75rem' }}>
              <label htmlFor="reply" className="small">Message (visible to the author)</label>
              <textarea id="reply" rows={12} value={reply} onChange={(e) => { setReply(e.target.value); setDirty(true); }} />
            </div>
            <div className="row">
              <label htmlFor="after" className="small" style={{ margin: 0 }}>After sending, set status to</label>
              <select id="after" style={{ width: 'auto' }} value={sendStatus} onChange={(e) => setSendStatus(e.target.value)}>
                <option>In Progress</option><option>Resolved</option><option>Closed</option>
              </select>
              <button disabled={sending || !reply.trim()} onClick={send}>{sending ? 'Sending...' : 'Send response'}</button>
            </div>
          </div>
        </div>

        <aside className="stack">
          <div className="card">
            <h3>Ticket</h3>
            <div className="field"><label htmlFor="st">Status</label>
              <select id="st" value={t.status} onChange={(e) => patch({ status: e.target.value })}>{meta.data?.statuses.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label htmlFor="cat">Category <span className="src">{t.categorySource === 'admin' ? 'edited by admin' : t.categorySource === 'pending' ? 'AI triaging...' : t.categorySource === 'rules' ? 'rule-based' : t.categorySource === 'ai' ? 'AI' : ''}</span></label>
              <select id="cat" value={t.category} onChange={(e) => patch({ category: e.target.value })}>{meta.data?.categories.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label htmlFor="pri">Priority <span className="src">{t.prioritySource === 'admin' ? 'edited by admin' : t.prioritySource === 'ai' ? 'AI' : t.prioritySource === 'rules' ? 'rule-based' : ''}</span></label>
              <select id="pri" value={t.priority} onChange={(e) => patch({ priority: e.target.value })}>{meta.data?.priorities.map((p) => <option key={p}>{p}</option>)}</select></div>
            {t.aiReasoning && <p className="small muted">AI triage: {t.aiReasoning}</p>}
            {t.aiStatus === 'fallback' && (
              <p className="small"><span className="muted">Triaged by rules (AI was unavailable). </span>
                <button className="ghost small" onClick={() => run(() => api.adminReclassify(id))}>Re-run AI triage</button></p>
            )}
            <div className="row between">
              <span className="small">Assignee: <b>{t.assignedToName || 'Unassigned'}</b></span>
              <button className="ghost small" onClick={() => patch({ assignee: t.assignedTo ? 'none' : 'me' })}>{t.assignedTo ? 'Unassign' : 'Assign to me'}</button>
            </div>
            {closed && <p className="small muted">Resolved {fmtDate(t.resolvedAt)}</p>}
          </div>

          <div className="card">
            <h3>Author &amp; book</h3>
            <p className="small" style={{ margin: 0 }}>{t.author.name} · {t.author.city}<br />{t.author.email}<br />Joined {fmtDate(t.author.joinedDate)}</p>
            {t.book ? (
              <p className="small">
                <b>{t.book.title}</b> ({t.book.bookId})<br />ISBN {t.book.isbn}<br />Status: {t.book.status}<br />
                {t.book.publicationDate ? <>Sold {t.book.totalCopiesSold} · earned {inr(t.book.totalRoyaltyEarned)}<br />Paid {inr(t.book.royaltyPaid)} · pending {inr(t.book.royaltyPending)}<br />Last payout {fmtDate(t.book.lastRoyaltyPayoutDate)}<br />Print: {t.book.printPartner} · {t.book.availableOn.join(', ')}</> : 'Not yet published'}
              </p>
            ) : <p className="small muted">Account-level query: no specific book.</p>}
          </div>

          <div className="card">
            <h3>Internal notes</h3>
            <p className="small muted">Never visible to the author.</p>
            {t.notes.length === 0 && <p className="small muted">No notes yet.</p>}
            {t.notes.map((n) => <div key={n.id} className="note"><div className="small muted">{n.adminName} · {fmtDateTime(n.createdAt)}</div>{n.body}</div>)}
            <div className="field" style={{ marginTop: '.75rem' }}>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the team" aria-label="Internal note" />
            </div>
            <button className="ghost" disabled={!note.trim()} onClick={addNote}>Add note</button>
          </div>
        </aside>
      </div>
    </>
  );
}
