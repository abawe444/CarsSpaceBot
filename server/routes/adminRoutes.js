const express = require('express');
const router = express.Router();

router.get('/setup', (req, res) => {
  res.render('setup', { pageTitle: 'الإعداد الأولي', activePage: 'setup' });
});

router.get('/', (req, res) => {
  res.render('dashboard', { pageTitle: 'الرئيسية', activePage: 'dashboard' });
});

router.get('/connection', (req, res) => {
  res.render('connection', { pageTitle: 'اتصال واتساب', activePage: 'connection' });
});

router.get('/conversations', (req, res) => {
  res.render('conversations', { pageTitle: 'المحادثات', activePage: 'conversations' });
});

router.get('/rules', (req, res) => {
  res.render('rules', { pageTitle: 'قواعد الردود', activePage: 'rules' });
});

router.get('/assistant', (req, res) => {
  res.redirect('/ai-brain');
});

router.get('/ai-brain', (req, res) => {
  res.render('ai-brain', { pageTitle: 'عقل المساعد', activePage: 'ai-brain' });
});

router.get('/settings', (req, res) => {
  res.render('settings', { pageTitle: 'الإعدادات', activePage: 'settings' });
});

router.get('/logs', (req, res) => {
  res.render('logs', { pageTitle: 'السجلات', activePage: 'logs' });
});

router.get('/analytics', (req, res) => {
  res.render('analytics', { pageTitle: 'التحليلات', activePage: 'analytics' });
});

router.get('/admin-groups', (req, res) => {
  res.render('admin-groups', { pageTitle: 'مجموعات الإدارة', activePage: 'admin-groups' });
});

router.get('/people', (req, res) => {
  res.render('people', { pageTitle: 'الأشخاص والصلاحيات', activePage: 'people' });
});

module.exports = router;
