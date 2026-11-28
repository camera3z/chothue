// A small adapter for Rentbook's existing data boundary. SQL and identity stay on VPS.
export function createVPSClient({ fetcher = globalThis.fetch.bind(globalThis), onError = () => {} } = {}) {
  const listeners = new Set();
  let session = null, csrf = null, initial;
  const notify = event => { for (const listener of listeners) listener(event, session); };
  async function request(path, { method = 'GET', body, raw = false } = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
    try {
      const headers = {};
      if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
      if (body !== undefined && !raw) headers['Content-Type'] = 'application/json';
      const response = await fetcher('/api/rentbook/' + path, {
        method, credentials: 'same-origin', cache: 'no-store', headers,
        ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }), signal: controller.signal,
      });
      let value;
      try { value = await response.json(); } catch { throw Error('Chưa nhận được phản hồi của ứng dụng. Vui lòng tải lại trang.'); }
      if (!response.ok) throw Error(value.error || 'Chưa thực hiện được thao tác.');
      return value;
    } catch (error) {
      return { data: null, error: { message: error.name === 'AbortError' ? 'Yêu cầu xử lý lâu hơn dự kiến. Kiểm tra dữ liệu đã lưu trước khi thử lại.' : error.message } };
    } finally { clearTimeout(timer); }
  }
  async function recover() {
    const result = await request('session');
    if (result.error) throw Error(result.error.message);
    const previous = session?.user.id;
    session = result.data; csrf = result.csrf;
    if (previous !== session?.user.id) notify(session ? 'SIGNED_IN' : 'SIGNED_OUT');
    return session;
  }
  function ready() { return initial ??= recover(); }
  async function post(path, body, raw = false) {
    try { await ready(); } catch (error) { return { data: null, error: { message: error.message } }; }
    return request(path, { method: 'POST', body, raw });
  }
  class Query {
    constructor(table) { this.value = { table, columns: '*', filters: [] }; }
    select(columns = '*', options = {}) { this.value.columns = columns; this.value.count = options.count === 'exact'; return this; }
    eq(column, value) { this.value.filters.push([column, value]); return this; }
    order(column, options = {}) { this.value.order = { column, ascending: options.ascending !== false }; return this; }
    limit(limit) { this.value.limit = limit; return this; }
    single() { this.value.mode = 'single'; return this; }
    maybeSingle() { this.value.mode = 'maybeSingle'; return this; }
    upsert(value) { return this.value.table === 'storefronts' ? post('storefront', value) : Promise.resolve({ data: null, error: { message: 'Thao tác không được hỗ trợ.' } }); }
    then(resolve, reject) { return post('query', this.value).then(resolve, reject); }
  }
  const auth = {
    onAuthStateChange(callback) {
      let active = true;
      ready().then(() => { if (active) { listeners.add(callback); callback('INITIAL_SESSION', session); } }).catch(error => onError(error.message));
      return { data: { subscription: { unsubscribe() { active = false; listeners.delete(callback); } } } };
    },
    async getSession() { try { return { data: { session: await recover() }, error: null }; } catch (error) { return { data: { session: null }, error: { message: error.message } }; } },
    async signInWithOAuth() { location.assign('/_app-session/start'); return { error: null }; },
    async signOut() {
      const result = await post('logout', {});
      if (!result.error) { session = null; csrf = null; initial = Promise.resolve(null); notify('SIGNED_OUT'); }
      return result;
    },
    async updateUser(value) {
      const result = await post('profile', value);
      if (!result.error) { session = { ...session, user: result.data.user }; notify('USER_UPDATED'); }
      return result;
    },
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
    if (!document.hidden && initial) recover().catch(error => onError(error.message));
  });
  return {
    native: true, auth,
    from: table => new Query(table),
    rpc: (name, value = {}) => post('rpc/' + encodeURIComponent(name), value),
    async workspaces() { try { await ready(); return request('workspaces'); } catch (error) { return { data: null, error: { message: error.message } }; } },
    async members(shop) { await ready(); return request('workspaces/' + encodeURIComponent(shop) + '/members'); },
    changeMember: (shop, value) => post('workspaces/' + encodeURIComponent(shop) + '/members', value),
    renameWorkspace: (shop, name) => post('workspaces/' + encodeURIComponent(shop) + '/name', {name}),
    storage: {
      from(bucket) {
        if (bucket !== 'asset-images') throw Error('Kho ảnh không hợp lệ.');
        return {
          upload: (path, blob) => post('images/upload?path=' + encodeURIComponent(path), blob, true),
          remove: paths => post('images/remove', { paths }),
          createSignedUrls: paths => post('images/urls', { paths }),
        };
      },
    },
  };
}
