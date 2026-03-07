import express from 'express';
import store from '../store.js';
import { writeFiles, createTarGzStream, cleanupSession } from '../utils/fileHandler.js';
import { createPreviewService, stopService } from '../services/northflank.js';

const router = express.Router();

router.get('/code/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = store.get(sessionId);
  if (!session) return res.status(404).send('Session not found');

  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${sessionId}.tar.gz"`);
  const stream = await createTarGzStream(sessionId);
  stream.pipe(res);
});

router.post('/create', async (req, res) => {
  try {
    const { files, startCommand = 'npm run dev' } = req.body;
    if (!files || typeof files !== 'object') {
      return res.status(400).json({ error: 'Invalid files object' });
    }

    const session = store.create(files, startCommand);
    await writeFiles(session.id, files);

    const downloadUrl = `${process.env.BASE_URL}/preview/code/${session.id}`;

    const { serviceId, previewUrl } = await createPreviewService(
      session.id,
      downloadUrl,
      startCommand
    );

    store.update(session.id, {
      northflankServiceId: serviceId,
      previewUrl,
      status: 'running',
    });

    res.json({
      success: true,
      sessionId: session.id,
      previewUrl,
      message: 'Preview created successfully',
    });
  } catch (error) {
    console.error('Preview creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/stop/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = store.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  if (session.northflankServiceId) {
    await stopService(session.northflankServiceId);
  }
  await cleanupSession(sessionId);
  store.delete(sessionId);

  res.json({ success: true, message: 'Preview stopped' });
});

router.get('/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = store.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({
    sessionId: session.id,
    status: session.status,
    previewUrl: session.previewUrl,
    createdAt: session.createdAt,
    lastAccessed: session.lastAccessed,
  });
});

router.get('/logs/:sessionId', (req, res) => {
  res.json({ message: 'Logs not yet implemented' });
});

export default router;
