const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles = {owner:'Chủ đơn vị',admin:'Quản trị',staff:'Nhân viên',viewer:'Chỉ xem'};
export async function mountNativeMembers(db, shop, currentRole, onChanged = null) {
  const root = document.querySelector('[data-native-members]');
  if (!root) return;
  const revision=(root._nativeMemberRevision||0)+1;root._nativeMemberRevision=revision;
  const manage = ['owner','admin'].includes(currentRole);
  const response = await db.members(shop);
  if (!root.isConnected||root._nativeMemberRevision!==revision) return;
  if (response.error) { root.textContent = response.error.message; return; }
  root.innerHTML = `<h2>Thành viên của đơn vị</h2><p>Mỗi người dùng tài khoản Filezuno riêng. Quyền tại đơn vị này không cấp quyền cho đơn vị khác.</p><div class="native-member-list">${response.data.map(member=>`<article class="native-member"><strong>${esc(member.email)}</strong><span>${roles[member.role] || esc(member.role)}</span>${manage&&(currentRole==='owner'||member.role!=='owner')?`<select data-member-email="${esc(member.email)}" aria-label="Vai trò của ${esc(member.email)}">${Object.entries(roles).filter(([role])=>role!=='owner'||currentRole==='owner').map(([role,label])=>`<option value="${role}" ${role===member.role?'selected':''}>${label}</option>`).join('')}</select><button class="btn sm" data-member-save="${esc(member.email)}">Lưu quyền</button><button class="btn sm" data-member-remove="${esc(member.email)}">Gỡ thành viên</button>`:''}</article>`).join('')}</div>${manage?`<form data-native-invite><h3>Thêm thành viên</h3><label>Email Filezuno đã xác minh<input name="email" type="email" required maxlength="320" autocomplete="off"></label><label>Vai trò<select name="role">${Object.entries(roles).filter(([role])=>role!=='owner'||currentRole==='owner').map(([role,label])=>`<option value="${role}" ${role==='viewer'?'selected':''}>${label}</option>`).join('')}</select></label><button class="primary" type="submit">Thêm thành viên</button></form>`:''}<p data-member-status role="status"></p>`;
  let saving = false;
  const change = async (email,role) => {
    if (saving) return;
    saving = true;
    root.querySelectorAll('button').forEach(button=>button.disabled=true);
    const result = await db.changeMember(shop,{email,role});
    if (!root.isConnected) return;
    if (result.error) { root.querySelector('[data-member-status]').textContent=result.error.message; saving=false;root.querySelectorAll('button').forEach(button=>button.disabled=false); }
    else if(onChanged){try{await onChanged();}catch(error){if(root.isConnected){root.querySelector('[data-member-status]').textContent=error.message;saving=false;root.querySelectorAll('button').forEach(button=>button.disabled=false);}}}
    else mountNativeMembers(db,shop,currentRole);
  };
  const form=root.querySelector('form');if(form)form.onsubmit=event=>{event.preventDefault();const value=Object.fromEntries(new FormData(event.target));change(value.email,value.role);};
  root.onclick=event=>{
    const save=event.target.closest('[data-member-save]'),remove=event.target.closest('[data-member-remove]');
    if(save){const select=[...root.querySelectorAll('[data-member-email]')].find(item=>item.dataset.memberEmail===save.dataset.memberSave);change(save.dataset.memberSave,select.value);}
    if(remove&&window.confirm('Gỡ thành viên này khỏi đơn vị?'))change(remove.dataset.memberRemove,null);
  };
}
