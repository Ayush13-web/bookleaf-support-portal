import { useEffect, useRef } from 'react';
import { BASE, tokenStore } from '../api/client.js';

/**
 * Subscribes to the server's Server-Sent Events stream (/events).
 * Uses fetch streaming instead of EventSource so the JWT travels in the Authorization header
 * (not in the URL). Reconnects with backoff. The handler receives { type, ...payload }.
 */
export function useEventStream(onEvent) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    let stopped = false;
    let controller;

    const dispatch = (raw) => {
      let type = 'message';
      let data = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) type = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) return; // heartbeat/comment frame
      try { handler.current({ type, ...JSON.parse(data) }); } catch { /* ignore malformed frame */ }
    };

    async function run() {
      let delay = 1000;
      while (!stopped) {
        controller = new AbortController();
        try {
          const res = await fetch(`${BASE}/events`, {
            headers: { Authorization: `Bearer ${tokenStore.get()}`, Accept: 'text/event-stream' },
            signal: controller.signal,
          });
          if (!res.ok || !res.body) throw new Error('stream rejected');
          delay = 1000;
          handler.current({ type: 'stream.connected' }); // lets pages resync anything missed while offline
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = buffer.indexOf('\n\n')) >= 0) {
              dispatch(buffer.slice(0, idx));
              buffer = buffer.slice(idx + 2);
            }
          }
        } catch { /* fall through to retry */ }
        if (stopped) return;
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 15000);
      }
    }
    run();
    return () => { stopped = true; controller?.abort(); };
  }, []);
}
