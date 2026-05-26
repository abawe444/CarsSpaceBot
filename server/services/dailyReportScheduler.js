const { getSettings } = require('./settingsService');
const { listAdminGroups } = require('./adminGroupService');
const { formatDailySummaryReport } = require('./reportingService');
const { addLog } = require('./logsService');

let timer = null;
let lastRunKey = '';

function currentKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${d.getHours()}:${d.getMinutes()}`;
}

function matchesTime(now, hhmm) {
  const [hh, mm] = String(hhmm || '21:00').split(':').map((v) => Number(v));
  return now.getHours() === hh && now.getMinutes() === mm;
}

async function tick(whatsappClient) {
  const settings = getSettings();
  if (!settings.daily_admin_report_enabled) return;

  const key = currentKey();
  if (lastRunKey === key) return;

  const now = new Date();
  const groups = listAdminGroups().filter((g) => g.enabled && g.allow_daily_summary);
  const configuredGroup = String(settings.daily_admin_report_group_jid || '').trim();
  const targetGroups = configuredGroup ? groups.filter((g) => g.group_jid === configuredGroup) : groups;
  if (!targetGroups.length) return;

  for (const group of targetGroups) {
    const runTime = group.daily_report_time || settings.daily_admin_report_time || '21:00';
    if (!matchesTime(now, runTime)) continue;
    const report = formatDailySummaryReport();
    await whatsappClient.sendMessage(group.group_jid, report);
    addLog('info', 'admin', 'Daily admin report sent', { group: group.group_jid, runTime });
    lastRunKey = key;
  }
}

function startDailyReportScheduler(whatsappClient) {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    tick(whatsappClient).catch((error) => {
      addLog('error', 'admin', 'Daily report scheduler error', { error: error.message });
    });
  }, 30000);
}

module.exports = {
  startDailyReportScheduler
};
