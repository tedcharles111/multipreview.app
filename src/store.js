import { v4 as uuidv4 } from 'uuid';

class SessionStore {
  constructor() {
    this.sessions = new Map();
    this.timers = new Map();
  }

  create(files, startCommand) {
    const id = uuidv4().slice(0, 8);
    const session = {
      id,
      files,
      startCommand,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      northflankServiceId: null,
      previewUrl: null,
      status: 'starting',
    };
    this.sessions.set(id, session);
    this._resetTimer(id);
    return session;
  }

  get(id) {
    const session = this.sessions.get(id);
    if (session) {
      session.lastAccessed = Date.now();
      this._resetTimer(id);
    }
    return session;
  }

  update(id, data) {
    const session = this.sessions.get(id);
    if (session) {
      Object.assign(session, data);
      this._resetTimer(id);
    }
  }

  delete(id) {
    this.sessions.delete(id);
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
  }

  _resetTimer(id) {
    const existing = this.timers.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.delete(id);
    }, 30 * 60 * 1000);
    this.timers.set(id, timer);
  }
}

export default new SessionStore();
