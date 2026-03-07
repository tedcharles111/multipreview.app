import fs from 'fs/promises';
import path from 'path';
import tar from 'tar-stream';
import { createGzip } from 'zlib';

const TEMP_DIR = '/tmp/sessions';

async function ensureSessionDir(sessionId) {
  const dir = path.join(TEMP_DIR, sessionId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeFiles(sessionId, files) {
  const dir = await ensureSessionDir(sessionId);
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }
}

export async function createTarGzStream(sessionId) {
  const dir = path.join(TEMP_DIR, sessionId);
  const pack = tar.pack();
  const files = await fs.readdir(dir, { withFileTypes: true, recursive: true });

  for (const file of files) {
    if (file.isFile()) {
      const fullPath = path.join(file.path, file.name);
      const relativePath = path.relative(dir, fullPath);
      const data = await fs.readFile(fullPath);
      pack.entry({ name: relativePath }, data);
    }
  }
  pack.finalize();
  return pack.pipe(createGzip());
}

export async function cleanupSession(sessionId) {
  const dir = path.join(TEMP_DIR, sessionId);
  await fs.rm(dir, { recursive: true, force: true });
}
