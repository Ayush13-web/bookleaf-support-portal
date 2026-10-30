import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { Empty, ErrorBanner, Spinner, fmtDate, inr } from '../../components/ui.jsx';

const MIN_PAYOUT = 1000;

export default function MyBooks() {
  const { data: books, error, loading, reload } = useAsync(api.books);

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner error={error} onRetry={reload} />;
  if (!books.length) return <Empty title="No books on your account yet">Once your manuscript is received it will appear here.</Empty>;

  const published = books.filter((b) => !b.inProduction);
  const totals = published.reduce((t, b) => ({
    earned: t.earned + b.totalRoyaltyEarned, paid: t.paid + b.royaltyPaid, pending: t.pending + b.royaltyPending,
  }), { earned: 0, paid: 0, pending: 0 });

  return (
    <>
      <div className="page-head">
        <div><h1>My books</h1><p>{books.length} {books.length === 1 ? 'book' : 'books'} on your account</p></div>
        <Link to="/author/tickets/new"><button>Ask about a book</button></Link>
      </div>

      <div className="stats">
        <div className="stat"><b>{inr(totals.earned)}</b><span>Total royalty earned</span></div>
        <div className="stat"><b>{inr(totals.paid)}</b><span>Paid to you</span></div>
        <div className="stat"><b>{inr(totals.pending)}</b><span>Pending payout</span></div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th><th>ISBN</th><th>Genre</th><th>Published</th><th>Status</th>
              <th className="num">MRP</th><th className="num">Copies sold</th>
              <th className="num">Earned</th><th className="num">Paid</th><th className="num">Pending</th><th />
            </tr>
          </thead>
          <tbody>
            {books.map((b) => (
              <tr key={b.bookId}>
                <td><b>{b.title}</b></td>
                <td className="small">{b.isbn}</td>
                <td>{b.genre}</td>
                <td>{b.inProduction ? '-' : fmtDate(b.publicationDate)}</td>
                <td>
                  <span className={`badge ${b.inProduction ? 's-In-Progress' : 's-Resolved'}`}>{b.status}</span>
                  {b.inProduction && <div className="small muted">No sales or royalties until it is published.</div>}
                </td>
                {b.inProduction ? (
                  <td className="muted" colSpan={4}>Not yet on sale</td>
                ) : (
                  <>
                    <td className="num">{inr(b.mrp)}</td>
                    <td className="num">{b.totalCopiesSold}</td>
                    <td className="num">{inr(b.totalRoyaltyEarned)}</td>
                    <td className="num">{inr(b.royaltyPaid)}</td>
                  </>
                )}
                {!b.inProduction && (
                  <td className="num">
                    {inr(b.royaltyPending)}
                    {b.royaltyPending > 0 && b.royaltyPending < MIN_PAYOUT && <div className="small muted">Under ₹1,000 minimum; rolls over</div>}
                    {b.royaltyPaid === 0 && b.royaltyPending >= MIN_PAYOUT && <div className="small muted">First payout due</div>}
                  </td>
                )}
                <td><Link to={`/author/tickets/new?book=${b.bookId}`}>Raise a query</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
