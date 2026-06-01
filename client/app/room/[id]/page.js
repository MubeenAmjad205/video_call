'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RoomClient } from '@/lib/RoomClient';
import { authClient } from '@/lib/auth-client';
import { 
  Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, 
  MessageSquare, Lock, Unlock, Copy, Check, Users, Send
} from 'lucide-react';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id;

  const localVideoRef = useRef(null);
  const clientRef = useRef(null);
  const localScreenRef = useRef(null);

  const [status, setStatus] = useState('connecting'); // connecting | live | error
  const [error, setError] = useState('');
  const [remoteStreams, setRemoteStreams] = useState([]); // [{ consumerId, peerId, kind, stream, paused }]
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [copied, setCopied] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lobbyStatus, setLobbyStatus] = useState('none');
  const [waitingPeers, setWaitingPeers] = useState([]);
  
  // New UI states
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const { data: session, isPending: authPending } = authClient.useSession();

  useEffect(() => {
    if (localScreenRef.current && localScreenStream) {
      localScreenRef.current.srcObject = localScreenStream;
    }
  }, [localScreenStream, isScreenSharing]);

  useEffect(() => {
    if (isChatOpen) setUnreadCount(0);
  }, [isChatOpen]);

  useEffect(() => {
    let cancelled = false;

    if (authPending) return;
    if (!session) {
      router.push('/');
      return;
    }

    const client = new RoomClient({
      serverUrl: SERVER_URL,
      roomId,
      callbacks: {
        onLocalStream: (stream) => {
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        },
        onLocalScreenStream: (stream) => {
          if (!stream) {
            setIsScreenSharing(false);
            setLocalScreenStream(null);
          } else {
            setIsScreenSharing(true);
            setLocalScreenStream(stream);
          }
        },
        onRemoteStream: (entry) => {
          setRemoteStreams((prev) => [...prev, entry]);
        },
        onPeerLeft: ({ consumerId }) => {
          setRemoteStreams((prev) => prev.filter((s) => s.consumerId !== consumerId));
        },
        onRoomState: ({ isHost, isLocked }) => {
          setIsHost(isHost);
          setIsLocked(isLocked);
        },
        onLobbyStatus: (status) => {
          setLobbyStatus(status);
        },
        onLobbyPeerWaiting: ({ peerId }) => {
          setWaitingPeers((prev) => [...prev, peerId]);
        },
        onForceMuted: ({ kind, paused }) => {
          if (kind === 'audio') setAudioOn(!paused);
          if (kind === 'video') setVideoOn(!paused);
        },
        onPeerMuteStatus: ({ peerId, kind, paused }) => {
          setRemoteStreams(prev => prev.map(s => 
            s.peerId === peerId && s.kind === kind ? { ...s, paused } : s
          ));
        },
        onError: (err) => {
          if (cancelled) return;
          setError(err.message);
          setStatus('error');
        },
        onChatMessage: (message) => {
          setMessages((prev) => [...prev, message]);
          setIsChatOpen(open => {
            if (!open) setUnreadCount(c => c + 1);
            return open;
          });
        },
      },
    });
    clientRef.current = client;

    client
      .join()
      .then(() => {
        if (cancelled) return;
        setStatus('live');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setStatus('error');
      });

    return () => {
      cancelled = true;
      client.leave();
      clientRef.current = null;
    };
  }, [roomId, session, authPending, router]);

  async function toggleAudio() {
    const enabled = await clientRef.current?.toggleAudio();
    setAudioOn(!!enabled);
  }

  async function toggleVideo() {
    const enabled = await clientRef.current?.toggleVideo();
    setVideoOn(!!enabled);
  }

  async function toggleScreenShare() {
    if (isScreenSharing) {
      clientRef.current?.stopScreenShare();
    } else {
      await clientRef.current?.startScreenShare();
    }
  }

  async function toggleLock() {
    clientRef.current?.toggleLock(!isLocked);
  }

  async function admit(peerId, accept) {
    await clientRef.current?.admitPeer(peerId, accept);
    setWaitingPeers((prev) => prev.filter(id => id !== peerId));
  }

  async function kick(peerId) {
    await clientRef.current?.kickPeer(peerId);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  function leave() {
    clientRef.current?.leave();
    router.push('/');
  }

  async function sendChat(e) {
    e.preventDefault();
    if (!chatText.trim()) return;
    try {
      await clientRef.current?.sendChatMessage(chatText);
      setMessages((prev) => [
        ...prev,
        { peerId: 'You', text: chatText, timestamp: Date.now() },
      ]);
      setChatText('');
    } catch (err) {
      console.error('Failed to send chat:', err);
    }
  }

  const peerTiles = groupByPeer(remoteStreams);

  if (authPending || status === 'connecting') {
    return (
      <div style={{ height: '100vh', background: '#0f1115', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'sans-serif' }}>
         <div style={{ width: 48, height: 48, border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 24 }} />
         <h2 style={{ fontSize: 24, margin: '0 0 8px 0' }}>Joining room...</h2>
         <p style={{ color: '#9ca3af', margin: 0 }}>Setting up secure connection and media devices.</p>
         <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={{ height: '100vh', background: '#0f1115', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'sans-serif' }}>
         <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: 32, borderRadius: 16, maxWidth: 480, textAlign: 'center', backdropFilter: 'blur(8px)' }}>
            <div style={{ width: 64, height: 64, background: '#ef4444', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto' }}>
               <PhoneOff size={32} color="white" />
            </div>
            <h2 style={{ fontSize: 24, margin: '0 0 16px 0', color: '#fca5a5' }}>Unable to join room</h2>
            <p style={{ color: '#e5e7eb', lineHeight: 1.5, marginBottom: 24 }}>{error}</p>
            <button onClick={() => window.location.reload()} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '12px 24px', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
               Try Again
            </button>
         </div>
      </div>
    );
  }

  if (!session) return null;

  if (lobbyStatus === 'waiting') {
    return (
      <div style={{ height: '100vh', background: '#0f1115', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
           <h2 style={{ fontSize: 24, marginBottom: 8 }}>Waiting to join</h2>
           <p style={{ color: '#9ca3af' }}>You will join the call when the host admits you.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', width: '100vw', backgroundColor: '#0f1115', color: 'white', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden' }}>
       {/* Header */}
       <header style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10, background: 'linear-gradient(to bottom, rgba(15,17,21,1) 0%, rgba(15,17,21,0) 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
             <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>Meeting Platform</h1>
             <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: 8, fontSize: 14, display: 'flex', gap: 12, alignItems: 'center', backdropFilter: 'blur(8px)' }}>
                {roomId}
                <button onClick={copyLink} style={{ background: 'transparent', border: 'none', color: copied ? '#10b981' : '#9ca3af', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                   {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
             </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
             {isHost && (
               <button onClick={toggleLock} style={{ display: 'flex', alignItems: 'center', gap: 8, background: isLocked ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: isLocked ? '#ef4444' : '#10b981', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                  {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                  {isLocked ? 'Locked' : 'Unlocked'}
               </button>
             )}
             <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9ca3af', fontSize: 14, background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: 8 }}>
               <Users size={16} /> <span style={{ fontWeight: 500 }}>{peerTiles.length + 1}</span>
             </div>
          </div>
       </header>

       {/* Middle Content */}
       <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
          
          {/* Video Grid Area */}
          <div style={{ flex: 1, padding: '0 24px', display: 'flex', flexDirection: 'column', transition: 'margin-right 0.3s cubic-bezier(0.4, 0, 0.2, 1)', marginRight: isChatOpen ? 340 : 0 }}>
             
             {isHost && waitingPeers.length > 0 && (
                <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', padding: '12px 20px', borderRadius: 12, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backdropFilter: 'blur(8px)' }}>
                   <div>
                     <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#60a5fa' }}>{waitingPeers.length} person waiting</h3>
                   </div>
                   <div style={{ display: 'flex', gap: 8 }}>
                     <button onClick={() => admit(waitingPeers[0], true)} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Admit</button>
                     <button onClick={() => admit(waitingPeers[0], false)} style={{ background: 'transparent', color: '#9ca3af', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>Deny</button>
                   </div>
                </div>
             )}

             <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 16, alignContent: 'center', justifyContent: 'center', overflow: 'hidden', paddingBottom: 16 }}>
               <VideoTile label={`${session?.user?.name || 'You'} (You)`} muted videoRef={localVideoRef} audioPaused={!audioOn} videoPaused={!videoOn} />
               {isScreenSharing && (
                 <VideoTile label="Your Screen" muted videoRef={localScreenRef} isScreen />
               )}
               {peerTiles.map((tile) => (
                 <RemoteTile 
                   key={tile.id} 
                   tile={tile} 
                   isHost={isHost}
                   onKick={() => kick(tile.peerId)}
                   onToggleMute={() => clientRef.current?.toggleMutePeer(tile.peerId, 'audio')}
                 />
               ))}
             </div>
          </div>

          {/* Chat Sidebar */}
          <div style={{ 
              position: 'absolute', right: 16, top: 0, bottom: 16, width: 320, background: '#1c1f26', 
              borderRadius: 16, display: 'flex', flexDirection: 'column', 
              transform: isChatOpen ? 'translateX(0)' : 'translateX(120%)', transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)'
            }}>
             <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <MessageSquare size={20} color="#60a5fa" />
                <span style={{ fontSize: 16, fontWeight: 600 }}>In-call messages</span>
             </div>
             
             <div style={{ flex: 1, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {messages.length === 0 && (
                  <div style={{ margin: 'auto', color: '#6b7280', fontSize: 14, textAlign: 'center' }}>
                    Messages can only be seen by people in the call and are deleted when the call ends.
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.peerId === 'You' ? 'flex-end' : 'flex-start' }}>
                    <span style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4, fontWeight: 500 }}>
                      {m.peerId === 'You' ? 'You' : `Peer ${m.peerId.slice(0, 6)}`}
                    </span>
                    <div style={{ 
                      background: m.peerId === 'You' ? '#3b82f6' : '#374151', 
                      padding: '10px 14px', borderRadius: 16, borderTopRightRadius: m.peerId === 'You' ? 4 : 16, borderTopLeftRadius: m.peerId === 'You' ? 16 : 4,
                      fontSize: 14, maxWidth: '85%', wordBreak: 'break-word', lineHeight: 1.4
                    }}>
                      {m.text}
                    </div>
                  </div>
                ))}
             </div>

             <form onSubmit={sendChat} style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 8 }}>
                <input 
                  value={chatText} onChange={e => setChatText(e.target.value)} 
                  placeholder="Send a message..." 
                  style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px 16px', borderRadius: 24, color: 'white', outline: 'none', fontSize: 14 }}
                />
                <button type="submit" disabled={!chatText.trim()} style={{ background: chatText.trim() ? '#3b82f6' : 'rgba(255,255,255,0.1)', color: chatText.trim() ? 'white' : '#9ca3af', border: 'none', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: chatText.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>
                   <Send size={18} style={{ marginLeft: chatText.trim() ? -2 : 0 }} />
                </button>
             </form>
          </div>
       </div>

       {/* Footer Controls */}
       <footer style={{ padding: '24px', display: 'flex', justifyContent: 'center', gap: 16, zIndex: 10, background: 'linear-gradient(to top, rgba(15,17,21,1) 0%, rgba(15,17,21,0) 100%)' }}>
          <ControlButton onClick={toggleAudio} active={audioOn} icon={audioOn ? <Mic size={22} /> : <MicOff size={22} />} danger={!audioOn} />
          <ControlButton onClick={toggleVideo} active={videoOn} icon={videoOn ? <Video size={22} /> : <VideoOff size={22} />} danger={!videoOn} />
          <ControlButton onClick={toggleScreenShare} active={isScreenSharing} icon={<MonitorUp size={22} />} color={isScreenSharing ? '#8b5cf6' : '#374151'} />
          
          <div style={{ position: 'relative' }}>
             <ControlButton onClick={() => setIsChatOpen(!isChatOpen)} active={isChatOpen} icon={<MessageSquare size={22} />} color={isChatOpen ? '#3b82f6' : '#374151'} />
             {!isChatOpen && unreadCount > 0 && (
               <div style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: 'white', fontSize: 11, fontWeight: 'bold', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0f1115' }}>
                 {unreadCount}
               </div>
             )}
          </div>

          <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} />
          <ControlButton onClick={leave} danger icon={<PhoneOff size={22} />} label="Leave" />
       </footer>
    </div>
  );
}

function groupByPeer(remoteStreams) {
  const map = new Map();
  for (const s of remoteStreams) {
    const source = s.source || 'webcam';
    const tileId = `${s.peerId}-${source}`;
    if (!map.has(tileId)) {
      map.set(tileId, { id: tileId, peerId: s.peerId, source, audio: null, video: null, audioPaused: false, videoPaused: false });
    }
    const tile = map.get(tileId);
    tile[s.kind] = s.stream;
    tile[`${s.kind}Paused`] = s.paused;
  }
  return [...map.values()];
}

function VideoTile({ label, videoRef, muted, audioPaused, videoPaused, isScreen }) {
  return (
    <div style={{ position: 'relative', background: '#1c1f26', borderRadius: 16, overflow: 'hidden', aspectRatio: '16/9', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', flex: '1 1 320px', maxWidth: '100%', maxHeight: '100%' }}>
      <video
        ref={videoRef} autoPlay playsInline muted={muted}
        style={{ width: '100%', height: '100%', objectFit: isScreen ? 'contain' : 'cover', opacity: videoPaused ? 0 : 1, transition: 'opacity 0.3s', transform: isScreen ? 'none' : 'scaleX(-1)' }}
      />
      
      {videoPaused && !isScreen && (
         <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
               <VideoOff size={32} color="#9ca3af" />
            </div>
         </div>
      )}

      <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', gap: 8, alignItems: 'center', zIndex: 10 }}>
        <div style={{ background: 'rgba(0,0,0,0.5)', padding: '8px 14px', borderRadius: 8, fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
          {audioPaused ? <MicOff size={16} color="#ef4444" /> : <Mic size={16} color="#10b981" />}
          {label}
        </div>
      </div>
    </div>
  );
}

function RemoteTile({ tile, isHost, onKick, onToggleMute }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && tile.video) videoRef.current.srcObject = tile.video;
  }, [tile.video]);

  useEffect(() => {
    if (audioRef.current && tile.audio) audioRef.current.srcObject = tile.audio;
  }, [tile.audio]);

  const isScreen = tile.source === 'screen';

  return (
    <div style={{ position: 'relative', background: '#1c1f26', borderRadius: 16, overflow: 'hidden', aspectRatio: '16/9', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', flex: '1 1 320px', maxWidth: '100%', maxHeight: '100%' }}>
      <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: isScreen ? 'contain' : 'cover', opacity: tile.videoPaused ? 0 : 1, transition: 'opacity 0.3s' }} />
      <audio ref={audioRef} autoPlay />
      
      {tile.videoPaused && !isScreen && (
         <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
               <VideoOff size={32} color="#9ca3af" />
            </div>
         </div>
      )}

      <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', gap: 8, alignItems: 'center', zIndex: 10 }}>
        <div style={{ background: 'rgba(0,0,0,0.5)', padding: '8px 14px', borderRadius: 8, fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
          {tile.audioPaused && !isScreen ? <MicOff size={16} color="#ef4444" /> : !isScreen ? <Mic size={16} color="#10b981" /> : <MonitorUp size={16} color="#8b5cf6" />}
          Peer {tile.peerId.slice(0, 6)} {isScreen ? '(Screen)' : ''}
        </div>
        
        {isHost && !isScreen && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onToggleMute} style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer', backdropFilter: 'blur(8px)', fontWeight: 500, transition: 'all 0.2s' }}>
              {tile.audioPaused ? 'Unmute' : 'Mute'}
            </button>
            <button onClick={onKick} style={{ background: '#ef4444', border: '1px solid #ef4444', color: 'white', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 500, transition: 'all 0.2s' }}>
              Kick
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ControlButton({ onClick, active, icon, danger, color, label }) {
  const bg = danger ? '#ef4444' : color ? color : '#374151';
  return (
    <button
      onClick={onClick}
      style={{
        background: bg,
        color: 'white',
        border: 'none',
        width: label ? 'auto' : 56,
        height: 56,
        padding: label ? '0 24px' : 0,
        borderRadius: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
      }}
      onMouseOver={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.filter = 'brightness(1.1)'; }}
      onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.filter = 'brightness(1)'; }}
    >
      {icon}
      {label && <span style={{ fontWeight: 600, fontSize: 16 }}>{label}</span>}
    </button>
  );
}
