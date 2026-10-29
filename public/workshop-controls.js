import { initialWorkshop, updateWorkshop } from './workshop-programme.js';

// Apply clicks immediately, then save them in order. Network latency never locks
// the controls, and server updates cannot briefly replay an unacknowledged click.
export function workshopControls({ send, now, changed, error }) {
  let confirmed = initialWorkshop(), ready = false, sending = false, buffered;
  const pending = [];
  function view() {
    return pending.reduce((state, item) => updateWorkshop(state, item.command, item.at), confirmed);
  }
  function notify() { changed(view(), ready); }
  function receive(data) {
    if (!data.workshop) return;
    if (pending.length) {
      if (!buffered || data.workshop.revision >= buffered.workshop.revision) buffered = data;
      return;
    }
    if (ready && data.workshop.revision < confirmed.revision) return;
    confirmed = data.workshop; ready = true; notify();
  }
  async function flush() {
    if (sending || !pending.length) return;
    sending = true;
    try {
      const data = await send(pending[0].command, confirmed.revision);
      pending.shift(); confirmed = data.workshop;
      if (buffered?.workshop.revision > confirmed.revision) {
        confirmed = buffered.workshop; pending.length = 0;
        error('The workshop was updated elsewhere. The latest step and timer are now shown.');
      }
      buffered = undefined;
    } catch (failure) {
      pending.length = 0;
      if (failure.data?.workshop) confirmed = failure.data.workshop;
      else if (buffered?.workshop.revision >= confirmed.revision) confirmed = buffered.workshop;
      buffered = undefined;
      error(failure.message);
    } finally {
      sending = false; notify(); flush();
    }
  }
  function command(command) {
    if (!ready) return;
    try {
      const at = now(); updateWorkshop(view(), command, at);
      pending.push({ command, at }); notify(); flush();
    } catch (failure) { error(failure.message); }
  }
  return { receive, command };
}
