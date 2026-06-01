const config = require('./config');

class Room {
  constructor(id, router) {
    this.id = id;
    this.router = router;
    this.peers = new Map(); // peerId -> Peer
  }

  addPeer(peerId, socket) {
    const peer = {
      id: peerId,
      socket,
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

  async createWebRtcTransport() {
    const transport = await this.router.createWebRtcTransport(
      config.mediasoup.webRtcTransportOptions
    );
    return transport;
  }

  isEmpty() {
    return this.peers.size === 0;
  }
}

module.exports = { Room };
