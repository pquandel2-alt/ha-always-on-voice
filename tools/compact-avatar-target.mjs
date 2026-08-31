import fs from 'node:fs';
import path from 'node:path';

const inputPath = process.argv[2];
const outputPath = process.argv[3] || inputPath;
if (!inputPath) {
  throw new Error('Usage: node tools/compact-avatar-target.mjs <input.json> [output.json]');
}

const source = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const particles = source.particles.filter(
  particle => particle.region !== 'ambient' && particle.region !== 'sideTrail'
);
const regions = [...new Set(particles.map(particle => particle.region))];
const regionIndex = new Map(regions.map((region, index) => [region, index]));
const position = [];
const color = [];
const attributes = [];

for (const particle of particles) {
  position.push(particle.targetX, particle.targetY, particle.targetZ);
  color.push(...particle.color);
  attributes.push(
    regionIndex.get(particle.region),
    particle.baseSize,
    particle.baseAlpha,
    particle.brightness,
    particle.flowT,
    particle.seed / source.particleCount,
  );
}

const compact = {
  version: 4,
  format: 'ha-voice-columnar-v1',
  particleCount: particles.length,
  assemblyDurationMs: 1800,
  regions,
  p: position,
  c: color,
  a: attributes,
};

const temporaryPath = `${outputPath}.tmp`;
fs.writeFileSync(temporaryPath, JSON.stringify(compact));
fs.renameSync(temporaryPath, outputPath);
console.log(`${path.basename(outputPath)}: ${particles.length} points, ${fs.statSync(outputPath).size} bytes`);
