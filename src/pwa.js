import './pwa.css';

let enabled = false, installed = false, installedOnDevice = false, promptEvent = null, registration = null, applyingUpdate = false;
let installEvidence = 0, installProbe = null;
let noticeTimer;
const controls = '[data-pwa-install], [data-pwa-install-now], [data-pwa-help-close], [data-pwa-update], [data-pwa-recheck]';

export function pwaInstallButton(sidebar = false) {
  return `<button type="button" class="btn sm pwa-install" data-pwa-install ${sidebar ? 'data-pwa-sidebar' : ''} hidden>${sidebar ? 'Cài Rentbook trên PC' : 'Cài Rentbook'}</button>`;
}

export function pwaControls() {
  return pwaInstallButton() + '<button type="button" class="btn sm pwa-update" data-pwa-update hidden>Có phiên bản mới</button>';
}

export function syncPWAControls() {
  document.querySelectorAll('[data-pwa-install]').forEach(button => {
    button.hidden = !enabled || installed;
    button.textContent = installedOnDevice ? 'Mở Rentbook' : button.hasAttribute('data-pwa-sidebar') ? 'Cài Rentbook trên PC' : 'Cài Rentbook';
  });
  document.querySelectorAll('[data-pwa-install-now]').forEach(button => {
    button.hidden = !enabled || installed || installedOnDevice;
    button.disabled = !promptEvent;
    button.textContent = promptEvent ? 'Cài đặt ngay' : 'Chưa có lời mời cài từ trình duyệt';
  });
  const help = document.getElementById('rentbook-install-help');
  if (help) {
    help.querySelector('h2').textContent = installedOnDevice ? 'Rentbook đã được cài' : 'Cài Rentbook trên PC';
    help.querySelector('[data-pwa-install-status]').textContent = installedOnDevice
      ? 'Rentbook đã được cài trong hồ sơ trình duyệt này. Bạn có thể mở ứng dụng để tiếp tục làm việc.'
      : promptEvent ? 'Rentbook đã sẵn sàng để cài. Chọn Cài đặt ngay và xác nhận trong hộp cài của trình duyệt.'
      : 'Trình duyệt chưa cung cấp hộp cài. Có thể Rentbook đã được cài, lời mời cài đang tạm ẩn hoặc trình duyệt chưa hỗ trợ. Bạn vẫn có thể kiểm tra theo hướng dẫn bên dưới.';
    help.querySelector('[data-pwa-open]').hidden = !installedOnDevice;
    help.querySelector('.pwa-browser-help').hidden = installedOnDevice;
    help.querySelector('[data-pwa-open-help]').hidden = !installedOnDevice;
  }
  document.querySelectorAll('[data-pwa-update]').forEach(button => {
    button.hidden = !enabled || !registration?.waiting || !navigator.serviceWorker?.controller;
  });
}

function checkInstalledPWA() {
  if (installed || typeof navigator.getInstalledRelatedApps !== 'function') return Promise.resolve();
  if (installProbe) return installProbe;
  const evidence = installEvidence;
  installProbe = (async () => {
    try {
      const apps = await navigator.getInstalledRelatedApps();
      if (evidence !== installEvidence || promptEvent) return;
      const found = apps.some(app => {
        if (app.platform !== 'webapp') return false;
        try {
          return app.id ? new URL(app.id, location.origin).href === new URL('/', location.origin).href
            : new URL(app.url, location.origin).href === new URL('/manifest.json', location.origin).href;
        } catch { return false; }
      });
      // An empty result on older browsers is not proof that the PWA is absent.
      // A new beforeinstallprompt event can supersede earlier install evidence.
      if (found) installedOnDevice = true;
      syncPWAControls();
    } catch { /* An unavailable detection API must not block install or work. */ }
  })().finally(() => { installProbe = null; });
  return installProbe;
}

function showInstallHelp() {
  let dialog = document.getElementById('rentbook-install-help');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'rentbook-install-help'; dialog.className = 'pwa-install-help';
    dialog.setAttribute('aria-labelledby', 'rentbook-install-title');
    dialog.innerHTML = `<div class="pwa-help-header"><span class="brand"><i></i>Rentbook</span><button type="button" class="btn sm" data-pwa-help-close aria-label="Đóng hướng dẫn cài đặt">×</button></div><h2 id="rentbook-install-title">Cài Rentbook trên PC</h2><p>Mở Rentbook trong cửa sổ riêng, thuận tiện truy cập từ menu Start hoặc desktop.</p><p class="pwa-install-status" data-pwa-install-status role="status" aria-live="polite"></p><button type="button" class="primary" data-pwa-install-now>Cài đặt ngay</button><a class="btn primary" data-pwa-open href="/" target="_blank" rel="noopener noreferrer" hidden>Mở Rentbook</a><p data-pwa-open-help hidden>Nếu liên kết vẫn mở thành tab web: mở Rentbook từ menu Start, vào cài đặt ứng dụng trong trình duyệt và bật mở liên kết được hỗ trợ bằng Rentbook.</p><div class="pwa-browser-help"><h3>Google Chrome</h3><p>Chọn biểu tượng cài ứng dụng trên thanh địa chỉ. Hoặc mở menu <strong>⋮ → Truyền, lưu và chia sẻ → Cài đặt trang dưới dạng ứng dụng</strong>.</p><h3>Microsoft Edge</h3><p>Mở menu <strong>⋯ → Ứng dụng → Cài đặt trang này dưới dạng ứng dụng</strong>.</p></div><p class="pwa-help-note">Nếu đã cài Rentbook, mở ứng dụng từ menu Start hoặc biểu tượng trên desktop. Trình duyệt sẽ không mời cài lại bản PWA đang có trong cùng hồ sơ.</p><p class="footnote">Rentbook cần Internet để làm việc. Tài khoản, dữ liệu và bản quyền hiện tại được dùng chung.</p><div class="pwa-help-footer"><button type="button" class="btn" data-pwa-recheck>Kiểm tra lại</button><button type="button" class="primary" data-pwa-help-close>Đã hiểu</button></div>`;
    document.body.append(dialog);
  }
  syncPWAControls();
  if (!dialog.open) dialog.showModal();
  checkInstalledPWA();
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

function handleAppLaunches() {
  if (typeof window.launchQueue?.setConsumer !== 'function') return;
  const normalize = value => {
    const url = new URL(value);
    if (url.searchParams.get('install') === '1') url.searchParams.delete('install');
    return url;
  };
  const entry = normalize(location.href);
  let firstLaunch = true;
  window.launchQueue.setConsumer(({ targetURL } = {}) => {
    let target;
    try { target = normalize(targetURL); } catch { return; }
    if (target.origin !== location.origin || target.username || target.password) return;
    const initial = firstLaunch;
    firstLaunch = false;
    // A newly opened window already loaded its launch URL. In particular,
    // don't process the first OAuth callback again after auth clears its URL.
    if (initial && target.href === entry.href) return;
    const current = normalize(location.href);
    const openDashboard = ['/', '/index.html'].includes(target.pathname) && !target.search && !target.hash;
    // The browser focuses this window. Keep its view and unsaved form when
    // Filezuno or a desktop shortcut simply asks to open the admin app again.
    if (target.href === current.href || (openDashboard && !current.searchParams.has('shop'))) return;
    // focus-existing does not navigate automatically. Still deliver OAuth
    // callbacks and storefront links, or return from a storefront to admin.
    const hashOnly = target.pathname === current.pathname && target.search === current.search;
    location.assign(target.href);
    // A fragment-only callback otherwise stays in the same document and the
    // auth client never gets its usual startup pass to consume the token.
    if (hashOnly) location.reload();
  });
}

export function startPWA() {
  if (import.meta.env.PROD && window.isSecureContext) handleAppLaunches();
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
    event.preventDefault(); installEvidence++; installedOnDevice = false; promptEvent = event; syncPWAControls();
  });
  window.addEventListener('appinstalled', () => {
    installEvidence++; installedOnDevice = true; promptEvent = null; syncPWAControls();
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
    if (button.hasAttribute('data-pwa-recheck')) {
      button.disabled = true;
      try { await checkInstalledPWA(); } finally { button.disabled = false; }
    } else if (button.hasAttribute('data-pwa-help-close')) {
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
  checkInstalledPWA();
  window.addEventListener('focus', () => checkInstalledPWA());
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
