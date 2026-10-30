/**
 * In-memory Server-Sent Events hub.
 * Events are lightweight "something changed" signals ({ ticketId }); clients refetch via REST,
 * so the REST API stays the single source of truth and authorisation is enforced in one place.
 * Scaling out to several instances = swap this for Redis pub/sub (same publish/subscribe API).
 */
const clients = new Set();

export function subscribe(user, res) {
  const client = { userId: user.id, role: user.role, res };
  clients.add(client);
  return () => clients.delete(client);
}

/**
 * @param {string} type  e.g. 'ticket.created' | 'ticket.updated'
 * @param {object} payload  { ticketId }
 * @param {object} audience { authorUserId?: number, adminOnly?: boolean }
 */
export function publish(type, payload, { authorUserId = null, adminOnly = false } = {}) {
  const frame = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients) {
    const isTarget = c.role === 'admin' || (!adminOnly && authorUserId !== null && c.userId === authorUserId);
    if (isTarget) c.res.write(frame);
  }
}

export const connectedClients = () => clients.size;
