'use client';

import { io } from 'socket.io-client';
import { Device } from 'mediasoup-client';

// Small Promise wrapper around socket.io callback-style ack.
function emitWithAck(socket, event, data = {}) {
  return new Promise((resolve, reject) => {
    socket.emit(event, data, (response) => {
      if (response && response.error) reject(new Error(response.error));
      else resolve(response);
    });
  });
}

export class RoomClient {
  constructor({ serverUrl, roomId, callbacks = {} }) {
    this.serverUrl = serverUrl;
    this.roomId = roomId;
    this.callbacks = callbacks; // { onRemoteStream, onPeerLeft, onLocalStream, onError, onChatMessage }

    this.socket = null;
    this.device = null;
    this.sendTransport = null;
    this.recvTransport = null;

    this.localStream = null;
    this.screenStream = null;
    this.isHost = false;
    this.isLocked = false;
    this.producers = new Map(); // label -> producer (e.g., 'webcam-video', 'screen-video')
    this.consumers = new Map(); // consumerId -> { consumer, stream, peerId, kind }
  }

  async join() {
    this.socket = io(this.serverUrl, { transports: ['websocket'], withCredentials: true });

    await new Promise((resolve, reject) => {
      this.socket.once('connect', resolve);
      this.socket.once('connect_error', reject);
    });

    this.socket.on('peerMuteStatus', ({ peerId, kind, paused }) => {
      this.callbacks.onPeerMuteStatus?.({ peerId, kind, paused });
    });

    this.socket.on('newProducer', ({ producerId, peerId, kind, appData, paused }) => {
      this._consume(producerId, peerId, kind, { ...appData, paused }).catch((err) => {
        console.error('consume failed', err);
        this.callbacks.onError?.(err);
      });
    });

    this.socket.on('consumerClosed', ({ consumerId }) => {
      const entry = this.consumers.get(consumerId);
      if (!entry) return;
      entry.consumer.close();
      this.consumers.delete(consumerId);
      this.callbacks.onPeerLeft?.({ consumerId, peerId: entry.peerId });
    });

    this.socket.on('kicked', () => {
      this.callbacks.onError?.(new Error('You were kicked from the room'));
      this.leave();
    });

    this.socket.on('forceMuted', ({ kind }) => {
      const producer = this.producers.get(`webcam-${kind}`);
      if (producer) {
        producer.pause();
        this.callbacks.onForceMuted?.({ kind, paused: true });
      }
    });

    this.socket.on('forceUnmuted', ({ kind }) => {
      const producer = this.producers.get(`webcam-${kind}`);
      if (producer) {
        producer.resume();
        this.callbacks.onForceMuted?.({ kind, paused: false });
      }
    });

    this.socket.on('lobbyPeerWaiting', ({ peerId }) => {
      this.callbacks.onLobbyPeerWaiting?.({ peerId });
    });

    this.socket.on('roomLockChanged', ({ locked }) => {
      this.isLocked = locked;
      this.callbacks.onRoomState?.({ isHost: this.isHost, isLocked: this.isLocked });
    });

    this.socket.on('chatMessage', (message) => {
      this.callbacks.onChatMessage?.(message);
    });

    this.socket.on('peerLeft', ({ peerId }) => {
      // Remove any consumers belonging to that peer
      for (const [id, entry] of this.consumers) {
        if (entry.peerId === peerId) {
          entry.consumer.close();
          this.consumers.delete(id);
          this.callbacks.onPeerLeft?.({ consumerId: id, peerId });
        }
      }
    });

    const hostToken = sessionStorage.getItem(`hostToken_${this.roomId}`);
    let joinData = await emitWithAck(this.socket, 'joinRoom', { roomId: this.roomId, hostToken });

    if (joinData.status === 'waiting') {
      this.callbacks.onLobbyStatus?.('waiting');
      joinData = await new Promise((resolve, reject) => {
        this.socket.once('lobbyAdmitted', async () => {
          try {
            const rejoinData = await emitWithAck(this.socket, 'joinRoom', { roomId: this.roomId, hostToken });
            resolve(rejoinData);
          } catch (e) { reject(e); }
        });
        this.socket.once('lobbyRejected', () => {
          reject(new Error('Host rejected your join request'));
        });
      });
      this.callbacks.onLobbyStatus?.('none');
    }

    const { rtpCapabilities, existingProducers, isHost, isLocked } = joinData;
    this.isHost = isHost;
    this.isLocked = isLocked;
    this.callbacks.onRoomState?.({ isHost, isLocked });

    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: rtpCapabilities });

    await this._createSendTransport();
    await this._createRecvTransport();

    // Publish local media
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Camera and microphone permission denied. Please click the lock icon in your browser address bar to allow access and reload the page.');
      } else if (err.name === 'NotFoundError') {
        throw new Error('No camera or microphone found on your device.');
      } else {
        throw new Error('Failed to access camera/microphone: ' + err.message);
      }
    }
    this.callbacks.onLocalStream?.(this.localStream);

    for (const track of this.localStream.getTracks()) {
      const isVideo = track.kind === 'video';
      
      // Setup Simulcast for webcam video (3 spatial layers: low, medium, high)
      const encodings = isVideo ? [
        { maxBitrate: 100000, scaleResolutionDownBy: 4 }, // low
        { maxBitrate: 300000, scaleResolutionDownBy: 2 }, // medium
        { maxBitrate: 900000, scaleResolutionDownBy: 1 }, // high
      ] : undefined;

      const producer = await this.sendTransport.produce({
        track,
        encodings,
        codecOptions: isVideo ? { videoGoogleStartBitrate: 1000 } : undefined,
        appData: { source: 'webcam' },
      });
      this.producers.set(`webcam-${track.kind}`, producer);
    }

    // Consume anyone already in the room
    for (const p of existingProducers) {
      await this._consume(p.producerId, p.peerId, p.kind, p.appData);
    }
  }

  async _createSendTransport() {
    const params = await emitWithAck(this.socket, 'createWebRtcTransport');
    this.sendTransport = this.device.createSendTransport(params);

    this.sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      emitWithAck(this.socket, 'connectTransport', {
        transportId: this.sendTransport.id,
        dtlsParameters,
      })
        .then(callback)
        .catch(errback);
    });

    this.sendTransport.on(
      'produce',
      async ({ kind, rtpParameters, appData }, callback, errback) => {
        try {
          const { id } = await emitWithAck(this.socket, 'produce', {
            transportId: this.sendTransport.id,
            kind,
            rtpParameters,
            appData,
          });
          callback({ id });
        } catch (err) {
          errback(err);
        }
      }
    );
  }

  async _createRecvTransport() {
    const params = await emitWithAck(this.socket, 'createWebRtcTransport');
    this.recvTransport = this.device.createRecvTransport(params);

    this.recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      emitWithAck(this.socket, 'connectTransport', {
        transportId: this.recvTransport.id,
        dtlsParameters,
      })
        .then(callback)
        .catch(errback);
    });
  }

  async _consume(producerId, peerId, kind, appData) {
    const data = await emitWithAck(this.socket, 'consume', {
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
      transportId: this.recvTransport.id,
    });

    const consumer = await this.recvTransport.consume({
      id: data.id,
      producerId: data.producerId,
      kind: data.kind,
      rtpParameters: data.rtpParameters,
      appData,
    });

    const stream = new MediaStream([consumer.track]);
    const source = appData?.source || 'webcam';
    this.consumers.set(consumer.id, { consumer, stream, peerId, kind, source });

    await emitWithAck(this.socket, 'resumeConsumer', { consumerId: consumer.id });

    this.callbacks.onRemoteStream?.({
      consumerId: consumer.id,
      peerId,
      kind,
      source,
      stream,
      paused: appData?.paused || false,
    });
  }

  toggleAudio() {
    return this._toggleKind('audio');
  }

  toggleVideo() {
    return this._toggleKind('video');
  }

  async kickPeer(targetPeerId) {
    if (!this.isHost) return;
    await emitWithAck(this.socket, 'kickPeer', { targetPeerId });
  }

  async toggleMutePeer(targetPeerId, kind = 'audio') {
    if (!this.isHost) return;
    await emitWithAck(this.socket, 'toggleMutePeer', { targetPeerId, kind });
  }

  async toggleLock(locked) {
    if (!this.isHost) return;
    await emitWithAck(this.socket, 'toggleLock', { locked });
  }

  async admitPeer(targetPeerId, admit) {
    if (!this.isHost) return;
    await emitWithAck(this.socket, 'admitPeer', { targetPeerId, admit });
  }

  async sendChatMessage(text) {
    if (!this.socket) return;
    await emitWithAck(this.socket, 'chatMessage', { text });
  }

  async startScreenShare() {
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      this.callbacks.onLocalScreenStream?.(this.screenStream);

      for (const track of this.screenStream.getTracks()) {
        const encodings = track.kind === 'video'
          ? [{ maxBitrate: 3000000 }]
          : undefined;

        const producer = await this.sendTransport.produce({
          track,
          encodings,
          appData: { source: 'screen' },
        });

        this.producers.set(`screen-${track.kind}`, producer);

        track.onended = () => {
          this.stopScreenShare();
        };
      }
    } catch (err) {
      console.error('Failed to start screen share', err);
    }
  }

  stopScreenShare() {
    if (!this.screenStream) return;

    for (const track of this.screenStream.getTracks()) {
      track.stop();
      const producer = this.producers.get(`screen-${track.kind}`);
      if (producer) {
        producer.close();
        this.producers.delete(`screen-${track.kind}`);
        emitWithAck(this.socket, 'closeProducer', { producerId: producer.id }).catch(console.error);
      }
    }
    this.screenStream = null;
    this.callbacks.onLocalScreenStream?.(null);
  }

  async _toggleKind(kind) {
    const producer = this.producers.get(`webcam-${kind}`);
    if (!producer) return false;
    if (producer.paused) {
      producer.resume();
      await emitWithAck(this.socket, 'resumeProducer', { producerId: producer.id }).catch(()=>{});
      return true; // now enabled
    }
    producer.pause();
    await emitWithAck(this.socket, 'pauseProducer', { producerId: producer.id }).catch(()=>{});
    return false; // now disabled
  }

  leave() {
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) track.stop();
    }
    for (const { consumer } of this.consumers.values()) consumer.close();
    this.consumers.clear();
    for (const producer of this.producers.values()) producer.close();
    this.producers.clear();
    this.sendTransport?.close();
    this.recvTransport?.close();
    this.socket?.disconnect();
  }
}
