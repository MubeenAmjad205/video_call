'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RoomClient } from '@/lib/RoomClient';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id;

  const localVideoRef = useRef(null);
  const clientRef = useRef(null);

  const [status, setStatus] = useState('connecting'); // connecting | live | error
  const [error, setError] = useState('');
  const [remoteStreams, setRemoteStreams] = useState([]); // [{ consumerId, peerId, kind, stream }]
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const client = new RoomClient({
      serverUrl: SERVER_URL,
      roomId,
      callbacks: {
        onLocalStream: (stream) => {
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        },
        onRemoteStream: (entry) => {
          setRemoteStreams((prev) => [...prev, entry]);
        },
        onPeerLeft: ({ consumerId }) => {
          setRemoteStreams((prev) => prev.filter((s) => s.consumerId !== consumerId));
        },
        onError: (err) => {
          if (cancelled) return;
          setError(err.message);
          setStatus('error');
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
  }, [roomId]);

  function toggleAudio() {
    const enabled = clientRef.current?.toggleAudio();
    setAudioOn(!!enabled);
  }

  function toggleVideo() {
    const enabled = clientRef.current?.toggleVideo();
    setVideoOn(!!enabled);
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

  // Group streams per peer (audio + video tracks share a peer)
  const peerTiles = groupByPeer(remoteStreams);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: 16,
        gap: 16,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontWeight: 600 }}>Room</div>
        <code
          style={{
            background: '#16191d',
            padding: '6px 10px',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {roomId}
        </code>
        <button
          onClick={copyLink}
          style={{
            background: '#374151',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          {copied ? 'Copied!' : 'Copy invite link'}
        </button>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#9ca3af' }}>
          {status === 'connecting' && 'Connecting…'}
          {status === 'live' && 'Live'}
          {status === 'error' && <span style={{ color: '#f87171' }}>Error: {error}</span>}
        </div>
      </header>

      <section
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
          alignContent: 'start',
        }}
      >
        <VideoTile label="You" muted videoRef={localVideoRef} />
        {peerTiles.map((tile) => (
          <RemoteTile key={tile.peerId} tile={tile} />
        ))}
      </section>

      <footer
        style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'center',
          paddingBottom: 8,
        }}
      >
        <ControlButton onClick={toggleAudio} active={audioOn}>
          {audioOn ? 'Mute' : 'Unmute'}
        </ControlButton>
        <ControlButton onClick={toggleVideo} active={videoOn}>
          {videoOn ? 'Stop video' : 'Start video'}
        </ControlButton>
        <ControlButton onClick={leave} danger>
          Leave
        </ControlButton>
      </footer>
    </main>
  );
}

function groupByPeer(remoteStreams) {
  const map = new Map();
  for (const s of remoteStreams) {
    if (!map.has(s.peerId)) map.set(s.peerId, { peerId: s.peerId, audio: null, video: null });
    const tile = map.get(s.peerId);
    tile[s.kind] = s.stream;
  }
  return [...map.values()];
}

function VideoTile({ label, videoRef, muted }) {
  return (
    <div
      style={{
        position: 'relative',
        background: '#000',
        borderRadius: 12,
        overflow: 'hidden',
        aspectRatio: '16 / 9',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          background: 'rgba(0,0,0,0.55)',
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: 12,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function RemoteTile({ tile }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && tile.video) videoRef.current.srcObject = tile.video;
  }, [tile.video]);

  useEffect(() => {
    if (audioRef.current && tile.audio) audioRef.current.srcObject = tile.audio;
  }, [tile.audio]);

  return (
    <div
      style={{
        position: 'relative',
        background: '#000',
        borderRadius: 12,
        overflow: 'hidden',
        aspectRatio: '16 / 9',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <audio ref={audioRef} autoPlay />
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          background: 'rgba(0,0,0,0.55)',
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: 12,
        }}
      >
        Peer {tile.peerId.slice(0, 6)}
      </div>
    </div>
  );
}

function ControlButton({ children, onClick, active, danger }) {
  const bg = danger ? '#dc2626' : active ? '#2563eb' : '#374151';
  return (
    <button
      onClick={onClick}
      style={{
        background: bg,
        color: 'white',
        border: 'none',
        padding: '10px 18px',
        borderRadius: 10,
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: 14,
      }}
    >
      {children}
    </button>
  );
}
