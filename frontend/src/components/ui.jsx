export const Spinner = ({ label = 'Loading...' }) => <p className="muted"><span className="spinner" />{label}</p>;

export const ErrorBanner = ({ error, onRetry }) => error && (
  <div className="banner error" role="alert">
    {error.message}{' '}
    {onRetry && <button className="ghost small" onClick={onRetry}>Retry</button>}
  </div>
);

export const Empty = ({ title, children }) => (
  <div className="card empty"><h3>{title}</h3>{children}</div>
);

export const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
export const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '-';
export const inr = (n) => (n == null ? '-' : `₹${Number(n).toLocaleString('en-IN')}`);

/** "3d 4h" style age for queue rows. */
export function ageOf(iso) {
  const h = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000));
  return { hours: h, label: h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h` };
}
