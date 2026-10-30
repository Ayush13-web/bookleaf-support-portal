import { fmtDateTime } from './ui.jsx';

/** Conversation view shared by author and admin portals. */
export default function Thread({ ticket, viewerRole }) {
  const label = (m) => {
    if (m.senderRole === viewerRole) return 'You';
    return m.senderRole === 'admin' ? (m.senderName || 'BookLeaf Support') : (m.senderName || 'Author');
  };
  return (
    <div className="thread">
      <div className="msg">
        <div className="meta"><b>{viewerRole === 'author' ? 'You' : 'Author'}</b> · {fmtDateTime(ticket.createdAt)}</div>
        {ticket.description}
        {ticket.attachments?.length > 0 && (
          <div className="small muted" style={{ marginTop: '.5rem' }}>Attachments: {ticket.attachments.map((a) => a.name).join(', ')}</div>
        )}
      </div>
      {ticket.messages.map((m) => (
        <div key={m.id} className={`msg ${m.senderRole}`}>
          <div className="meta"><b>{label(m)}</b> · {fmtDateTime(m.createdAt)}</div>
          {m.body}
        </div>
      ))}
    </div>
  );
}
