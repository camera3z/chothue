import './pwa.css';

let enabled = false, installed = false, promptEvent = null, registration = null, applyingUpdate = false;
let noticeTimer;
const controls = '[data-pwa-install], [data-pwa-install-now], [data-pwa-help-close], [data-pwa-update]';

export function pwaInstallButton(sidebar = false) {
  return `<button type="button" class="btn sm pwa-install" data-pwa-install hidden>${sidebar ? 'Cài Rentbook trên PC' : 'Cài Rentbook'}</button>`;
}

export function pwaControls() {
  return pwaInstallButton() + '<button type="button" class="btn sm pwa-update" data-pwa-update hidden>Có phiên bản mới</button>';
}

export function syncPWAControls() {
  document.querySelectorAll('[data-pwa-install]').forEach(button => {
    button.hidden = !enabled || installed;
  });
  document.querySelectorAll('[data-pwa-install-now]').forEach(button => {
    button.hidden = !enabled || installed || !promptEvent;
  });
  document.querySelectorAll('[data-pwa-update]').forEach(button => {
    button.hidden = !enabled || !registration?.waiting || !navigator.serviceWorker?.controller;
  });
}

function showInstallHelp() {
  let dialog = document.getElementById('rentbook-install-help');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'rentbook-install-help'; dialog.className = 'pwa-install-help';
    dialog.setAttribute('aria-labelledby', 'rentbook-install-title');
    dialog.innerHTML = `<div class="pwa-help-header"><span class="brand"><i></i>Rentbook</span><button type="button" class="btn sm" data-pwa-help-close aria-label="Đóng hướng dẫn cài đặt">×</button></div><h2 id="rentbook-install-title">Cài Rentbook trên PC</h2><p>Mở Rentbook trong cửa sổ riêng, thuận tiện truy cập từ menu Start hoặc desktop.</p><button type="button" class="primary" data-pwa-install-now hidden>Cài đặt ngay</button><div class="pwa-browser-help"><h3>Google Chrome</h3><p>Chọn biểu tượng cài ứng dụng trên thanh địa chỉ. Hoặc mở menu <strong>⋮ → Truyền, lưu và chia sẻ → Cài đặt trang dưới dạng ứng dụng</strong>.</p><h3>Microsoft Edge</h3><p>Mở menu <strong>⋯ → Ứng dụng → Cài đặt trang này dưới dạng ứng dụng</strong>.</p></div><p class="pwa-help-note">Dùng cửa sổ trình duyệt thường. Nếu đã cài Rentbook, bạn có thể tìm ứng dụng trong menu Start.</p><p class="footnote">Rentbook cần Internet để làm việc. Tài khoản, dữ liệu và bản quyền hiện tại được dùng chung.</p><div class="pwa-help-footer"><button type="button" class="primary" data-pwa-help-close>Đã hiểu</button></div>`;
    document.body.append(dialog);
  }
  syncPWAControls();
  if (!dialog.open) dialog.showModal();
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
  const entry = new URL(location.href);
  if (entry.searchParams.get('install') === '1') {
    // A link from Filezuno can request install help, but cannot transfer the
    // user activation required to open a native prompt on another origin.
    entry.searchParams.delete('install');
    history.replaceState(history.state, '', entry.href);
    if (!installed) showInstallHelp();
  }
  displayMode.addEventListener('change', () => { installed = displayMode.matches; syncPWAControls(); });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); promptEvent = event; syncPWAControls();
  });
  window.addEventListener('appinstalled', () => {
    installed = true; promptEvent = null; syncPWAControls();
    document.getElementById('rentbook-install-help')?.close();
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
    if (button.hasAttribute('data-pwa-help-close')) {
      document.getElementById('rentbook-install-help')?.close();
    } else if (button.hasAttribute('data-pwa-install') || button.hasAttribute('data-pwa-install-now')) {
      if (!promptEvent) { showInstallHelp(); return; }
      const pending = promptEvent; promptEvent = null; button.disabled = true;
      try {
        await pending.prompt();
        const choice = await pending.userChoice;
        if (choice.outcome === 'accepted') document.getElementById('rentbook-install-help')?.close();
      }
      catch { showInstallHelp(); }
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
