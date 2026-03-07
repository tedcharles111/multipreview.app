import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import previewRoutes from './routes/preview.js';

dotenv.config();

const app = express();

app.use(cors({
  origin: ['http://localhost:3000', 'https://themultiverse.build'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '50mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.use('/preview', previewRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

export default app;
