const socket = io();

socket.on('whatsapp:status', (status) => {
  if (window.setGlobalStatus) window.setGlobalStatus(status);
  if (window.updateConnectionPage) window.updateConnectionPage(status);
  if (window.refreshDashboard) window.refreshDashboard();
});

socket.on('conversation:updated', () => {
  if (window.reloadConversations) window.reloadConversations();
  if (window.refreshDashboard) window.refreshDashboard();
  if (window.refreshAnalytics) window.refreshAnalytics();
});