import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import MyBooks from './pages/author/MyBooks.jsx';
import NewTicket from './pages/author/NewTicket.jsx';
import MyTickets from './pages/author/MyTickets.jsx';
import TicketQueue from './pages/admin/TicketQueue.jsx';
import TicketDetail from './pages/admin/TicketDetail.jsx';

function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/author/books'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/author/books" element={<ProtectedRoute role="author"><MyBooks /></ProtectedRoute>} />
        <Route path="/author/tickets/new" element={<ProtectedRoute role="author"><NewTicket /></ProtectedRoute>} />
        <Route path="/author/tickets" element={<ProtectedRoute role="author"><MyTickets /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute role="admin"><TicketQueue /></ProtectedRoute>} />
        <Route path="/admin/tickets/:id" element={<ProtectedRoute role="admin"><TicketDetail /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
