import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const DEMO = [
  { label: 'Author: Priya Sharma', email: 'priya.sharma@email.com', password: 'Author@123' },
  { label: 'Author: Ananya Reddy (no payouts yet)', email: 'ananya.reddy@email.com', password: 'Author@123' },
  { label: 'Author: Sneha (3 books, 1 in production)', email: 'sneha.kulkarni@email.com', password: 'Author@123' },
  { label: 'Admin', email: 'admin@bookleaf.com', password: 'Admin@123' },
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/author/books'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(form.email, form.password);
      navigate(u.role === 'admin' ? '/admin' : '/author/books', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>BookLeaf Support</h1>
        <p className="muted">Sign in to check your royalties, track your books and get help from our team.</p>
        <form onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
          {error && <div className="banner error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}
          <button type="submit" disabled={busy || !form.email || !form.password} style={{ width: '100%' }}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <div className="demo-creds">
          Demo accounts (click to fill):<br />
          {DEMO.map((d) => (
            <button key={d.email} type="button" className="ghost" onClick={() => setForm({ email: d.email, password: d.password })}>{d.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
