import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const links = user.role === 'admin'
    ? [{ to: '/admin', label: 'Ticket queue', end: true }]
    : [
        { to: '/author/books', label: 'My books' },
        { to: '/author/tickets/new', label: 'Submit a query' },
        { to: '/author/tickets', label: 'My tickets', end: true },
      ];
  return (
    <>
      <header className="topbar">
        <span className="brand">BookLeaf Support</span>
        <nav aria-label="Main">
          {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>)}
        </nav>
        <div className="who">
          <span>{user.name}{user.role === 'admin' && ' (admin)'}</span>
          <button className="link" onClick={logout}>Sign out</button>
        </div>
      </header>
      <main className="page"><Outlet /></main>
    </>
  );
}
