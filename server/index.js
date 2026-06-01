const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const mediasoup = require('mediasoup');
const { nanoid } = require('nanoid');

const config = require('./config');
const { Room } = require('./room');

const workers = [];
let nextWorkerIdx = 0;
const rooms = new Map(); // roomId -> Room

async function createWorkers() {
  const { numWorkers, workerSettings } = config.mediasoup;
  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker(workerSettings);
    worker.on('died', () => {
      console.error(`mediasoup worker ${worker.pid} died, exiting`);
      setTimeout(() => process.exit(1), 2000);
    });
    workers.push(worker);
  }
  console.log(`mediasoup: spawned ${workers.length} workers`);
}

function nextWorker() {
  const worker = workers[nextWorkerIdx];
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return worker;
}

async function getOrCreateRoom(roomId) {
  let room = rooms.get(roomId);
  if (room) return room;
  const worker = nextWorker();
  const router = await worker.createRouter({
    mediaCodecs: config.mediasoup.routerOptions.mediaCodecs,
  });
  room = new Room(roomId, router);
  rooms.set(roomId, room);
  console.log(`room created: ${roomId}`);
  return room;
}

async function main() {
  await createWorkers();

  const app = express();
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Create a new meeting room
  app.post('/rooms', async (_req, res) => {
    const roomId = nanoid(10);
    await getOrCreateRoom(roomId);
    res.json({ roomId });
  });

  // Check if a room exists (so the client can show "meeting not found")
  app.get('/rooms/:id', (req, res) => {
    const room = rooms.get(req.params.id);
    res.json({ exists: !!room });
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: config.clientOrigin, methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    console.log(`socket connected: ${socket.id}`);

    let joinedRoomId = null;
    let peerId = null;

    socket.on('joinRoom', async ({ roomId }, cb) => {
      try {
        const room = await getOrCreateRoom(roomId);
        peerId = socket.id;
        room.addPeer(peerId, socket);
        joinedRoomId = roomId;
        socket.join(roomId);

        const existingProducers = [];
        for (const peer of room.getOtherPeers(peerId)) {
          for (const producer of peer.producers.values()) {
            existingProducers.push({
              producerId: producer.id,
              peerId: peer.id,
              kind: producer.kind,
            });
          }
        }

        cb({
          rtpCapabilities: room.router.rtpCapabilities,
          existingProducers,
        });
      } catch (err) {
        console.error('joinRoom error', err);
        cb({ error: err.message });
      }
    });

    socket.on('createWebRtcTransport', async (_data, cb) => {
      try {
        const room = rooms.get(joinedRoomId);
        const peer = room?.peers.get(peerId);
        if (!peer) return cb({ error: 'not in room' });

        const transport = await room.createWebRtcTransport();
        peer.transports.set(transport.id, transport);

        transport.on('dtlsstatechange', (state) => {
          if (state === 'closed') transport.close();
        });

        cb({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        });
      } catch (err) {
        console.error('createWebRtcTransport error', err);
        cb({ error: err.message });
      }
    });

    socket.on('connectTransport', async ({ transportId, dtlsParameters }, cb) => {
      try {
        const peer = rooms.get(joinedRoomId)?.peers.get(peerId);
        const transport = peer?.transports.get(transportId);
        if (!transport) return cb({ error: 'transport not found' });
        await transport.connect({ dtlsParameters });
        cb({ ok: true });
      } catch (err) {
        console.error('connectTransport error', err);
        cb({ error: err.message });
      }
    });

    socket.on('produce', async ({ transportId, kind, rtpParameters }, cb) => {
      try {
        const room = rooms.get(joinedRoomId);
        const peer = room?.peers.get(peerId);
        const transport = peer?.transports.get(transportId);
        if (!transport) return cb({ error: 'transport not found' });

        const producer = await transport.produce({ kind, rtpParameters });
        peer.producers.set(producer.id, producer);

        producer.on('transportclose', () => {
          producer.close();
          peer.producers.delete(producer.id);
        });

        // Notify other peers in the room
        socket.to(joinedRoomId).emit('newProducer', {
          producerId: producer.id,
          peerId: peer.id,
          kind: producer.kind,
        });

        cb({ id: producer.id });
      } catch (err) {
        console.error('produce error', err);
        cb({ error: err.message });
      }
    });

    socket.on('consume', async ({ producerId, rtpCapabilities, transportId }, cb) => {
      try {
        const room = rooms.get(joinedRoomId);
        const peer = room?.peers.get(peerId);
        const transport = peer?.transports.get(transportId);
        if (!transport) return cb({ error: 'transport not found' });

        if (!room.router.canConsume({ producerId, rtpCapabilities })) {
          return cb({ error: 'cannot consume' });
        }

        const consumer = await transport.consume({
          producerId,
          rtpCapabilities,
          paused: true, // start paused; resume after client is ready
        });

        peer.consumers.set(consumer.id, consumer);

        consumer.on('transportclose', () => {
          peer.consumers.delete(consumer.id);
        });
        consumer.on('producerclose', () => {
          peer.consumers.delete(consumer.id);
          socket.emit('consumerClosed', { consumerId: consumer.id });
        });

        cb({
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        });
      } catch (err) {
        console.error('consume error', err);
        cb({ error: err.message });
      }
    });

    socket.on('resumeConsumer', async ({ consumerId }, cb) => {
      try {
        const peer = rooms.get(joinedRoomId)?.peers.get(peerId);
        const consumer = peer?.consumers.get(consumerId);
        if (!consumer) return cb({ error: 'consumer not found' });
        await consumer.resume();
        cb({ ok: true });
      } catch (err) {
        console.error('resumeConsumer error', err);
        cb({ error: err.message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`socket disconnected: ${socket.id}`);
      if (!joinedRoomId) return;
      const room = rooms.get(joinedRoomId);
      if (!room) return;
      room.removePeer(peerId);
      socket.to(joinedRoomId).emit('peerLeft', { peerId });
      if (room.isEmpty()) {
        room.router.close();
        rooms.delete(joinedRoomId);
        console.log(`room closed: ${joinedRoomId}`);
      }
    });
  });

  server.listen(config.listenPort, config.listenIp, () => {
    console.log(`server listening on http://${config.listenIp}:${config.listenPort}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
