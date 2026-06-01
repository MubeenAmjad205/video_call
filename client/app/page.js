'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { uniqueNamesGenerator, adjectives, animals } from 'unique-names-generator';
import { Video, Keyboard, LogOut, User, Mail, Lock, UserPlus, LogIn, Sparkles } from 'lucide-react';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

export default function HomePage() {
  const router = useRouter();
  const { data: session, isPending: authPending } = authClient.useSession();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [error, setError] = useState('');

  async function createMeeting() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${SERVER_URL}/rooms`, { method: 'POST' });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const { roomId, hostToken } = await res.json();
      if (hostToken) sessionStorage.setItem(`hostToken_${roomId}`, hostToken);
      router.push(`/room/${roomId}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  function joinMeeting(e) {
    e.preventDefault();
    let id = joinId.trim();
    if (!id) return;

    try {
      const url = new URL(id);
      const parts = url.pathname.split('/').filter(Boolean);
      id = parts[parts.length - 1];
    } catch {
      if (id.includes('/')) {
        const parts = id.split('/').filter(Boolean);
        id = parts[parts.length - 1];
      }
    }

    if (!id) return;
    router.push(`/room/${id}`);
  }

  async function handleAuth(e) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      if (isSignUp) {
        const { error } = await authClient.signUp.email({ email, password, name });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await authClient.signIn.email({ email, password });
        if (error) throw new Error(error.message);
      }
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleGuestAuth() {
    setAuthLoading(true);
    setAuthError('');
    try {
      const randomName = uniqueNamesGenerator({
        dictionaries: [adjectives, animals],
        separator: ' ',
        style: 'capital'
      });
      const { error } = await authClient.signIn.anonymous({ name: randomName });
      if (error) throw new Error(error.message);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    await authClient.signOut();
  }

  if (authPending) {
    return (
      <div style={{ height: '100vh', background: '#0f1115', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'sans-serif' }}>
         <div style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
         <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!session) {
    return (
      <main style={{ minHeight: '100vh', background: '#0f1115', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: 420, background: '#1c1f26', borderRadius: 24, padding: 40, boxShadow: '0 24px 48px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <div style={{ width: 56, height: 56, background: 'rgba(59,130,246,0.1)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <Video size={28} color="#3b82f6" />
            </div>
          </div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: 26, fontWeight: 700, textAlign: 'center', color: 'white', letterSpacing: '-0.02em' }}>
            {isSignUp ? 'Create an account' : 'Welcome back'}
          </h1>
          <p style={{ margin: '0 0 32px 0', textAlign: 'center', color: '#9ca3af', fontSize: 15 }}>
            {isSignUp ? 'Sign up to start hosting secure video meetings.' : 'Sign in to access your secure video meetings.'}
          </p>
          
          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {isSignUp && (
              <div style={{ position: 'relative' }}>
                <User size={18} color="#6b7280" style={{ position: 'absolute', left: 16, top: 16 }} />
                <input
                  value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" required
                  style={{ width: '100%', padding: '16px 16px 16px 46px', borderRadius: 12, border: '1px solid #2a2f3a', background: '#0b0d10', color: 'white', fontSize: 15, outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                  onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#2a2f3a'}
                />
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <Mail size={18} color="#6b7280" style={{ position: 'absolute', left: 16, top: 16 }} />
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" required
                style={{ width: '100%', padding: '16px 16px 16px 46px', borderRadius: 12, border: '1px solid #2a2f3a', background: '#0b0d10', color: 'white', fontSize: 15, outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#2a2f3a'}
              />
            </div>
            <div style={{ position: 'relative' }}>
              <Lock size={18} color="#6b7280" style={{ position: 'absolute', left: 16, top: 16 }} />
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required
                style={{ width: '100%', padding: '16px 16px 16px 46px', borderRadius: 12, border: '1px solid #2a2f3a', background: '#0b0d10', color: 'white', fontSize: 15, outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#2a2f3a'}
              />
            </div>
            
            {authError && <div style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', padding: '10px 14px', borderRadius: 8, fontSize: 13, border: '1px solid rgba(239,68,68,0.2)' }}>{authError}</div>}
            
            <button
              type="submit" disabled={authLoading}
              style={{ padding: '14px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 12, fontWeight: 600, fontSize: 15, cursor: authLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.2s', marginTop: 8 }}
              onMouseOver={e => e.currentTarget.style.background = '#2563eb'}
              onMouseOut={e => e.currentTarget.style.background = '#3b82f6'}
            >
              {authLoading ? 'Please wait...' : (isSignUp ? <><UserPlus size={18}/> Sign Up</> : <><LogIn size={18}/> Sign In</>)}
            </button>
            
            <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0' }}>
              <div style={{ flex: 1, height: 1, background: '#2a2f3a' }} />
              <span style={{ padding: '0 12px', color: '#6b7280', fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>OR</span>
              <div style={{ flex: 1, height: 1, background: '#2a2f3a' }} />
            </div>

            <button
              type="button" onClick={handleGuestAuth} disabled={authLoading}
              style={{ padding: '14px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontWeight: 600, fontSize: 15, cursor: authLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s' }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
              <Sparkles size={18} color="#a855f7" /> Continue as Guest
            </button>
          </form>

          <div style={{ marginTop: 24, fontSize: 14, textAlign: 'center', color: '#9ca3af' }}>
            {isSignUp ? 'Already have an account? ' : 'Don\'t have an account? '}
            <button onClick={() => { setIsSignUp(!isSignUp); setAuthError(''); }} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: 0, fontWeight: 600, fontSize: 14 }}>
              {isSignUp ? 'Sign In' : 'Create one'}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0f1115', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 520, background: '#1c1f26', borderRadius: 24, padding: 48, boxShadow: '0 24px 48px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, background: 'rgba(59,130,246,0.1)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <Video size={24} color="#3b82f6" />
            </div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'white', letterSpacing: '-0.02em' }}>Platform</h1>
          </div>
          <button onClick={handleSignOut} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af', padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.2s' }} onMouseOver={e => { e.currentTarget.style.color = 'white'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }} onMouseOut={e => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}>
            <LogOut size={14} /> Sign Out
          </button>
        </div>
        
        <h2 style={{ fontSize: 32, margin: '0 0 12px 0', color: 'white', fontWeight: 700, letterSpacing: '-0.03em' }}>
          Welcome, {session.user.name.split(' ')[0]}
        </h2>
        <p style={{ color: '#9ca3af', margin: 0, fontSize: 16, lineHeight: 1.5 }}>
          Create a new highly-secure meeting room, or join an existing one to connect with your team.
        </p>

        <div style={{ marginTop: 40 }}>
          <button
            onClick={createMeeting} disabled={loading}
            style={{ width: '100%', padding: '16px', background: '#3b82f6', color: 'white', fontWeight: 600, fontSize: 16, border: 'none', borderRadius: 14, cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'background 0.2s, transform 0.1s' }}
            onMouseOver={e => e.currentTarget.style.background = '#2563eb'}
            onMouseOut={e => e.currentTarget.style.background = '#3b82f6'}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <Video size={20} /> {loading ? 'Provisioning room...' : 'New Meeting'}
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', padding: '12px 16px', borderRadius: 10, fontSize: 14, border: '1px solid rgba(239,68,68,0.2)', marginTop: 16 }}>
            {error}
          </div>
        )}

        <div style={{ margin: '32px 0', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
          <span style={{ padding: '0 16px', color: '#6b7280', fontSize: 13, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Or join a room</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
        </div>

        <form onSubmit={joinMeeting} style={{ display: 'flex', gap: 12 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Keyboard size={20} color="#6b7280" style={{ position: 'absolute', left: 16, top: 16 }} />
            <input
              value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="Enter meeting code or link"
              style={{ width: '100%', padding: '16px 16px 16px 48px', borderRadius: 14, border: '1px solid #2a2f3a', background: '#0b0d10', color: 'white', fontSize: 15, outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#2a2f3a'}
            />
          </div>
          <button
            type="submit" disabled={!joinId.trim()}
            style={{ padding: '0 24px', background: joinId.trim() ? '#ffffff' : 'rgba(255,255,255,0.1)', color: joinId.trim() ? '#0f1115' : '#6b7280', fontWeight: 600, fontSize: 15, border: 'none', borderRadius: 14, cursor: joinId.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}
          >
            Join
          </button>
        </form>
      </div>
    </main>
  );
}
