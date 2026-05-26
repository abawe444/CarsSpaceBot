const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const { PORT, APP_NAME } = require('./server/config/appConfig');
const { initDatabase } = require('./server/database/db');
const { startWhatsApp, getStatus, restartConnection } = require('./server/baileys/whatsappClient');
const { isSetupCompleted } = require('./server/services/setupService');

const adminRoutes = require('./server/routes/adminRoutes');
const apiRoutes = require('./server/routes/apiRoutes');
const settingsRoutes = require('./server/routes/settingsRoutes');
const rulesRoutes = require('./server/routes/rulesRoutes');
const conversationsRoutes = require('./server/routes/conversationsRoutes');
const logsRoutes = require('./server/routes/logsRoutes');
const aiBrainRoutes = require('./server/routes/aiBrainRoutes');
const setupRoutes = require('./server/routes/setupRoutes');
const providerRoutes = require('./server/routes/providerRoutes');
const adminGroupsRoutes = require('./server/routes/adminGroupsRoutes');
const peopleRoutes = require('./server/routes/peopleRoutes');
const debugRoutes = require('./server/routes/debugRoutes');
const { startDailyReportScheduler } = require('./server/services/dailyReportScheduler');

initDatabase();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.locals.appName = APP_NAME;
  next();
});

app.use((req, res, next) => {
  const pathname = req.path || '/';

  if (pathname.startsWith('/public') || pathname.startsWith('/socket.io')) return next();
  if (pathname.startsWith('/api/setup') || pathname === '/api/provider/test') return next();
  if (pathname.startsWith('/api')) return next();

  const setupDone = isSetupCompleted();
  if (!setupDone && pathname !== '/setup') {
    return res.redirect('/setup');
  }

  if (setupDone && pathname === '/setup') {
    return res.redirect('/');
  }

  return next();
});

app.use('/', adminRoutes);
app.use('/api', apiRoutes);
app.use('/api', settingsRoutes);
app.use('/api', rulesRoutes);
app.use('/api', conversationsRoutes);
app.use('/api', logsRoutes);
app.use('/api', aiBrainRoutes);
app.use('/api', setupRoutes);
app.use('/api', providerRoutes);
app.use('/api', adminGroupsRoutes);
app.use('/api', peopleRoutes);
app.use('/api', debugRoutes);

app.post('/api/connection/restart', async (req, res) => {
  try {
    await restartConnection();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

io.on('connection', (socket) => {
  socket.emit('whatsapp:status', getStatus());
});

startWhatsApp(io).catch((error) => {
  console.error('Failed to initialize WhatsApp:', error.message);
});
startDailyReportScheduler(require('./server/baileys/whatsappClient'));

server.listen(PORT, () => {
  console.log(`${APP_NAME} running on http://localhost:${PORT}`);
});
