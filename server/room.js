const config = require('./config');
const { nanoid } = require('nanoid');

class Room {
  constructor(id) {
    this.id = id;
    this.routers = new Map(); // worker.pid -> router
    this.peers = new Map(); // peerId -> Peer
    this.hostToken = nanoid(16);
    this.locked = true;
    this.waitingPeers = new Map(); // socket.id -> socket (Lobby)
    this.admittedPeers = new Set(); // peerIds allowed to bypass lock
  }

  async getOrCreateRouterForWorker(worker) {
    if (this.routers.has(worker.pid)) {
      return this.routers.get(worker.pid);
    }
    const router = await worker.createRouter({
      mediaCodecs: config.mediasoup.routerOptions.mediaCodecs,
    });
    
    // If there are existing producers, pipe them to this new router
    const promises = [];
    for (const peer of this.peers.values()) {
      if (peer.router.id !== router.id) {
        for (const producer of peer.producers.values()) {
          promises.push(
            peer.router.pipeToRouter({
              producerId: producer.id,
              router: router,
            })
          );
        }
      }
    }
    await Promise.all(promises);

    this.routers.set(worker.pid, router);
    return router;
  }

  async pipeProducerToAllOtherRouters(producer, sourceRouter) {
    const promises = [];
    for (const router of this.routers.values()) {
      if (router.id !== sourceRouter.id) {
        promises.push(
          sourceRouter.pipeToRouter({
            producerId: producer.id,
            router: router,
          })
        );
      }
    }
    await Promise.all(promises);
  }

  async addPeer(peerId, socket, worker) {
    const router = await this.getOrCreateRouterForWorker(worker);
    const peer = {
      id: peerId,
      socket,
      worker,
      router,
      transports: new Map(), // transportId -> transport
      producers: new Map(),  // producerId -> producer
      consumers: new Map(),  // consumerId -> consumer
    };
    this.peers.set(peerId, peer);
    return peer;
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    for (const transport of peer.transports.values()) transport.close();
    this.peers.delete(peerId);
  }

  getOtherPeers(peerId) {
    return [...this.peers.values()].filter((p) => p.id !== peerId);
  }

  async createWebRtcTransport(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) throw new Error('Peer not found');
    const transport = await peer.router.createWebRtcTransport(
      config.mediasoup.webRtcTransportOptions
    );
    return transport;
  }

  isEmpty() {
    return this.peers.size === 0;
  }
}

module.exports = { Room };
