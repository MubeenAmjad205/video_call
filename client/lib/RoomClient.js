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
    this.callbacks = callbacks; // { onRemoteStream, onPeerLeft, onLocalStream, onError }

    this.socket = null;
    this.device = null;
    this.sendTransport = null;
    this.recvTransport = null;

    this.localStream = null;
    this.producers = new Map(); // kind -> producer
    this.consumers = new Map(); // consumerId -> { consumer, stream, peerId, kind }
  }

  async join() {
    this.socket = io(this.serverUrl, { transports: ['websocket'] });

    await new Promise((resolve, reject) => {
      this.socket.once('connect', resolve);
      this.socket.once('connect_error', reject);
    });

    this.socket.on('newProducer', ({ producerId, peerId, kind }) => {
      this._consume(producerId, peerId, kind).catch((err) => {
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

    const { rtpCapabilities, existingProducers } = await emitWithAck(
      this.socket,
      'joinRoom',
      { roomId: this.roomId }
    );

    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: rtpCapabilities });

    await this._createSendTransport();
    await this._createRecvTransport();

    // Publish local media
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    this.callbacks.onLocalStream?.(this.localStream);

    for (const track of this.localStream.getTracks()) {
      const producer = await this.sendTransport.produce({ track });
      this.producers.set(track.kind, producer);
    }

    // Consume anyone already in the room
    for (const p of existingProducers) {
      await this._consume(p.producerId, p.peerId, p.kind);
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
      async ({ kind, rtpParameters }, callback, errback) => {
        try {
          const { id } = await emitWithAck(this.socket, 'produce', {
            transportId: this.sendTransport.id,
            kind,
            rtpParameters,
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

  async _consume(producerId, peerId, kind) {
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
    });

    const stream = new MediaStream([consumer.track]);
    this.consumers.set(consumer.id, { consumer, stream, peerId, kind });

    await emitWithAck(this.socket, 'resumeConsumer', { consumerId: consumer.id });

    this.callbacks.onRemoteStream?.({
      consumerId: consumer.id,
      peerId,
      kind,
      stream,
    });
  }

  toggleAudio() {
    return this._toggleKind('audio');
  }

  toggleVideo() {
    return this._toggleKind('video');
  }

  _toggleKind(kind) {
    const producer = this.producers.get(kind);
    if (!producer) return false;
    if (producer.paused) {
      producer.resume();
      return true; // now enabled
    }
    producer.pause();
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
