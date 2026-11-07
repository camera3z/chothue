import "./style.css";
import { createClient } from "@supabase/supabase-js";
const configured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);
const db = configured
  ? createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
    )
  : null;
const money = (n) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dateLabel = (d) => (d ? d.split("-").reverse().join("/") : "");
const overdue = (c) => active(c) && c.end < today();
const held = (c) =>
  Math.max(0, Number(c.deposit || 0) - Number(c.depositRefunded || 0));
let calendarOffset = 0,
  calendarDay = today(),
  contractFilter = "all";
const seed = {
  assets: [
    {
      id: "a1",
      name: "Sony A7 IV + lens 24–70",
      category: "Máy ảnh & thiết bị",
      quantity: 3,
      price: 450000,
      unit: "ngày",
    },
    {
      id: "a2",
      name: "Xe máy Honda Vision",
      category: "Phương tiện",
      quantity: 5,
      price: 150000,
      unit: "ngày",
    },
    {
      id: "a3",
      name: "Căn hộ studio A.01",
      category: "Bất động sản",
      quantity: 1,
      price: 5500000,
      unit: "tháng",
    },
    {
      id: "a4",
      name: "Bộ bàn ghế sự kiện",
      category: "Sự kiện & nội thất",
      quantity: 20,
      price: 80000,
      unit: "ngày",
    },
  ],
  customers: [
    {
      id: "c1",
      name: "Nguyễn Minh Anh",
      phone: "090 123 4567",
      email: "minhanh@example.com",
    },
    {
      id: "c2",
      name: "Công ty Sự kiện An Nhiên",
      phone: "091 234 5678",
      email: "contact@example.com",
    },
  ],
  contracts: [],
};
let state,
  view = "overview",
  session = null,
  org = null,
  license = null,
  search = "";
try {
  state =
    JSON.parse(localStorage.getItem("chothue-demo-v1")) ||
    structuredClone(seed);
} catch {
  state = structuredClone(seed);
}
const nav = [
  ["overview", "◫", "Bàn điều hành"],
  ["calendar", "▦", "Lịch giao · trả"],
  ["assets", "▣", "Kho cho thuê"],
  ["customers", "♙", "Khách thuê"],
  ["contracts", "▤", "Hợp đồng"],
  ["payments", "↗", "Công nợ & tiền cọc"],
  ["license", "◇", "Gói & bản quyền"],
];
const active = (c) => c.status === "active";
const used = (id) =>
  state.contracts
    .filter((c) => active(c) && c.assetId === id)
    .reduce((s, c) => s + Number(c.quantity), 0);
const available = (a) =>
  Number(a.quantity) - used(a.id) - Number(a.maintenance || 0);
function toast(message) {
  let el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 4000);
}
async function save(next) {
  if (db) {
    const { error } = await db
      .from("records")
      .upsert({ organization_id: org.id, data: next });
    if (error) throw error;
  } else localStorage.setItem("chothue-demo-v1", JSON.stringify(next));
  state = next;
  render();
}
function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.join("") : `<tr><td colspan="${headers.length}" class="empty">Chưa có dữ liệu. Thêm mới để bắt đầu quản lý.</td></tr>`}</tbody></table></div>`;
}
const assetName = (id) =>
  state.assets.find((a) => a.id === id)?.name || "Tài sản đã xóa";
const customerName = (id) =>
  state.customers.find((a) => a.id === id)?.name || "Khách thuê";
function contractRows(list) {
  return list.map(
    (c) =>
      `<tr><td><strong>${esc(c.code)}</strong><small>${esc(customerName(c.customerId))}</small></td><td>${esc(assetName(c.assetId))}<small>${c.quantity} đơn vị</small></td><td>${dateLabel(c.start)}<small>Hẹn trả ${dateLabel(c.end)}</small></td><td>${money(c.total)}<small>Còn thu ${money(Math.max(0, c.total - c.paid))}</small></td><td><span class="badge ${overdue(c) ? "danger" : active(c) ? "blue" : ""}">${overdue(c) ? "Quá hạn" : active(c) ? "Đang thuê" : "Đã trả"}</span></td><td class="row-actions"><button class="text-btn" data-detail="${c.id}">Chi tiết</button>${active(c) ? `<button class="text-btn" data-return="${c.id}">Nhận trả</button>` : ""}</td></tr>`,
  );
}
function overview() {
  const renting = state.contracts.filter(active),
    late = renting.filter(overdue),
    due = renting.filter((c) => c.end === today()),
    total = state.assets.reduce((n, a) => n + Number(a.quantity), 0),
    out = renting.reduce((n, c) => n + Number(c.quantity), 0),
    repair = state.assets.reduce((n, a) => n + Number(a.maintenance || 0), 0),
    debt = state.contracts.reduce(
      (n, c) => n + Math.max(0, c.total - c.paid),
      0,
    );
  return `<div class="operation-strip"><div><span class="live-dot"></span> HOẠT ĐỘNG HÔM NAY <strong>${dateLabel(today())}</strong></div><button class="text-btn" data-view="calendar">Mở lịch giao · trả ↗</button></div><div class="stats">${[
    ["Đang cho thuê", out, "đơn vị / " + renting.length + " hợp đồng", "blue"],
    ["Hẹn trả hôm nay", due.length, "hợp đồng cần thu hồi", "orange"],
    ["Hợp đồng quá hạn", late.length, "cần liên hệ khách thuê", "danger"],
    ["Còn phải thu", money(debt), "Không bao gồm tiền cọc", ""],
  ]
    .map(
      ([label, n, sub, tone]) =>
        `<article class="stat ${tone}"><p>${label}</p><b>${n}</b><small>${sub}</small></article>`,
    )
    .join(
      "",
    )}</div><div class="dispatch-grid"><section class="panel"><div class="panel-title"><div><span class="eyebrow">ƯU TIÊN XỬ LÝ</span><h3>Thu hồi & bàn giao</h3></div><span class="count">${late.length + due.length}</span></div>${late.length + due.length ? [...late, ...due].map((c) => `<div class="dispatch-item"><div class="dispatch-icon ${overdue(c) ? "danger" : "orange"}">↙</div><div><strong>${esc(assetName(c.assetId))}</strong><p>${esc(customerName(c.customerId))} · ${c.quantity} đơn vị</p><small>${esc(c.code)} · ${overdue(c) ? "Quá hạn từ" : "Hẹn trả"} ${dateLabel(c.end)}</small></div><button class="outline" data-return="${c.id}">Nhận trả</button></div>`).join("") : '<div class="empty-state"><span>✓</span><h3>Chưa có lịch thu hồi cần xử lý</h3><p>Các hợp đồng đến hạn và quá hạn sẽ hiển thị tại đây.</p></div>'}</section><section class="panel fleet"><span class="eyebrow">TÌNH TRẠNG KHO</span><h3>Tài sản đang ở đâu?</h3><div class="fleet-number">${Math.max(0, total - out - repair)}<small> sẵn sàng cho thuê</small></div><div class="stock-bar"><span style="width:${total ? (out / total) * 100 : 0}%"></span><i style="width:${total ? (repair / total) * 100 : 0}%"></i></div><div class="legend"><p><i class="dot blue"></i> Đang thuê <b>${out}</b></p><p><i class="dot orange"></i> Bảo trì <b>${repair}</b></p><p><i class="dot"></i> Tổng trong kho <b>${total}</b></p></div><button class="outline" data-view="assets">Quản lý kho →</button></section></div><section class="panel"><div class="panel-title"><div><span class="eyebrow">THEO DÕI VÒNG ĐỜI THUÊ</span><h3>Hợp đồng gần đây</h3></div><button class="text-btn" data-view="contracts">Tất cả hợp đồng →</button></div>${table(["Hợp đồng / Khách thuê", "Tài sản", "Giao · Hẹn trả", "Tiền thuê", "Trạng thái", "Thao tác"], contractRows(state.contracts.slice().reverse().slice(0, 6)))}</section><div class="quick-actions"><button data-add="asset">＋ Nhập tài sản vào kho</button><button data-add="customer">＋ Thêm khách thuê</button><button data-add="contract">＋ Lập hợp đồng cho thuê</button></div>`;
}
function calendar() {
  const base = new Date(today() + "T12:00:00");
  base.setDate(base.getDate() + calendarOffset);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const events = state.contracts.flatMap((c) => [
    { c, date: c.start, type: "Giao tài sản" },
    {
      c,
      date: c.end,
      type: active(c) ? "Hẹn nhận trả" : "Đã trả theo hợp đồng",
    },
  ]);
  const selected = events.filter((e) => e.date === calendarDay);
  return `<section class="panel"><div class="panel-title"><div><span class="eyebrow">LỊCH VẬN HÀNH</span><h3>${dateLabel(days[0])} — ${dateLabel(days[6])}</h3></div><div class="row-actions"><button data-week="-7" aria-label="Tuần trước">←</button><button data-week="0">Hôm nay</button><button data-week="7" aria-label="Tuần sau">→</button></div></div><div class="week-grid">${days.map((d) => `<button data-day="${d}" class="day ${d === calendarDay ? "chosen" : ""}"><small>${new Date(d + "T12:00:00").toLocaleDateString("vi-VN", { weekday: "short" })}</small><b>${d.slice(8)}</b><span>${events.filter((e) => e.date === d).length} lịch</span></button>`).join("")}</div><h3 class="schedule-title">Lịch ngày ${dateLabel(calendarDay)}</h3>${selected.length ? selected.map(({ c, type }) => `<div class="dispatch-item"><span class="dispatch-icon">${type === "Giao tài sản" ? "↗" : "↙"}</span><div><strong>${type} · ${esc(assetName(c.assetId))}</strong><p>${esc(customerName(c.customerId))} · ${esc(c.code)} · ${c.quantity} đơn vị</p></div><button class="text-btn" data-detail="${c.id}">Chi tiết →</button></div>`).join("") : '<div class="empty-state"><span>▦</span><h3>Không có lịch trong ngày này</h3><p>Lịch được lấy từ ngày giao và ngày hẹn trả trên hợp đồng.</p></div>'}<p class="footnote">Lịch theo ngày. Hợp đồng giữ số lượng kho ngay khi tạo cho đến lúc nhận trả; chưa hỗ trợ đặt chỗ theo khung giờ.</p></section>`;
}
function content() {
  const q = search.toLowerCase();
  if (view === "overview") return overview();
  if (view === "calendar") return calendar();
  if (view === "assets")
    return `<section class="panel">${table(
      [
        "Tài sản / Sản phẩm",
        "Danh mục",
        "Đơn giá",
        "Tổng số lượng",
        "Khả dụng",
        "Bảo trì",
        "",
      ],
      state.assets
        .filter((a) => [a.name, a.category].join(" ").toLowerCase().includes(q))
        .map(
          (a) =>
            `<tr><td><strong>${esc(a.name)}</strong></td><td>${esc(a.category)}</td><td>${money(a.price)}<small>/ ${esc(a.unit)}</small></td><td>${a.quantity}</td><td><span class="badge ${available(a) > 0 ? "" : "orange"}">${available(a)} sẵn sàng</span></td><td>${Number(a.maintenance || 0)}</td><td><button class="text-btn" data-maintenance="${a.id}">Bảo trì</button></td></tr>`,
        ),
    )}</section>`;
  if (view === "customers")
    return `<section class="panel">${table(
      ["Khách thuê", "Điện thoại", "Email", "Số hợp đồng"],
      state.customers
        .filter((c) =>
          [c.name, c.phone, c.email].join(" ").toLowerCase().includes(q),
        )
        .map(
          (c) =>
            `<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.phone)}</td><td>${esc(c.email)}</td><td>${state.contracts.filter((x) => x.customerId === c.id).length}</td></tr>`,
        ),
    )}</section>`;
  if (view === "contracts")
    return `<div class="filter-tabs">${[
      ["all", "Tất cả"],
      ["active", "Đang thuê"],
      ["late", "Quá hạn"],
      ["returned", "Đã trả"],
    ]
      .map(
        ([id, label]) =>
          `<button class="${contractFilter === id ? "selected" : ""}" data-filter="${id}">${label}</button>`,
      )
      .join("")}</div><section class="panel">${table(
      [
        "Hợp đồng / Khách thuê",
        "Tài sản",
        "Thời gian",
        "Giá trị",
        "Trạng thái",
        "",
      ],
      contractRows(
        state.contracts
          .filter(
            (c) =>
              contractFilter === "all" ||
              (contractFilter === "late"
                ? overdue(c)
                : c.status === contractFilter),
          )
          .filter((c) =>
            [c.code, customerName(c.customerId), assetName(c.assetId)]
              .join(" ")
              .toLowerCase()
              .includes(q),
          )
          .slice()
          .reverse(),
      ),
    )}</section>`;
  if (view === "payments")
    return `<section class="panel">${table(
      [
        "Hợp đồng",
        "Khách thuê",
        "Tổng giá trị",
        "Đã thu",
        "Còn phải thu",
        "Cọc đang giữ",
        "",
      ],
      state.contracts.map(
        (c) =>
          `<tr><td><strong>${esc(c.code)}</strong></td><td>${esc(customerName(c.customerId))}</td><td>${money(c.total)}</td><td>${money(c.paid)}</td><td>${money(Math.max(0, c.total - c.paid))}</td><td>${money(held(c))}</td><td>${held(c) > 0 ? `<button class="text-btn" data-refund="${c.id}">Hoàn cọc</button>` : ""}${c.paid < c.total ? `<button class="text-btn" data-pay="${c.id}">Ghi nhận thu</button>` : '<span class="badge">Đã thanh toán</span>'}</td></tr>`,
      ),
    )}<p class="footnote">Tiền cọc được theo dõi riêng, không cộng vào doanh thu hay trừ công nợ tiền thuê. Thanh toán được ghi nhận thủ công.</p></section>`;
  return `<section class="license-layout"><article class="panel"><span class="eyebrow">BẢN QUYỀN KHÔNG GIAN LÀM VIỆC</span><h2>${db ? "Kích hoạt để bắt đầu kinh doanh" : "Bạn đang khám phá bản demo"}</h2><p>Mỗi key kích hoạt cho một đơn vị cho thuê. Dữ liệu giữa các đơn vị được phân quyền riêng.</p><div class="license-state"><span class="badge">${db ? (license && new Date(license.expires_at) > new Date() ? "Đã kích hoạt" : "Chưa kích hoạt") : "Chế độ demo"}</span>${license ? `<p>Hạn sử dụng: ${esc(new Date(license.expires_at).toLocaleDateString("vi-VN"))}</p>` : ""}</div><form id="key-form"><label>Key bản quyền<input name="key" placeholder="Nhập key do nhà cung cấp cấp" required ${db ? "" : "disabled"}></label><button class="primary" ${db ? "" : "disabled"}>Kích hoạt key</button></form><p class="footnote">${db ? "Key chỉ được sử dụng một lần và xác thực trên máy chủ." : "Để dùng key thật, kết nối dự án Supabase riêng theo README."}</p></article><article class="panel tip"><h3>Dành cho nhiều mô hình cho thuê</h3><p>✓ Danh mục tài sản tự do</p><p>✓ Đơn giá theo giờ, ngày, tháng hoặc lượt</p><p>✓ Khách thuê và hợp đồng</p><p>✓ Tồn khả dụng và công nợ</p><p>✓ Không gian dữ liệu riêng</p></article></section>`;
}
function render() {
  if (db && !session) {
    renderAuth();
    return;
  }
  document.querySelector("#app").innerHTML =
    `<aside><a class="brand" href="#"><span class="logo">R</span>RENT<span class="brand-dot">OS</span></a><div class="workspace"><span class="workspace-icon">▦</span><div><strong>${esc(org?.name || "Không gian demo")}</strong><small>${db ? "Không gian riêng" : "Dành cho mọi ngành nghề"}</small></div></div><span class="nav-label">VẬN HÀNH CHO THUÊ</span><nav>${nav.map(([id, icon, label]) => `<button data-view="${id}" class="${view === id ? "selected" : ""}"><span>${icon}</span>${label}${id === "license" ? "<i>KEY</i>" : ""}</button>`).join("")}</nav><div class="sidebar-bottom"><div class="help"><b>Từ bàn giao đến thu hồi</b><p>Theo dõi tài sản, tiền thuê<br>và tiền cọc trong một nơi.</p><span>↗</span></div><button class="profile" id="profile"><span class="avatar">${db ? "U" : "D"}</span><div><strong>${db ? "Tài khoản của bạn" : "Tài khoản trải nghiệm"}</strong><small>${db ? "Nhấn để đăng xuất" : "Dữ liệu lưu trên trình duyệt"}</small></div></button></div></aside><main><header><div class="breadcrumb">RENTOS <span>/</span> <b>${nav.find((x) => x[0] === view)[2]}</b></div><div class="header-right"><span class="status-dot"></span>${db ? "Supabase riêng" : "Bản trải nghiệm"}<span class="avatar small">${db ? "U" : "D"}</span></div></header><div class="page"><div class="page-title"><div><h1>${nav.find((x) => x[0] === view)[2]}</h1><p>${view === "overview" ? "Tài sản, lịch trả và dòng tiền. Nắm rõ để vận hành." : view === "calendar" ? "Chủ động lịch giao, hẹn trả và thu hồi tài sản." : "Quản lý vòng đời cho thuê trong không gian của bạn."}</p></div>${["overview", "assets", "customers", "contracts"].includes(view) ? `<button class="primary" data-add="${{ overview: "contract", assets: "asset", customers: "customer", contracts: "contract" }[view]}">＋ ${view === "assets" ? "Thêm tài sản" : view === "customers" ? "Thêm khách thuê" : "Tạo hợp đồng"}</button>` : `<span class="date">◷ ${new Date().toLocaleDateString("vi-VN", { day: "numeric", month: "long", year: "numeric" })}</span>`}</div>${!db ? '<div class="demo-banner"><span>◈</span> Chế độ demo · Dữ liệu mẫu được lưu trong trình duyệt này.<button class="text-btn" data-view="license">Kích hoạt bản quyền →</button></div>' : ""}${["assets", "customers", "contracts"].includes(view) ? `<div class="search-bar"><input id="search" placeholder="Tìm kiếm…" value="${esc(search)}"><span>${state[view].length} bản ghi</span></div>` : ""}<div id="content">${content()}</div><footer>RENTOS / HỆ ĐIỀU HÀNH CHO THUÊ <span>Độc lập · Linh hoạt · Tập trung</span></footer></div></main><dialog id="modal"></dialog><div id="toast" role="status"></div>`;
  bind();
}
function bind() {
  document.querySelector("#app").onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.view) {
      view = d.view;
      search = "";
      render();
    } else if (d.add) openForm(d.add);
    else if (d.return) openReturn(d.return);
    else if (d.pay) openPayment(d.pay);
    else if (d.refund) openRefund(d.refund);
    else if (d.detail) openDetail(d.detail);
    else if (d.maintenance) openMaintenance(d.maintenance);
    else if (d.filter) {
      contractFilter = d.filter;
      render();
    } else if (d.day) {
      calendarDay = d.day;
      render();
    } else if (d.week) {
      calendarOffset = d.week === "0" ? 0 : calendarOffset + Number(d.week);
      const dt = new Date(today() + "T12:00:00");
      dt.setDate(dt.getDate() + calendarOffset);
      calendarDay = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      render();
    } else if (b.id === "profile" && db) await db.auth.signOut();
  };
  document.querySelector("#search")?.addEventListener("input", (e) => {
    search = e.target.value;
    document.querySelector("#content").innerHTML = content();
  });
  document.querySelector("#key-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = e.submitter;
    b.disabled = true;
    try {
      const { error } = await db.rpc("redeem_license", {
        p_organization: org.id,
        p_key: new FormData(e.target).get("key").trim(),
      });
      if (error) throw error;
      await load();
      render();
      toast("Kích hoạt thành công");
    } catch (err) {
      toast(err.message);
      b.disabled = false;
    }
  });
}
async function mutate(fn) {
  try {
    const next = structuredClone(state);
    await fn(next);
    await save(next);
    toast("Đã lưu thay đổi");
  } catch (e) {
    toast(e.message);
  }
}
const input = (label, name, type = "text", extra = "") =>
  `<label>${label}<input name="${name}" type="${type}" ${extra} required></label>`;
function modal(title, body, onSubmit) {
  const el = document.querySelector("#modal");
  el.innerHTML = `<form id="entry-form"><div class="modal-title"><h2>${title}</h2><button type="button" id="close">×</button></div>${body}<p id="form-error" role="alert"></p><div class="modal-actions"><button type="button" id="cancel">Hủy</button><button class="primary">Lưu thông tin</button></div></form>`;
  el.querySelector("#close").onclick = el.querySelector("#cancel").onclick =
    () => el.close();
  el.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true;
    try {
      await onSubmit(Object.fromEntries(new FormData(e.target)));
      el.close();
      toast("Đã lưu thông tin");
    } catch (err) {
      el.querySelector("#form-error").textContent = err.message;
      btn.disabled = false;
    }
  };
  el.showModal();
}
function openForm(type) {
  if (type === "asset")
    modal(
      "Thêm tài sản / sản phẩm",
      `${input("Tên tài sản", "name")}${input("Danh mục (tự đặt)", "category", "text", 'list="categories"')}<datalist id="categories">${["Phương tiện", "Thiết bị", "Bất động sản", "Thời trang", "Sự kiện", "Công cụ"].map((c) => `<option>${c}</option>`).join("")}</datalist><div class="form-grid">${input("Số lượng", "quantity", "number", 'min="1" step="1"')}${input("Đơn giá (₫)", "price", "number", 'min="0" step="1000"')}</div><label>Đơn vị tính<select name="unit"><option>giờ</option><option selected>ngày</option><option>tuần</option><option>tháng</option><option>lượt</option></select></label>`,
      async (d) => {
        const next = structuredClone(state);
        next.assets.push({
          ...d,
          id: crypto.randomUUID(),
          quantity: Number(d.quantity),
          price: Number(d.price),
        });
        await save(next);
      },
    );
  if (type === "customer")
    modal(
      "Thêm khách thuê",
      `${input("Tên cá nhân / doanh nghiệp", "name")}${input("Số điện thoại", "phone", "tel")}<label>Email (không bắt buộc)<input name="email" type="email"></label>`,
      async (d) => {
        const n = structuredClone(state);
        n.customers.push({ ...d, id: crypto.randomUUID() });
        await save(n);
      },
    );
  if (type === "contract") {
    if (!state.assets.length || !state.customers.length)
      return toast("Hãy thêm tài sản và khách thuê trước.");
    modal(
      "Tạo hợp đồng",
      `<label>Khách thuê<select name="customerId">${state.customers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label><label>Tài sản<select name="assetId">${state.assets.map((a) => `<option value="${a.id}" ${available(a) < 1 ? "disabled" : ""}>${esc(a.name)} · Còn ${available(a)}</option>`).join("")}</select></label><div class="form-grid">${input("Ngày bắt đầu", "start", "date", `value="${today()}"`)}${input("Ngày kết thúc", "end", "date", `value="${today()}"`)}</div><div class="form-grid">${input("Số lượng", "quantity", "number", 'value="1" min="1" step="1"')}${input("Số đơn vị tính tiền", "periods", "number", 'value="1" min="1" step="1"')}</div><p class="footnote">Tổng tiền = đơn giá tài sản × số lượng × số đơn vị tính tiền. Với tháng, giờ hoặc lượt, nhập số đơn vị theo thỏa thuận.</p>${input("Tiền thuê đã thu (₫)", "paid", "number", 'value="0" min="0" step="1000"')}${input("Tiền cọc đã nhận (₫)", "deposit", "number", 'value="0" min="0" step="1000"')}<label>Ghi chú bàn giao<textarea name="handoverNote" placeholder="Phụ kiện đi kèm, tình trạng tài sản, địa chỉ giao…"></textarea></label>`,
      async (d) => {
        if (d.end < d.start)
          throw Error("Ngày kết thúc phải từ ngày bắt đầu trở đi.");
        const a = state.assets.find((a) => a.id === d.assetId);
        if (!a || Number(d.quantity) > available(a))
          throw Error("Số lượng khả dụng không đủ.");
        const total = Number(a.price) * Number(d.quantity) * Number(d.periods);
        if (Number(d.paid) > total)
          throw Error("Tiền đã thu không được vượt tổng hợp đồng.");
        const n = structuredClone(state);
        n.contracts.push({
          ...d,
          id: crypto.randomUUID(),
          code: "HĐ-" + String(n.contracts.length + 1).padStart(4, "0"),
          quantity: Number(d.quantity),
          total,
          paid: Number(d.paid),
          deposit: Number(d.deposit || 0),
          depositRefunded: 0,
          transactions: [
            {
              id: crypto.randomUUID(),
              at: new Date().toISOString(),
              type: "rent",
              amount: Number(d.paid),
            },
            {
              id: crypto.randomUUID(),
              at: new Date().toISOString(),
              type: "deposit",
              amount: Number(d.deposit || 0),
            },
          ].filter((t) => t.amount > 0),
          status: "active",
        });
        await save(n);
      },
    );
  }
}
function openPayment(id) {
  const c = state.contracts.find((c) => c.id === id);
  modal(
    "Ghi nhận thu tiền",
    `<p>${esc(c.code)} · Còn phải thu ${money(c.total - c.paid)}</p>${input("Số tiền nhận thêm (₫)", "amount", "number", `min="1" max="${c.total - c.paid}" step="1"`)}`,
    async (d) => {
      const amount = Number(d.amount);
      if (amount <= 0 || amount > c.total - c.paid)
        throw Error("Số tiền không hợp lệ.");
      const n = structuredClone(state);
      const target = n.contracts.find((x) => x.id === id);
      target.paid += amount;
      target.transactions ??= [];
      target.transactions.push({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        type: "rent",
        amount,
      });
      await save(n);
    },
  );
}
function openMaintenance(id) {
  const a = state.assets.find((x) => x.id === id);
  modal(
    "Đưa tài sản vào bảo trì",
    `<p>${esc(a.name)} · Tổng ${a.quantity} · Đang thuê ${used(a.id)}</p>${input("Số lượng đang bảo trì", "maintenance", "number", `min="0" max="${Number(a.quantity) - used(a.id)}" value="${a.maintenance || 0}" step="1"`)}<label>Ghi chú bảo trì<textarea name="maintenanceNote">${esc(a.maintenanceNote || "")}</textarea></label><p class="footnote">Số lượng bảo trì không được tính vào tồn khả dụng. Nhập 0 sau khi bảo trì xong.</p>`,
    async (d) => {
      if (Number(d.maintenance) > Number(a.quantity) - used(a.id))
        throw Error("Không thể bảo trì tài sản đang cho thuê.");
      const n = structuredClone(state);
      Object.assign(
        n.assets.find((x) => x.id === id),
        {
          maintenance: Number(d.maintenance),
          maintenanceNote: d.maintenanceNote,
        },
      );
      await save(n);
    },
  );
}
function openReturn(id) {
  const c = state.contracts.find((x) => x.id === id);
  modal(
    "Nhận trả tài sản",
    `<div class="summary-box"><strong>${esc(c.code)} · ${esc(assetName(c.assetId))}</strong><p>${esc(customerName(c.customerId))} · ${c.quantity} đơn vị</p><p>Còn tiền thuê: ${money(Math.max(0, c.total - c.paid))} · Cọc đang giữ: ${money(held(c))}</p></div>${input("Tiền cọc hoàn ngay (₫)", "refund", "number", `min="0" max="${held(c)}" value="${held(c)}" step="1"`)}<label>Tình trạng nhận trả<textarea name="returnNote" placeholder="Tình trạng, phụ kiện, hư hỏng nếu có…"></textarea></label><p class="footnote">Nhận trả đưa toàn bộ số lượng về kho. Công nợ tiền thuê và phần cọc chưa hoàn vẫn được giữ lại để theo dõi riêng.</p>`,
    async (d) => {
      const amount = Number(d.refund);
      if (amount < 0 || amount > held(c))
        throw Error("Tiền hoàn không hợp lệ.");
      const n = structuredClone(state),
        target = n.contracts.find((x) => x.id === id);
      Object.assign(target, {
        status: "returned",
        returnedAt: new Date().toISOString(),
        returnNote: d.returnNote,
        depositRefunded: Number(target.depositRefunded || 0) + amount,
      });
      target.transactions ??= [];
      if (amount)
        target.transactions.push({
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          type: "refund",
          amount,
        });
      await save(n);
    },
  );
}
function openRefund(id) {
  const c = state.contracts.find((x) => x.id === id);
  modal(
    "Hoàn tiền cọc",
    `<p>${esc(c.code)} · Cọc còn giữ ${money(held(c))}</p>${input("Số tiền hoàn (₫)", "amount", "number", `min="1" max="${held(c)}" value="${held(c)}" step="1"`)}`,
    async (d) => {
      const amount = Number(d.amount);
      if (amount <= 0 || amount > held(c))
        throw Error("Tiền hoàn không hợp lệ.");
      const n = structuredClone(state),
        target = n.contracts.find((x) => x.id === id);
      target.depositRefunded = Number(target.depositRefunded || 0) + amount;
      target.transactions ??= [];
      target.transactions.push({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        type: "refund",
        amount,
      });
      await save(n);
    },
  );
}
function openDetail(id) {
  const c = state.contracts.find((x) => x.id === id);
  const el = document.querySelector("#modal");
  el.innerHTML = `<div class="modal-title"><div><span class="eyebrow">HỒ SƠ CHO THUÊ</span><h2>${esc(c.code)}</h2></div><button id="close" aria-label="Đóng">×</button></div><div class="summary-box"><h3>${esc(assetName(c.assetId))}</h3><p>${esc(customerName(c.customerId))} · ${c.quantity} đơn vị</p><p>Giao ${dateLabel(c.start)} → Hẹn trả ${dateLabel(c.end)}</p></div><div class="detail-money"><div>Tiền thuê<strong>${money(c.total)}</strong></div><div>Đã thu<strong>${money(c.paid)}</strong></div><div>Cọc đang giữ<strong>${money(held(c))}</strong></div></div><h3>Ghi chú bàn giao</h3><p class="note-text">${esc(c.handoverNote || "Chưa có ghi chú")}</p><h3>Ghi chú nhận trả</h3><p class="note-text">${esc(c.returnNote || "Chưa nhận trả")}</p><h3>Lịch sử thu · hoàn tiền</h3>${
    (c.transactions || []).length
      ? table(
          ["Ngày", "Loại", "Số tiền"],
          c.transactions.map(
            (t) =>
              `<tr><td>${esc(new Date(t.at).toLocaleString("vi-VN"))}</td><td>${{ rent: "Thu tiền thuê", deposit: "Nhận cọc", refund: "Hoàn cọc" }[t.type] || esc(t.type)}</td><td>${money(t.amount)}</td></tr>`,
          ),
        )
      : "<p>Hợp đồng cũ chưa có nhật ký giao dịch chi tiết.</p>"
  }`;
  el.querySelector("#close").onclick = () => el.close();
  el.showModal();
}
function renderAuth() {
  document.querySelector("#app").innerHTML =
    `<div class="auth"><div class="auth-story"><div class="brand"><span class="logo">R</span>RENT<span class="brand-dot">OS</span></div><span class="eyebrow">HỆ ĐIỀU HÀNH CHO THUÊ ĐA NGÀNH</span><h2>Tài sản luôn luân chuyển.<br>Vận hành luôn trong tầm tay.</h2><p>Từ lần bàn giao đầu tiên đến lần nhận trả cuối cùng.</p><div class="auth-flow"><span>01 / QUẢN LÝ KHO</span><span>02 / GIAO & NHẬN TRẢ</span><span>03 / TIỀN THUÊ & TIỀN CỌC</span></div></div><section class="panel"><span class="eyebrow">KHÔNG GIAN KINH DOANH CỦA BẠN</span><h1>Đăng nhập bàn điều hành.</h1><p>Không gian riêng cho đơn vị kinh doanh cho thuê của bạn.</p><form id="auth-form">${input("Email", "email", "email")}${input("Mật khẩu", "password", "password", 'minlength="8"')}<p id="auth-message" role="status"></p><button class="primary" name="action" value="signin">Đăng nhập</button><button name="action" value="signup">Tạo tài khoản</button></form></section></div>`;
  document.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const action = e.submitter.value;
    const { error } =
      await db.auth[action === "signup" ? "signUp" : "signInWithPassword"](d);
    document.querySelector("#auth-message").textContent = error
      ? error.message
      : action === "signup"
        ? "Kiểm tra email để xác nhận tài khoản."
        : "";
  };
}
async function load() {
  const { data: members, error } = await db
    .from("members")
    .select("organization_id")
    .eq("user_id", session.user.id)
    .limit(1);
  if (error) throw error;
  if (!members.length) {
    const { error } = await db.rpc("create_workspace", {
      p_name: "Đơn vị cho thuê của tôi",
    });
    if (error) throw error;
    return load();
  }
  const id = members[0].organization_id;
  const [o, r, l] = await Promise.all([
    db.from("organizations").select("*").eq("id", id).single(),
    db.from("records").select("data").eq("organization_id", id).maybeSingle(),
    db.from("licenses").select("*").eq("organization_id", id).maybeSingle(),
  ]);
  for (const x of [o, r, l]) if (x.error) throw x.error;
  org = o.data;
  state = r.data?.data || { assets: [], customers: [], contracts: [] };
  license = l.data;
}
function init() {
  if (!db) {
    render();
    return;
  }
  document.querySelector("#app").textContent = "Đang tải không gian…";
  let userId = null;
  db.auth.onAuthStateChange((event, s) => {
    session = s;
    if (s && s.user.id === userId && event === "TOKEN_REFRESHED") return;
    userId = s?.user.id || null;
    setTimeout(async () => {
      try {
        if (s) await load();
        render();
      } catch (e) {
        document.querySelector("#app").textContent =
          "Không thể tải không gian: " + e.message;
      }
    }, 0);
  });
}
init();
