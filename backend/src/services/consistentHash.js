// Consistent hashing ring.
//
// We place each of the 3 cache nodes at several points ("virtual nodes") on a
// numeric ring. To find which node owns a prefix, we hash the prefix to a point
// and walk clockwise to the first node point we meet. Virtual nodes spread each
// physical node around the ring so ownership is reasonably balanced.
//
// This is a simulation for the assignment — the ring lives in memory in one
// process — but the algorithm is the real thing.

import { config } from "../config.js";

const VIRTUAL_NODES = 50; // points per physical node on the ring

// Deterministic 32-bit string hash (FNV-1a). Same input -> same number, always.
function hash(str) {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // multiply by FNV prime (16777619) using 32-bit math
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0; // force unsigned 32-bit
}

// Build the ring: an array of { point, node } sorted by point ascending.
function buildRing(nodes) {
  const ring = [];
  for (const node of nodes) {
    for (let v = 0; v < VIRTUAL_NODES; v++) {
      ring.push({ point: hash(`${node}#${v}`), node });
    }
  }
  ring.sort((a, b) => a.point - b.point);
  return ring;
}

const ring = buildRing(config.cacheNodes);

// Return the owning cache node for a given key (prefix).
export function getNode(key) {
  const p = hash(key);
  // First ring point with point >= p; wrap around to ring[0] if none.
  for (let i = 0; i < ring.length; i++) {
    if (ring[i].point >= p) return ring[i].node;
  }
  return ring[0].node;
}

// Expose ring layout for the debug endpoint / documentation.
export function ringInfo() {
  const perNode = {};
  for (const node of config.cacheNodes) perNode[node] = 0;
  for (const slot of ring) perNode[slot.node] += 1;
  return {
    nodes: config.cacheNodes,
    virtualNodesPerNode: VIRTUAL_NODES,
    totalPoints: ring.length,
    pointsPerNode: perNode,
  };
}
