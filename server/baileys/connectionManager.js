const state = {
  status: 'disconnected',
  qr: null,
  lastError: null,
  lastUpdateAt: new Date().toISOString()
};

function setConnectionState(update = {}) {
  if (update.status !== undefined) state.status = update.status;
  if (update.qr !== undefined) state.qr = update.qr;
  if (update.lastError !== undefined) state.lastError = update.lastError;
  state.lastUpdateAt = new Date().toISOString();
}

function getConnectionState() {
  return { ...state };
}

module.exports = {
  setConnectionState,
  getConnectionState
};