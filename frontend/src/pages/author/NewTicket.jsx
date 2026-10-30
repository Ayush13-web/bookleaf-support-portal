import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { ErrorBanner, Spinner } from '../../components/ui.jsx';

export default function NewTicket() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: books, loading } = useAsync(api.books);
  const [form, setForm] = useState({ bookId: params.get('book') || '', subject: '', description: '' });
  const [files, setFiles] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const errs = {};
    if (form.subject.trim().length < 5) errs.subject = 'Please add a short subject (at least 5 characters).';
    if (form.description.trim().length < 20) errs.description = 'Please describe the issue in at least 20 characters so we can help faster.';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const ticket = await api.createTicket({
        bookId: form.bookId || null,
        subject: form.subject,
        description: form.description,
        attachments: files.map((f) => ({ name: f.name, size: f.size })), // metadata only; upload is not implemented
      });
      navigate(`/author/tickets?ticket=${ticket.id}&created=1`);
    } catch (err) {
      if (err.details) setFieldErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
      setError(err);
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-head"><div><h1>Submit a support query</h1><p>Tell us what's going on and our team will get back to you.</p></div></div>
      <form className="card" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="book">Which book is this about?</label>
          <select id="book" value={form.bookId} onChange={set('bookId')}>
            <option value="">General / Account level</option>
            {books?.map((b) => <option key={b.bookId} value={b.bookId}>{b.title}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="subject">Subject</label>
          <input id="subject" value={form.subject} onChange={set('subject')} maxLength={200} placeholder="e.g. My royalty payment hasn't arrived" />
          {fieldErrors.subject && <div className="err">{fieldErrors.subject}</div>}
        </div>
        <div className="field">
          <label htmlFor="description">Describe the issue</label>
          <textarea id="description" rows={7} value={form.description} onChange={set('description')} maxLength={5000}
            placeholder="Include dates, amounts, platforms or anything else that helps us look into it." />
          {fieldErrors.description && <div className="err">{fieldErrors.description}</div>}
        </div>
        <div className="field">
          <label htmlFor="files">Attachments (optional)</label>
          <input id="files" type="file" multiple onChange={(e) => setFiles([...e.target.files].slice(0, 5))} />
          <div className="hint">Photos of misprints help us arrange a reprint. File names are attached to your ticket; uploads are not stored yet, so we'll reply asking for the files if we need them.</div>
        </div>
        <ErrorBanner error={error} />
        <div className="row" style={{ marginTop: '1rem' }}>
          <button type="submit" disabled={busy}>{busy ? 'Submitting...' : 'Submit query'}</button>
          <button type="button" className="ghost" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
