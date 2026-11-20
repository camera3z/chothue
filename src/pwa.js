import './pwa.css';

let enabled = false, installed = false, promptEvent = null, registration = null, applyingUpdate = false;
let noticeTimer;
const controls = '[data-pwa-install], [data-pwa-update]';

export function pwaControls() {
  return '<button type="button" class="btn sm pwa-install" data-pwa-install hidden>Cài Rentbook</button><button type="button" class="btn sm pwa-update" data-pwa-update hidden>Có phiên bản mới</button>';
}

export function syncPWAControls() {
  document.querySelectorAll('[data-pwa-install]').forEach(button => {
    button.hidden = !enabled || installed || !promptEvent;
  });
  document.querySelectorAll('[data-pwa-update]').forEach(button => {
    button.hidden = !enabled || !registration?.waiting || !navigator.serviceWorker?.controller;
  });
}

function notice(message, kind = 'status') {
  clearTimeout(noticeTimer);
  let el = document.getElementById('rentbook-pwa-notice');
  if (!el) {
    el = document.createElement('div'); el.id = 'rentbook-pwa-notice';
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    document.body.append(el);
  }
  el.textContent = message; el.dataset.kind = kind; el.hidden = !message;
  if (message && kind !== 'offline') noticeTimer = setTimeout(() => { el.hidden = true; }, 8000);
}

export function startPWA() {
  if (new URLSearchParams(location.search).has('shop')) {
    // Customer storefronts are not an invitation to install the admin app.
    document.querySelector('link[rel="manifest"]')?.remove();
    return;
  }
  if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return;
  enabled = true;
  const displayMode = matchMedia('(display-mode: standalone)');
  installed = displayMode.matches || navigator.standalone === true;
  displayMode.addEventListener('change', () => { installed = displayMode.matches; syncPWAControls(); });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); promptEvent = event; syncPWAControls();
  });
  window.addEventListener('appinstalled', () => {
    installed = true; promptEvent = null; syncPWAControls();
    notice('Đã cài Rentbook. Bạn có thể mở ứng dụng từ menu Start.');
  });
  const connectivity = () => notice(navigator.onLine ? '' : 'Mất kết nối mạng. Kết nối lại trước khi lưu thay đổi.', 'offline');
  window.addEventListener('offline', connectivity);
  window.addEventListener('online', () => { connectivity(); registration?.update().catch(() => {}); });
  connectivity();
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applyingUpdate) location.reload();
    else syncPWAControls();
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest(controls);
    if (!button || button.disabled) return;
    if (button.hasAttribute('data-pwa-install') && promptEvent) {
      const pending = promptEvent; promptEvent = null; button.disabled = true;
      try { await pending.prompt(); await pending.userChoice; }
      catch { notice('Chưa mở được cửa sổ cài đặt. Bạn có thể chọn Cài ứng dụng trong menu Chrome hoặc Edge.'); }
      finally { button.disabled = false; syncPWAControls(); }
    } else if (button.hasAttribute('data-pwa-update') && registration?.waiting) {
      if (!window.confirm('Rentbook có phiên bản mới. Hãy lưu thao tác đang làm trước khi cập nhật. Tải lại ngay?')) return;
      applyingUpdate = true; button.disabled = true;
      if (registration.waiting) registration.waiting.postMessage({ type: 'RENTBOOK_APPLY_UPDATE' });
      else location.reload(); // Another app window may have applied it while the dialog was open.
    }
  });
  navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(result => {
    registration = result;
    syncPWAControls();
    result.addEventListener('updatefound', () => {
      const worker = result.installing;
      worker?.addEventListener('statechange', syncPWAControls);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && navigator.onLine) result.update().catch(() => {});
    });
  }).catch(() => {
    // Registration failure must not interrupt the existing rental workflows.
    console.warn('Chưa bật được chế độ cài Rentbook trên thiết bị này.');
  });
}
