// Interview recordings and photos.
//
// Stored as files on the server's data disk (on AWS: the encrypted volume, MSR-owned KMS key), next to the database:
// <data folder>/media/<interview id>-audio.webm, -photo.jpg. Files are deleted automatically after the storage period the
// admin chooses (Security & DPDP page), except for interviews still under review.
// Kept behind this small module so production can later store them in an S3 bucket instead (one place to change).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const MEDIA_KINDS = { audio: ['audio/'], photo: ['image/'] };
const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const MAX_MEDIA_BYTES = 30 * 1024 * 1024; // an 8-minute speech recording is ~1.5 MB; generous limit for unusually long interviews

export function mediaStore(dbFile) {
  // Tests use an in-memory database: keep their files in a throwaway temp folder
  const dir = process.env.MEDIA_DIR || (dbFile === ':memory:' ? path.join(os.tmpdir(), `msr-media-${crypto.randomBytes(4).toString('hex')}`) : path.join(path.dirname(dbFile), 'media'));
  fs.mkdirSync(dir, { recursive: true });
  const safe = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60);
  const full = (file) => path.join(dir, path.basename(file));
  return {
    dir,
    // Saves one file; returns the description kept on the interview
    save(interviewId, kind, buf, type) {
      const base = String(type || '').split(';')[0].trim().toLowerCase();
      const file = `${safe(interviewId)}-${kind}.${EXT[base] || (kind === 'audio' ? 'webm' : 'jpg')}`;
      const tmp = full(`${file}.part`);
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, full(file)); // whole file or nothing
      return { file, type: base || (kind === 'audio' ? 'audio/webm' : 'image/jpeg'), size: buf.length, at: Date.now() };
    },
    path: (meta) => (meta?.file && fs.existsSync(full(meta.file)) ? full(meta.file) : null),
    remove(meta) { try { if (meta?.file) fs.unlinkSync(full(meta.file)); return true; } catch { return false; } },
    usage() {
      let bytes = 0; let files = 0;
      for (const f of fs.readdirSync(dir)) { if (f.endsWith('.part')) continue; try { bytes += fs.statSync(path.join(dir, f)).size; files++; } catch { /* removed meanwhile */ } }
      let freeBytes = null;
      try { const st = fs.statfsSync(dir); freeBytes = st.bavail * st.bsize; } catch { /* not supported */ }
      return { bytes, files, freeBytes };
    },
  };
}
