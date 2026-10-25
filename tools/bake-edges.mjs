import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';
import fs from 'fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const thr = +process.argv[3] || 30;
const all = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const M = new THREE.Matrix4().fromArray(node.getWorldMatrix());
  for (const p of mesh.listPrimitives()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p.getAttribute('POSITION').getArray()), 3));
    const idx = p.getIndices(); if (idx) g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx.getArray()), 1));
    g.applyMatrix4(M);
    const e = new THREE.EdgesGeometry(g, thr);
    const a = e.getAttribute('position').array;
    console.log(mesh.getName(), p.getMaterial()?.getName(), 'segs', a.length/6);
    all.push(a);
  }
}
let n = all.reduce((s,a)=>s+a.length,0);
const out = new Float32Array(n); let o=0; for (const a of all){out.set(a,o);o+=a.length;}
console.log('total segments', n/6);
fs.writeFileSync(process.argv[4] || 'edges.f32', Buffer.from(out.buffer));
