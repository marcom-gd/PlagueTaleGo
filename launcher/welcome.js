const $ = selector => document.querySelector(selector);
let session = { state: 'local' }, connected = false, busy = false;
const room = $('#room');
try { room.value = localStorage.getItem('workshop-launcher-room') || 'class-a'; } catch {}
const onlineChosen = () => $('input[value="online"]').checked;
const invitationUrl = () => session.publicUrl && `${session.publicUrl}/?room=${encodeURIComponent(room.value.toLowerCase())}`;

function render() {
  const online = session.state === 'online', starting = session.state === 'starting', error = session.state === 'error';
  $('#online-panel').hidden = !onlineChosen() && !online && !starting && !error;
  $('#status-title').textContent = online ? 'Your online session is ready' : starting ? 'Preparing your session' : error ? 'Sharing needs a moment' : 'Online sharing is off';
  $('#status-dot').className = `status-dot ${online ? 'online' : error ? 'error' : ''}`;
  $('#status-message').textContent = session.message || 'Choose Online session to invite others.';
  $('#credentials').hidden = !online;
  $('#share-link').value = invitationUrl() || '';
  $('#username').value = session.username || 'workshop';
  $('#password').value = session.password || '';
  $('#retry').hidden = !error && !(onlineChosen() && session.state === 'local');
  $('#stop-sharing').hidden = !online && !starting;
  $('#stop-sharing').textContent = starting ? 'Cancel online setup' : 'Stop online sharing';
  $('#stop-sharing').disabled = busy || !connected;
  $('#retry').disabled = busy || !connected;
  $('#copy-invitation').disabled = !connected || !room.validity.valid;
  $('#start-session').disabled = !connected || busy || (onlineChosen() && !online);
  $('#connection-status').textContent = connected ? '● Launcher running on this computer' : 'Launcher unavailable — reopen Start Plague Tale GO.cmd';
}

async function request(endpoint = '', method = 'GET') {
  const response = await fetch(`/api/launcher${endpoint}`, { method, ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}), signal: AbortSignal.timeout(10000) });
  const value = await response.json();
  if (!response.ok) throw Error(value.error || 'The launcher could not complete the request.');
  return value;
}
async function refresh(initial = false) {
  try {
    session = await request(); connected = true;
    if (initial && ['online', 'starting', 'error'].includes(session.state)) $('input[value="online"]').checked = true;
  } catch { connected = false; }
  render();
}
async function changeSharing(endpoint) {
  busy = true; $('#page-error').hidden = true; render();
  try {
    session = await request(endpoint, 'POST'); connected = true;
    if (endpoint === '/stop') $('input[value="local"]').checked = true;
  } catch (error) { $('#page-error').textContent = error.message; $('#page-error').hidden = false; }
  finally { busy = false; render(); }
}
document.querySelectorAll('input[name=mode]').forEach(input => input.addEventListener('change', () => {
  render();
  if (onlineChosen()) changeSharing('/online');
}));
room.addEventListener('input', () => {
  $('#copy-invitation').textContent = 'Copy invitation'; render();
  if (room.validity.valid) { try { localStorage.setItem('workshop-launcher-room', room.value.toLowerCase()); } catch {} }
});
$('#stop-sharing').addEventListener('click', () => changeSharing('/stop'));
$('#retry').addEventListener('click', () => changeSharing('/online'));
$('#copy-invitation').addEventListener('click', async () => {
  const invitation = `Join my Plague Tale GO workshop\n${invitationUrl()}\nUsername: ${session.username}\nPassword: ${session.password}`;
  try { await navigator.clipboard.writeText(invitation); $('#copy-invitation').textContent = 'Invitation copied ✓'; }
  catch { $('#share-link').focus(); $('#share-link').select(); $('#page-error').textContent = 'Copy the selected link, then share the username and password shown above.'; $('#page-error').hidden = false; }
});
$('#session-form').addEventListener('submit', event => {
  if ($('#start-session').disabled) return event.preventDefault();
  room.value = room.value.toLowerCase();
  $('#after-start').textContent = 'Your workshop is open in another tab. Return here anytime for session controls.';
});
// Only the room name belongs in the workshop URL; mode is a launcher preference.
$('#session-form').addEventListener('formdata', event => event.formData.delete('mode'));
await refresh(true);
setInterval(() => { if (!busy) refresh(); }, 1500);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !busy) refresh(); });
