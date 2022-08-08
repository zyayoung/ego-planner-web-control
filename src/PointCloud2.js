import * as THREE from 'three';
import { cmap } from './cmap';

export function processMessage(msg) {
    const n = msg.height * msg.width;
    const dv = new DataView(msg.data.buffer);
    const littleEndian = !msg.is_bigendian;
    const _x = msg.fields[0].offset + msg.data.byteOffset;
    const _y = msg.fields[1].offset + msg.data.byteOffset;
    const _z = msg.fields[2].offset + msg.data.byteOffset;
    const points = [];
    const colors = [];
    const color = new THREE.Color();
    for (let i = 0; i < n; i++) {
        let base = i * msg.point_step;
        let x = dv.getFloat32(base + _x, littleEndian);
        let y = dv.getFloat32(base + _y, littleEndian);
        let z = dv.getFloat32(base + _z, littleEndian);
        points.push(y, z, x);
        color.setRGB(...cmap((z + .5) / 3));
        colors.push( color.r, color.g, color.b );
    }
    return {points, colors};
};
