'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [error, setError] = useState('');

  async function createMeeting() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${SERVER_URL}/rooms`, { method: 'POST' });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const { roomId } = await res.json();
      router.push(`/room/${roomId}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  function joinMeeting(e) {
    e.preventDefault();
    const id = joinId.trim();
    if (!id) return;
    router.push(`/room/${id}`);
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: '#16191d',
          borderRadius: 16,
          padding: 32,
          boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28 }}>Video Call</h1>
        <p style={{ color: '#9ca3af', marginTop: 8 }}>
          Start a meeting and share the link with anyone.
        </p>

        <button
          onClick={createMeeting}
          disabled={loading}
          style={{
            marginTop: 24,
            width: '100%',
            padding: '14px 16px',
            background: '#2563eb',
            color: 'white',
            fontWeight: 600,
            fontSize: 16,
            border: 'none',
            borderRadius: 10,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Creating…' : 'Create new meeting'}
        </button>

        {error && (
          <p style={{ color: '#f87171', marginTop: 12, fontSize: 14 }}>{error}</p>
        )}

        <div
          style={{
            margin: '24px 0',
            display: 'flex',
            alignItems: 'center',
            color: '#6b7280',
            fontSize: 13,
          }}
        >
          <div style={{ flex: 1, height: 1, background: '#262a30' }} />
          <span style={{ padding: '0 12px' }}>or join an existing one</span>
          <div style={{ flex: 1, height: 1, background: '#262a30' }} />
        </div>

        <form onSubmit={joinMeeting} style={{ display: 'flex', gap: 8 }}>
          <input
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="Meeting code"
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid #262a30',
              background: '#0b0d10',
              color: 'white',
              fontSize: 15,
            }}
          />
          <button
            type="submit"
            style={{
              padding: '0 18px',
              background: '#374151',
              color: 'white',
              fontWeight: 600,
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
            }}
          >
            Join
          </button>
        </form>
      </div>
    </main>
  );
}
