import "./style.css";
import { readMoneyForm, mountMoneyInputs } from "./money-input.js";
import { rentalQuote, rentalPeriods } from "./rental-pricing.js";
import { localInput } from "./booking-request.js";
import { renderStorefront } from "./storefront.js";
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
const overdue = (c) =>
  active(c) &&
  (c.rentalEnd ? new Date(c.rentalEnd) < new Date() : c.end < today());
const held = (c) =>
  Math.max(0, Number(c.deposit || 0) - Number(c.depositRefunded || 0));
let assetFilter = "all";
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
let bookingRequests = [],
  bookingRequestsError = "",
  requestLimit = 100;
const nav = [
  ["overview", "◫", "Tổng quan"],
  ["assets", "▣", "Tài sản"],
  ["contracts", "▤", "Đơn thuê"],
  ["customers", "♙", "Khách thuê"],
  ["calendar", "▦", "Lịch"],
  ["payments", "↗", "Công nợ & tiền cọc"],
  ["requests", "▤", "Yêu cầu đặt thuê"],
  ["storefront", "▣", "Trang trưng bày"],
  ["license", "◇", "Gói và bản quyền"],
];
const active = (c) => c.status === "active";
const used = (id) =>
  state.contracts
    .filter(
      (c) =>
        (active(c) ||
          (c.status === "reserved" &&
            new Date(c.rentalStart) <= new Date() &&
            new Date(c.rentalEnd) > new Date())) &&
        c.assetId === id,
    )
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
    const { _revision, ...payload } = next;
    const { data: version, error } = await db.rpc("save_rental_records", {
      p_shop: org.id,
      p_expected: _revision,
      p_data: payload,
    });
    if (error) throw error;
    next._revision = version;
  } else localStorage.setItem("chothue-demo-v1", JSON.stringify(next));
  state = next;
  await hydrateImages(next);
  render();
}
const imageURLs = new Map();
const imageTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
function imageSource(a) {
  if (a.imagePath)
    return !db || a.imagePath.startsWith(org.id + "/")
      ? imageURLs.get(a.imagePath)?.url || ""
      : "";
  if (!db && /^data:image\/(png|jpeg|webp);base64,/.test(a.imageData || ""))
    return a.imageData;
  return "";
}
function assetPhoto(a) {
  const url = imageSource(a);
  return `<div class="asset-photo">${url ? `<img src="${esc(url)}" alt="${esc(a.name)}" loading="lazy">` : `<span class="asset-photo-placeholder">${icon("assets")}<span>Chưa có ảnh</span></span>`}</div>`;
}
async function hydrateImages(data) {
  if (!db) return;
  const paths = [
    ...new Set(
      data.assets
        .map((a) => a.imagePath)
        .filter(
          (p) =>
            typeof p === "string" &&
            p.startsWith(org.id + "/") &&
            (!imageURLs.has(p) || imageURLs.get(p).expires < Date.now()),
        ),
    ),
  ];
  if (!paths.length) return;
  try {
    const { data: urls, error } = await db.storage
      .from("asset-images")
      .createSignedUrls(paths, 3600);
    if (error) return;
    for (const item of urls || [])
      if (item.signedUrl)
        imageURLs.set(item.path, {
          url: item.signedUrl,
          expires: Date.now() + 45 * 60000,
        });
  } catch {}
}
async function readImage(file) {
  if (!file || !file.size) return null;
  if (!imageTypes[file.type]) throw Error("Chọn ảnh JPG, PNG hoặc WebP.");
  if (file.size > 5 * 1024 * 1024)
    throw Error("Ảnh phải nhỏ hơn hoặc bằng 5 MB.");
  try {
    const bitmap = await createImageBitmap(file);
    if (bitmap.width > 12000 || bitmap.height > 12000) {
      bitmap.close();
      throw Error("too large");
    }
    bitmap.close();
  } catch {
    throw Error("Ảnh không hợp lệ hoặc kích thước vượt 12.000 pixel.");
  }
  return file;
}
function photoField(a = {}) {
  return `<label>Ảnh tài sản (không bắt buộc)<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="footnote">JPG, PNG hoặc WebP · tối đa 5 MB · mỗi tài sản một ảnh.</p><div class="photo-preview">${imageSource(a) ? `<img src="${esc(imageSource(a))}" alt="Ảnh hiện tại">` : ""}</div>`;
}
async function uploadPhoto(file, assetId) {
  if (!file) return {};
  if (!db) {
    const data = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(Error("Không đọc được ảnh."));
      r.readAsDataURL(file);
    });
    return { imageData: data };
  }
  const path = `${org.id}/${assetId}/${crypto.randomUUID()}.${imageTypes[file.type]}`;
  const { error } = await db.storage
    .from("asset-images")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error)
    throw Error(
      "Không tải được ảnh. Kiểm tra bucket asset-images, quyền truy cập và key còn hạn. " +
        error.message,
    );
  return { imagePath: path };
}
async function commitAssetPhoto(next, file, assetId) {
  const photo = await uploadPhoto(file, assetId);
  Object.assign(
    next.assets.find((a) => a.id === assetId),
    photo,
  );
  try {
    await save(next);
  } catch (error) {
    if (photo.imagePath)
      await db.storage
        .from("asset-images")
        .remove([photo.imagePath])
        .catch(() => {});
    throw error;
  }
}
function openAssetPhoto(id) {
  const asset = state.assets.find((a) => a.id === id);
  modal(
    "Ảnh tài sản",
    `<h3>${esc(asset.name)}</h3>${photoField(asset)}${asset.imagePath || asset.imageData ? '<label class="chk"><input name="removePhoto" type="checkbox">Gỡ ảnh khỏi tài sản</label>' : ""}`,
    async (d) => {
      const file = await readImage(d.photo);
      const next = structuredClone(state),
        target = next.assets.find((a) => a.id === id);
      if (d.removePhoto && file)
        throw Error("Chọn ảnh mới hoặc gỡ ảnh, không chọn cả hai.");
      if (d.removePhoto) {
        delete target.imagePath;
        delete target.imageData;
        await save(next);
      } else if (file) {
        await commitAssetPhoto(next, file, id);
      } else throw Error("Hãy chọn một ảnh để lưu.");
    },
  );
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
      `<tr><td><strong>${esc(c.code)}</strong><small>${esc(c.agreedCustomerName || customerName(c.customerId))}</small></td><td>${esc(assetName(c.assetId))}<small>${c.quantity} đơn vị</small></td><td>${dateLabel(c.start)}<small>Hẹn trả ${dateLabel(c.end)}</small></td><td>${money(c.total)}<small>Còn thu ${money(Math.max(0, c.total - c.paid))}</small></td><td><span class="badge ${overdue(c) ? "danger" : active(c) ? "blue" : ""}">${overdue(c) ? "Quá hạn" : c.status === "reserved" ? "Đã duyệt · Chờ giao" : active(c) ? "Đang thuê" : "Đã trả"}</span></td><td class="row-actions"><button class="text-btn" data-detail="${c.id}">Chi tiết</button>${active(c) ? `<button class="text-btn" data-return="${c.id}">Nhận trả</button>` : ""}</td></tr>`,
  );
}
function revenueData() {
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5 + i);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `T${d.getMonth() + 1}`,
      value: 0,
    };
  });
  const categories = {};
  for (const c of state.contracts) {
    const category =
      state.assets.find((a) => a.id === c.assetId)?.category || "Khác";
    for (const t of c.transactions || []) {
      if (t.type !== "rent") continue;
      const d = new Date(t.at);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const m = months.find((m) => m.key === key);
      if (m) {
        m.value += Number(t.amount);
        categories[category] = (categories[category] || 0) + Number(t.amount);
      }
    }
  }
  return { months, categories };
}
function revenueChart(months) {
  const max = Math.max(1, ...months.map((m) => m.value));
  return `<div class="revenue-chart" role="img" aria-label="Tiền thuê đã thu trong sáu tháng: ${months.map((m) => m.label + ": " + money(m.value)).join("; ")}">${months.map((m, i) => `<div class="chart-column"><span class="chart-value">${m.value ? money(m.value) : "0"}</span><div class="chart-track"><i class="${i === 5 ? "current" : ""}" style="height:${m.value ? Math.max(2, (m.value / max) * 100) : 0}%"></i></div><small>${m.label}</small></div>`).join("")}</div>`;
}
let overviewPending = [],
  overviewPendingCount = 0;
function pendingOverview() {
  return `<section class="card" id="overview-requests"><div class="panel-title"><h2>Yêu cầu thuê chờ duyệt <span class="pill request-status-pending">${overviewPendingCount}</span></h2><button class="btn sm" data-refresh-requests aria-label="Làm mới yêu cầu thuê">Làm mới</button></div><div class="list">${bookingRequestsError ? '<div class="empty">Chưa tải được yêu cầu. Vui lòng bấm Làm mới.</div>' : overviewPending.length ? overviewPending.map((r) => `<div class="row"><span><span class="r-top"><b>${esc(r.customer_name)}</b><span class="pill request-status-pending">Chờ duyệt</span></span><span class="r-sub">${esc(assetName(r.asset_id))} × ${r.quantity}</span><span class="r-sub">${esc(r.phone)} · ${esc(new Date(r.starts_at).toLocaleString("vi-VN"))}</span></span><button class="btn sm pri" data-review-request="${r.id}">Xem xét</button></div>`).join("") : '<div class="empty"><b>Chưa có yêu cầu chờ duyệt</b>Yêu cầu mới từ trang khách sẽ xuất hiện ở đây sau khi làm mới.</div>'}</div><button class="text-btn" data-view="requests">Xem tất cả yêu cầu →</button></section>`;
}
function overview() {
  const renting = state.contracts.filter(active),
    late = renting.filter(overdue),
    due = renting.filter((c) => c.end === today()),
    total = state.assets.reduce(
      (n, a) => n + Number(a.quantity) - Number(a.maintenance || 0),
      0,
    ),
    out = renting.reduce((n, c) => n + Number(c.quantity), 0),
    debt = state.contracts.reduce(
      (n, c) => n + Math.max(0, c.total - c.paid),
      0,
    );
  const { months, categories } = revenueData();
  const max = Math.max(1, ...Object.values(categories));
  return `<div class="kpis">${[
    ["Đang cho thuê", renting.length, "đơn"],
    ["Trả hôm nay", due.length, "đơn"],
    ["Quá hạn", late.length, "đơn"],
    [
      "Công suất hiện tại",
      `${total ? Math.round((out / total) * 100) : 0}%`,
      `${out}/${total} đơn vị`,
    ],
    [
      "Tiền thuê thu tháng này",
      money(months[5].value),
      `Còn phải thu ${money(debt)}`,
    ],
  ]
    .map(
      ([label, value, sub], i) =>
        `<div class="kpi ${i === 2 && late.length ? "alert" : ""}"><span>${label}</span><b class="${i === 4 ? "money-kpi" : ""}">${value}</b><em>${sub}</em></div>`,
    )
    .join(
      "",
    )}</div><div class="cols"><div class="stack"><section class="card"><h2>Việc cần xử lý</h2><div class="list">${[...late, ...due].length ? [...late, ...due].map((c) => `<div class="row"><span><span class="r-top"><span class="pill ${overdue(c) ? "st-late" : "st-out"}">${overdue(c) ? "Quá hạn" : "Hẹn trả hôm nay"}</span><b>${esc(c.agreedCustomerName || customerName(c.customerId))}</b></span><span class="r-sub">${esc(assetName(c.assetId))} × ${c.quantity} · <button class="btn sm" data-detail="${c.id}">${esc(c.code)}</button></span><span class="r-sub">${overdue(c) ? "Quá hạn từ" : "Hẹn trả"} ${dateLabel(c.end)}</span></span><span class="r-end"><button class="btn sm pri" data-return="${c.id}">Nhận trả</button></span></div>`).join("") : '<div class="empty"><b>Hôm nay không có việc tồn đọng</b>Không có đơn quá hạn hoặc hẹn trả trong ngày.</div>'}</div></section>${pendingOverview()}</div><div class="stack"><section class="card"><h2>Tiền thuê đã thu · 6 tháng</h2>${revenueChart(months)}<p class="footnote">Theo nhật ký thu tiền, không bao gồm tiền cọc. Khoản thu cũ chưa có ngày ghi nhận không được đưa vào biểu đồ.</p></section><section class="card"><h2>Thu tiền theo loại hình · 6 tháng</h2>${
    Object.keys(categories).length
      ? Object.entries(categories)
          .sort((a, b) => b[1] - a[1])
          .map(
            ([name, value]) =>
              `<div class="tbar"><span>${esc(name)}</span><span class="tr"><i style="width:${(value / max) * 100}%"></i></span><b class="amt">${money(value)}</b></div>`,
          )
          .join("")
      : '<div class="muted">Chưa có giao dịch thu tiền thuê.</div>'
  }</section></div></div>`;
}
function calendar() {
  const base = new Date(today() + "T12:00:00");
  base.setDate(base.getDate() + calendarOffset);
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const start = days[0],
    end = days[13];
  const events = state.contracts.flatMap((c) => [
    { c, date: c.start, type: "Giao tài sản" },
    {
      c,
      date: c.end,
      type:
        active(c) || c.status === "reserved"
          ? "Hẹn nhận trả"
          : "Đã trả theo hợp đồng",
    },
  ]);
  const selected = events.filter((e) => e.date === calendarDay);
  const dayIndex = (d) =>
    Math.round(
      (new Date(d + "T12:00:00") - new Date(start + "T12:00:00")) / 86400000,
    );
  return `<section><div class="panel-title"><div class="cal-range">${dateLabel(start)} — ${dateLabel(end)}</div><div class="row-actions"><button class="btn sm" data-week="-14" aria-label="Tuần trước">←</button><button class="btn sm" data-week="0">Hôm nay</button><button class="btn sm" data-week="14" aria-label="Tuần sau">→</button></div></div><div class="cal" style="--cw:48px"><div class="cgrid"><div class="chead"><div class="clabel">Tài sản</div><div class="cdays">${days.map((d) => `<div class="cd ${d === today() ? "today" : ""}">${new Date(d + "T12:00:00").toLocaleDateString("vi-VN", { weekday: "short" })}<b>${d.slice(8)}</b></div>`).join("")}</div></div>${state.assets
    .map((a) => {
      const contracts = state.contracts.filter(
        (c) => c.assetId === a.id && c.start <= end && c.end >= start,
      );
      const lanes = [];
      const layout = contracts
        .slice()
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((c) => {
          const left = Math.max(0, dayIndex(c.start)),
            right = Math.min(13, dayIndex(c.end));
          let lane = lanes.findIndex((last) => last < left);
          if (lane < 0) {
            lane = lanes.length;
            lanes.push(right);
          } else lanes[lane] = right;
          return { c, left, right, lane };
        });
      const height = Math.max(46, lanes.length * 28 + 14);
      return `<div class="crow"><div class="clabel"><b>${esc(a.name)}</b><small>${esc(a.category)} · SL ${a.quantity}</small></div><div class="ctrack" style="width:672px;height:${height}px"><div class="cbg">${days.map((d) => `<button data-day="${d}" class="${d === today() ? "today" : ""}" aria-label="Lịch ${dateLabel(d)}"></button>`).join("")}</div>${layout.map(({ c, left, right, lane }) => `<button class="bar cal-bar ${overdue(c) ? "late" : c.status === "reserved" ? "reserved" : active(c) ? "" : "returned"}" style="left:${left * 48 + 3}px;width:${(right - left + 1) * 48 - 6}px;top:${lane * 28 + 7}px" data-detail="${c.id}" title="${esc(c.code + " · " + customerName(c.customerId))}">${esc(c.agreedCustomerName || customerName(c.customerId))} × ${c.quantity}</button>`).join("")}</div></div>`;
    })
    .join(
      "",
    )}</div></div>${!state.assets.length ? '<div class="empty">Thêm tài sản để xem lịch.</div>' : ""}<div class="legend"><span class="pill st-booked">Chờ giao</span><span class="pill st-out">Đang thuê</span><span class="pill st-late">Quá hạn</span><span class="pill st-returned">Đã trả</span></div><h3 class="schedule-title">Lịch ngày ${dateLabel(calendarDay)}</h3><div class="list">${selected.length ? selected.map(({ c, type }) => `<div class="row"><span><span class="r-top"><b>${type} · ${esc(assetName(c.assetId))}</b></span><span class="r-sub">${esc(c.agreedCustomerName || customerName(c.customerId))} · ${esc(c.code)} · ${c.quantity} đơn vị</span></span><button class="btn sm" data-detail="${c.id}">Chi tiết</button></div>`).join("") : '<div class="empty">Không có lịch trong ngày này.</div>'}</div><p class="footnote">Lịch hiển thị theo ngày. Đơn đặt từ web kiểm tra chồng lịch theo giờ bắt đầu–kết thúc; xem Chi tiết để biết giờ chính xác.</p></section>`;
}
let storefrontConfig = null;
function storefrontSettings() {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("shop", org?.id || "");
  return `<section class="card"><h2>Trang trưng bày dành cho khách</h2><p class="r-sub">Khách chỉ thấy tài sản còn sẵn sàng. Quản trị tiếp tục xem tất cả trong mục Tài sản, kèm số đang thuê và bảo trì.</p><form id="storefront-form"><label>Tên shop công khai<input name="name" maxlength="120" required value="${esc(storefrontConfig?.name || shopName())}"></label><label class="chk"><input type="checkbox" name="enabled" ${storefrontConfig?.enabled ? "checked" : ""}>Mở trang trưng bày công khai</label><p class="footnote">Khi mở, tên, ảnh, loại hình, giá và số lượng khả dụng được công khai. Không công khai khách thuê, hợp đồng hay công nợ.</p><button class="btn pri" ${db ? "" : "disabled"}>Lưu trang trưng bày</button><p id="storefront-status" role="status"></p></form>${db ? `<label>Đường dẫn gửi khách<input readonly value="${esc(url.href)}"></label><a class="btn" href="${esc(url.href)}" target="_blank" rel="noopener">Xem trang khách</a>` : "<p>Cần kết nối Supabase để mở trang công khai.</p>"}</section>`;
}
function requestList() {
  return `<div class="request-toolbar"><p class="r-sub">${bookingRequests.filter((r) => r.status === "pending").length} yêu cầu chờ duyệt · Đang tải tối đa ${requestLimit} yêu cầu mới nhất</p><button class="btn sm" data-refresh-requests>Làm mới</button></div>${bookingRequestsError ? '<p class="booking-error">Chưa tải được yêu cầu. Kiểm tra migration đặt thuê trong Supabase.</p>' : ""}<div class="list">${bookingRequests.map((r) => `<div class="row"><span><span class="r-top"><b>${esc(r.customer_name)}</b><span class="pill request-status-${esc(r.status)}">${{ pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối", cancelled: "Đã hủy" }[r.status]}</span></span><span class="r-sub">${esc(r.phone)} · ${esc(assetName(r.asset_id))} × ${r.quantity}</span><span class="r-sub">${esc(new Date(r.starts_at).toLocaleString("vi-VN"))} → ${esc(new Date(r.ends_at).toLocaleString("vi-VN"))}</span><span class="r-sub">Dự kiến ${money(r.estimated_total)}</span></span><button class="btn sm" data-review-request="${r.id}">${r.status === "pending" ? "Xem xét" : "Chi tiết"}</button></div>`).join("") || '<div class="empty"><b>Chưa có yêu cầu đặt thuê</b>Khách gửi yêu cầu từ trang trưng bày sẽ xuất hiện tại đây.</div>'}</div>${bookingRequests.length >= requestLimit ? '<button class="btn" data-more-requests>Xem thêm yêu cầu cũ</button>' : ""}`;
}
function openRequestReview(id) {
  const r = bookingRequests.find((r) => r.id === id);
  if (!r) return;
  const done = r.status !== "pending";
  modal(
    done ? "Chi tiết yêu cầu" : "Xem xét & duyệt đơn thuê",
    `<div class="summary-box"><h3>${esc(assetName(r.asset_id))}</h3><p class="request-note">Khách ghi chú: ${esc(r.note || "Không có")}</p><p class="code">${esc(r.id)}</p></div><label>Quyết định<select name="decision" ${done ? "disabled" : ""}><option value="approve">Duyệt & tạo hợp đồng giữ chỗ</option><option value="reject">Từ chối yêu cầu</option></select></label>${input("Tên khách thỏa thuận", "name", "text", `maxlength="120" value="${esc(r.customer_name)}"`)}${input("Số điện thoại", "phone", "tel", `value="${esc(r.phone)}"`)}<div class="form-grid">${input("Bắt đầu", "start", "datetime-local", `value="${localInput(r.starts_at)}"`)}${input("Kết thúc", "end", "datetime-local", `value="${localInput(r.ends_at)}"`)}</div>${input("Số lượng", "quantity", "number", `min="1" max="10000" step="1" value="${r.quantity}"`)}${input("Tổng tiền thuê thỏa thuận (₫)", "total", "number", `min="0" max="100000000000" value="${r.final_total ?? r.estimated_total}"`)}${input("Tiền cọc yêu cầu (chưa phải tiền đã nhận)", "deposit", "number", `min="0" max="100000000000" value="${r.deposit_required ?? 0}"`)}<label>Điều khoản / ghi chú duyệt / lý do từ chối<textarea name="terms" maxlength="4000">${esc(r.review_note || "")}</textarea></label><p class="footnote">Duyệt sẽ kiểm tra lại lịch và tạo hợp đồng giữ chỗ. Chưa ghi nhận thu tiền. Sau khi giao thực tế, vào Đơn thuê → Giao tài sản. ${done ? "Yêu cầu này đã xử lý, không thể duyệt lại." : ""}</p>`,
    async (d) => {
      const { error } = await db.rpc("review_rental_request", {
        p_shop: org.id,
        p_request: r.id,
        p_decision: d.decision,
        p_name: d.name,
        p_phone: d.phone,
        p_start: new Date(d.start).toISOString(),
        p_end: new Date(d.end).toISOString(),
        p_quantity: Number(d.quantity),
        p_total: Number(d.total),
        p_deposit: Number(d.deposit),
        p_terms: d.terms,
      });
      if (error) throw error;
      await load();
      render();
    },
  );
  if (done) {
    const form = document.querySelector("#modal form");
    form
      .querySelectorAll("input,textarea,select")
      .forEach((e) => (e.disabled = true));
    form.querySelector("[type=submit]")?.remove();
    form.querySelector(".modal-actions .primary")?.remove();
  } else
    document.querySelector("#modal .modal-actions .primary").textContent =
      "Lưu quyết định";
}
function handoverContract(id) {
  const c = state.contracts.find((c) => c.id === id);
  modal(
    "Giao tài sản",
    `<p>${esc(assetName(c.assetId))} × ${c.quantity} · ${esc(c.agreedCustomerName || customerName(c.customerId))}</p><p class="footnote">Xác nhận đã bàn giao thực tế. Hệ thống sẽ kiểm tra tồn và lịch lần nữa trước khi lưu.</p>`,
    async () => {
      const n = structuredClone(state),
        target = n.contracts.find((c) => c.id === id);
      target.status = "active";
      target.handedOverAt = new Date().toISOString();
      await save(n);
    },
  );
}
function editReservation(id) {
  const c = state.contracts.find((c) => c.id === id);
  modal(
    "Chỉnh lịch đã duyệt",
    `<p>${esc(assetName(c.assetId))} · ${esc(c.agreedCustomerName || customerName(c.customerId))}</p><div class="form-grid">${input("Bắt đầu", "start", "datetime-local", `value="${localInput(c.rentalStart)}"`)}${input("Kết thúc", "end", "datetime-local", `value="${localInput(c.rentalEnd)}"`)}</div>${input("Số lượng", "quantity", "number", `min="1" max="10000" step="1" value="${c.quantity}"`)}${input("Tổng tiền thuê", "total", "number", `min="${c.paid || 0}" max="100000000000" value="${c.total}"`)}${input("Cọc yêu cầu", "deposit", "number", `min="0" max="100000000000" value="${c.depositRequired || 0}"`)}<label>Thỏa thuận<textarea name="terms" maxlength="4000">${esc(c.handoverNote || "")}</textarea></label>`,
    async (d) => {
      const start = new Date(d.start),
        end = new Date(d.end);
      if (end <= start || end <= new Date())
        throw Error("Thời gian thuê không hợp lệ hoặc đã qua.");
      const n = structuredClone(state),
        t = n.contracts.find((c) => c.id === id);
      Object.assign(t, {
        rentalStart: start.toISOString(),
        rentalEnd: end.toISOString(),
        start: d.start.slice(0, 10),
        end: d.end.slice(0, 10),
        quantity: Number(d.quantity),
        total: Number(d.total),
        depositRequired: Number(d.deposit),
        handoverNote: d.terms,
      });
      await save(n);
    },
  );
}
function receiveDeposit(id) {
  const c = state.contracts.find((c) => c.id === id);
  modal(
    "Ghi nhận tiền cọc",
    `<p>Cọc thỏa thuận ${money(c.depositRequired || 0)} · Đang giữ ${money(held(c))}</p>${input("Số tiền cọc nhận thêm (₫)", "amount", "number", 'min="1" max="100000000000" step="1"')}`,
    async (d) => {
      const amount = Number(d.amount);
      if (!Number.isFinite(amount) || amount <= 0)
        throw Error("Số tiền không hợp lệ.");
      const n = structuredClone(state),
        target = n.contracts.find((c) => c.id === id);
      target.deposit = Number(target.deposit || 0) + amount;
      target.transactions ??= [];
      target.transactions.push({
        id: crypto.randomUUID(),
        type: "deposit",
        amount,
        at: new Date().toISOString(),
      });
      await save(n);
    },
  );
}
function content() {
  if (view === "requests")
    return db
      ? requestList()
      : '<div class="empty">Yêu cầu đặt thuê cần Supabase. Khách không gửi vào dữ liệu demo.</div>';
  if (view === "storefront") return storefrontSettings();
  const q = search.toLowerCase();
  if (view === "overview") return overview();
  if (view === "calendar") return calendar();
  if (view === "assets")
    return `<div class="chips category-filters"><button class="chipbtn ${assetFilter === "all" ? "on" : ""}" data-category="all" aria-pressed="${assetFilter === "all"}">Tất cả</button>${[...new Set(state.assets.map((a) => a.category))].map((c) => `<button class="chipbtn" data-category="${esc(c)}" aria-pressed="${assetFilter === c}">${esc(c)}</button>`).join("")}</div><div class="grid2">${
      state.assets
        .filter(
          (a) =>
            (assetFilter === "all" || a.category === assetFilter) &&
            [a.name, a.category].join(" ").toLowerCase().includes(q),
        )
        .map(
          (a) =>
            `<article class="card acard">${assetPhoto(a)}<div class="t"><div><h3>${esc(a.name)}</h3><div class="r-sub">${esc(a.category)} · SL ${a.quantity}</div></div><span class="pill ${available(a) > 0 ? "st-ready" : "st-maint"}">${available(a)} sẵn sàng</span></div><div class="pr">${money(a.price)} / ${esc(a.unit)}</div><div class="asset-counts"><span class="chip">Đang thuê <i>${used(a.id)}</i></span><span class="chip">Bảo trì <i>${Number(a.maintenance || 0)}</i></span></div><div class="row-actions"><button class="btn sm" data-photo="${a.id}">${a.imagePath || a.imageData ? "Đổi ảnh" : "Thêm ảnh"}</button><button class="btn sm" data-maintenance="${a.id}">Bảo trì</button><button class="btn sm" data-rentasset="${a.id}">Cho thuê</button></div></article>`,
        )
        .join("") ||
      '<div class="empty"><b>Không có tài sản phù hợp</b>Thêm tài sản mới hoặc đổi từ khóa tìm kiếm.</div>'
    }</div>`;
  if (view === "customers")
    return `<div class="list">${
      state.customers
        .filter((c) =>
          [c.name, c.phone, c.email].join(" ").toLowerCase().includes(q),
        )
        .map((c) => {
          const contracts = state.contracts.filter(
            (x) => x.customerId === c.id,
          );
          return `<div class="row customer-row"><span><span class="r-top"><b>${esc(c.name)}</b></span><span class="r-sub">${esc(c.phone)}${c.email ? " · " + esc(c.email) : ""}</span></span><span class="r-end"><span class="amt">${money(contracts.reduce((n, x) => n + x.total, 0))}</span><span class="r-sub">${contracts.length} đơn thuê</span></span></div>`;
        })
        .join("") ||
      '<div class="empty"><b>Chưa có khách hàng phù hợp</b>Thêm khách thuê mới để bắt đầu.</div>'
    }</div>`;
  if (view === "contracts")
    return `<div class="filter-tabs">${[
      ["all", "Tất cả"],
      ["active", "Đang thuê"],
      ["reserved", "Đã duyệt · Chờ giao"],
      ["late", "Quá hạn"],
      ["returned", "Đã trả"],
    ]
      .map(
        ([id, label]) =>
          `<button class="chipbtn" aria-pressed="${contractFilter === id}" data-filter="${id}">${label}</button>`,
      )
      .join("")}</div><div class="list">${
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
        .reverse()
        .map(
          (c) =>
            `<div class="row contract-row"><span><span class="r-top"><span class="code">${esc(c.code)}</span><b>${esc(c.agreedCustomerName || customerName(c.customerId))}</b><span class="pill ${overdue(c) ? "st-late" : c.status === "reserved" ? "st-booked" : active(c) ? "st-out" : "st-returned"}">${overdue(c) ? "Quá hạn" : c.status === "reserved" ? "Đã duyệt · Chờ giao" : active(c) ? "Đang thuê" : "Đã trả"}</span></span><span class="r-sub">${esc(assetName(c.assetId))} × ${c.quantity}</span><span class="r-sub">${dateLabel(c.start)} → ${dateLabel(c.end)}</span></span><span class="r-end"><span class="amt">${money(c.total)}</span><span class="due">Còn thu ${money(Math.max(0, c.total - c.paid))}</span><span class="row-actions"><button class="btn sm" data-detail="${c.id}">Chi tiết</button>${c.status === "reserved" ? `<button class="btn sm pri" data-handover="${c.id}">Giao tài sản</button><button class="btn sm" data-edit-reservation="${c.id}">Chỉnh lịch</button>` : ""}${active(c) ? `<button class="btn sm pri" data-return="${c.id}">Nhận trả</button>` : ""}</span></span></div>`,
        )
        .join("") ||
      '<div class="empty"><b>Chưa có đơn thuê phù hợp</b>Tạo đơn thuê mới hoặc đổi bộ lọc.</div>'
    }</div>`;
  if (view === "payments")
    return `<div class="kpis"><div class="kpi"><span>Tiền thuê còn phải thu</span><b class="money-kpi">${money(state.contracts.reduce((n, c) => n + Math.max(0, c.total - c.paid), 0))}</b></div><div class="kpi"><span>Tiền cọc đang giữ</span><b class="money-kpi">${money(state.contracts.reduce((n, c) => n + held(c), 0))}</b></div></div><div class="list">${state.contracts.map((c) => `<div class="row"><span><span class="r-top"><b>${esc(c.agreedCustomerName || customerName(c.customerId))}</b><span class="code">${esc(c.code)}</span></span><span class="r-sub">Đã thu ${money(c.paid)} / ${money(c.total)}</span><span class="r-sub">Cọc đang giữ ${money(held(c))}</span></span><span class="r-end"><span class="amt">${money(Math.max(0, c.total - c.paid))}</span><span class="row-actions"><button class="btn sm" data-receive-deposit="${c.id}">Nhận cọc</button>${held(c) > 0 ? `<button class="btn sm" data-refund="${c.id}">Hoàn cọc</button>` : ""}${c.paid < c.total ? `<button class="btn sm pri" data-pay="${c.id}">Ghi nhận thu</button>` : '<span class="pill st-ready">Đã thanh toán</span>'}</span></span></div>`).join("") || '<div class="empty"><b>Chưa có đơn thuê</b>Công nợ và tiền cọc sẽ hiển thị tại đây.</div>'}</div><p class="footnote">Tiền cọc theo dõi riêng, không cộng vào doanh thu hoặc trừ công nợ tiền thuê.</p>`;
  return `<section class="license-layout"><article class="panel"><span class="eyebrow">BẢN QUYỀN KHÔNG GIAN LÀM VIỆC</span><h2>${db ? "Kích hoạt để bắt đầu kinh doanh" : "Bạn đang khám phá bản demo"}</h2><p>Mỗi key kích hoạt cho một đơn vị cho thuê. Dữ liệu giữa các đơn vị được phân quyền riêng.</p><div class="license-state"><span class="badge">${db ? (license && new Date(license.expires_at) > new Date() ? "Đã kích hoạt" : "Chưa kích hoạt") : "Chế độ demo"}</span>${license ? `<p>Hạn sử dụng: ${esc(new Date(license.expires_at).toLocaleDateString("vi-VN"))}</p>` : ""}</div><form id="key-form"><label>Key bản quyền<input name="key" placeholder="Nhập key do nhà cung cấp cấp" required ${db ? "" : "disabled"}></label><button class="primary" ${db ? "" : "disabled"}>Kích hoạt key</button></form><p class="footnote">${db ? "Key chỉ được sử dụng một lần và xác thực trên máy chủ." : "Để dùng key thật, kết nối dự án Supabase riêng theo README."}</p></article><article class="panel tip"><h3>Dành cho nhiều mô hình cho thuê</h3><p>✓ Danh mục tài sản tự do</p><p>✓ Đơn giá theo giờ, ngày, tháng hoặc lượt</p><p>✓ Khách thuê và hợp đồng</p><p>✓ Tồn khả dụng và công nợ</p><p>✓ Không gian dữ liệu riêng</p></article></section>`;
}
const iconPaths = {
  overview: '<path d="M4 13h6V4H4zM14 20h6V11h-6zM4 20h6v-4H4zM14 7h6V4h-6z"/>',
  calendar:
    '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  contracts: '<path d="M6 3h9l3 3v15H6zM9 11h6M9 15h6"/>',
  assets:
    '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  customers:
    '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/>',
  payments:
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
  license:
    '<circle cx="8" cy="9" r="4"/><path d="M11 12l8 8M15 16l3-3M17 18l3-3"/>',
};
const icon = (id) =>
  `<svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[id] || iconPaths.assets}</svg>`;
function navHTML() {
  return nav
    .map(
      ([id, , label]) =>
        `<button class="tab" data-view="${id}" ${view === id ? 'aria-current="page"' : ""}>${icon(id)}<span>${label}</span></button>`,
    )
    .join("");
}
const shopName = () =>
  session?.user?.user_metadata?.shop_name ||
  org?.name ||
  state?.shopName ||
  "Không gian demo";
function accountHeader() {
  return `<div class="account-header" aria-label="Tài khoản">${session ? `<button class="shop-name" data-shop-name title="Đổi tên shop"><span class="shop-avatar">${esc(shopName().trim().slice(0, 1).toUpperCase())}</span><span class="shop-label">${esc(shopName())}</span></button><button class="btn sm" data-signout>Đăng xuất</button>` : `<a class="btn sm" href="#auth-form" data-login>Đăng nhập</a>`}</div>`;
}
function openShopName() {
  modal(
    "Tên shop",
    `${input("Tên shop hiển thị", "name", "text", `maxlength="120" value="${esc(shopName())}"`)}<p class="footnote">Tên hiển thị cho tài khoản của bạn trên Rentbook.</p>`,
    async (d) => {
      const name = d.name.trim();
      if (!name || name.length > 120)
        throw Error("Nhập tên shop từ 1 đến 120 ký tự.");
      if (db) {
        const { data, error } = await db.auth.updateUser({
          data: { shop_name: name },
        });
        if (error) throw error;
        session = { ...session, user: data.user };
        render();
      } else {
        await save({ ...state, shopName: name });
      }
    },
  );
}
async function signOut(button) {
  button.disabled = true;
  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;
    session = null;
    imageURLs.clear();
    org = null;
    license = null;
    state = { assets: [], customers: [], contracts: [] };
    view = "overview";
    search = "";
    render();
  } catch (e) {
    button.disabled = false;
    toast("Chưa đăng xuất được: " + e.message);
  }
}
function render() {
  if (db && !session) {
    renderAuth();
    return;
  }
  const title = nav.find((x) => x[0] === view)[2];
  document.querySelector("#app").innerHTML =
    `<div class="shell"><aside class="side"><div><a class="brand" href="#"><i></i>Rentbook</a><div class="wsname" style="max-width:none;margin-top:6px">${esc(shopName())}</div></div><nav class="snav" aria-label="Điều hướng">${navHTML()}</nav><div class="side-bottom"><div class="sidebar-controls">${session ? '<button class="btn sm desktop-signout" data-signout>Đăng xuất</button>' : ""}<button class="theme-btn btn sm" data-theme-toggle>Đổi sáng / tối</button></div><small>${db ? "Dữ liệu đồng bộ trong không gian riêng của bạn." : "Bản demo. Dữ liệu lưu trong trình duyệt này."}</small></div></aside><div class="content-column"><div class="top"><div class="brand"><i></i>Rentbook</div><div class="wsname">${esc(shopName())}</div><button class="btn sm" data-theme-toggle aria-label="Đổi giao diện sáng tối">◐</button></div><main class="main">${accountHeader()}<div class="head page-title"><div><h1>${view === "overview" ? "Hôm nay" : title}</h1><p>${view === "overview" ? new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : view === "calendar" ? "Theo dõi ngày giao và hẹn trả của từng đơn thuê." : view === "assets" ? `${state.assets.length} tài sản · Danh mục theo ngành kinh doanh` : view === "customers" ? `${state.customers.length} khách hàng` : "Theo dõi đầy đủ tài sản, tiền thuê và tiền cọc."}</p></div>${["overview", "assets", "customers", "contracts"].includes(view) ? `<button class="btn pri primary" data-add="${{ overview: "contract", assets: "asset", customers: "customer", contracts: "contract" }[view]}">＋ ${view === "assets" ? "Thêm tài sản" : view === "customers" ? "Thêm khách thuê" : "Tạo đơn thuê"}</button>` : ""}</div>${!db ? '<div class="demo-banner">Bản demo · Dữ liệu lưu trên trình duyệt này.</div>' : ""}${["assets", "customers", "contracts"].includes(view) ? `<div class="filters search-bar"><input id="search" class="search" type="search" placeholder="Tìm kiếm theo tên${view === "contracts" ? " hoặc mã đơn" : ""}…" value="${esc(search)}"></div>` : ""}<div id="content">${content()}</div><footer>Rentbook · Quản lý cho thuê đa ngành</footer></main></div></div><nav class="tabs" aria-label="Điều hướng di động">${navHTML()}</nav><dialog id="modal"></dialog><div id="toast" role="status"></div>`;
  bind();
}
function bind() {
  document.querySelector("#app").onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (b.hasAttribute("data-theme-toggle")) {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const current =
        document.documentElement.dataset.theme || (dark ? "dark" : "light");
      document.documentElement.dataset.theme =
        current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(
          "rentbook-theme",
          document.documentElement.dataset.theme,
        );
      } catch {}
      return;
    }
    if (b.hasAttribute("data-shop-name")) {
      openShopName();
      return;
    }
    if (b.hasAttribute("data-signout") && db) {
      await signOut(b);
      return;
    }
    if (d.category) {
      assetFilter = d.category;
      render();
      return;
    }
    if (d.rentasset) {
      openForm("contract");
      const select = document.querySelector("#modal [name=assetId]");
      if (select) {
        select.value = d.rentasset;
        select.dispatchEvent(new Event("change"));
      }
      return;
    }
    if (b.hasAttribute("data-more-requests")) {
      requestLimit += 100;
      b.disabled = true;
      try {
        await load();
        render();
      } catch (error) {
        toast(error.message);
        b.disabled = false;
      }
      return;
    }
    if (b.hasAttribute("data-refresh-requests")) {
      b.disabled = true;
      try {
        await load();
        render();
      } catch (error) {
        toast(error.message);
        b.disabled = false;
      }
      return;
    }
    if (d.reviewRequest) {
      openRequestReview(d.reviewRequest);
      return;
    }
    if (d.editReservation) {
      editReservation(d.editReservation);
      return;
    }
    if (d.handover) {
      handoverContract(d.handover);
      return;
    }
    if (d.receiveDeposit) {
      receiveDeposit(d.receiveDeposit);
      return;
    }
    if (d.view) {
      view = d.view;
      search = "";
      render();
    } else if (d.add) openForm(d.add);
    else if (d.return) openReturn(d.return);
    else if (d.pay) openPayment(d.pay);
    else if (d.refund) openRefund(d.refund);
    else if (d.detail) openDetail(d.detail);
    else if (d.photo) openAssetPhoto(d.photo);
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
    }
  };
  document
    .querySelector("#storefront-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const b = e.submitter;
      b.disabled = true;
      const d = new FormData(e.target);
      const config = {
        organization_id: org.id,
        name: String(d.get("name")).trim(),
        enabled: d.has("enabled"),
      };
      try {
        if (!config.name) throw Error("Hãy nhập tên shop.");
        const { error } = await db.from("storefronts").upsert(config);
        if (error) throw error;
        storefrontConfig = config;
        document.querySelector("#storefront-status").textContent =
          "Đã lưu. Bạn có thể mở đường dẫn để xem trang khách.";
      } catch (error) {
        document.querySelector("#storefront-status").textContent =
          "Chưa lưu được. Kiểm tra SQL trang trưng bày và key còn hạn. " +
          error.message;
      } finally {
        b.disabled = false;
      }
    });
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
const moneyFields = new Set([
  "price",
  "unitPrice",
  "paid",
  "deposit",
  "total",
  "amount",
  "refund",
]);
const input = (label, name, type = "text", extra = "") =>
  type === "number" && moneyFields.has(name)
    ? `<label>${label}<span class="currency-control"><input name="${name}" type="text" inputmode="numeric" data-money ${extra} required><span class="currency-suffix" aria-hidden="true">₫</span></span></label>`
    : `<label>${label}<input name="${name}" type="${type}" ${extra} required></label>`;
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
      await onSubmit(readMoneyForm(e.target));
      el.close();
      toast("Đã lưu thông tin");
    } catch (err) {
      el.querySelector("#form-error").textContent = err.message;
      btn.disabled = false;
    }
  };
  mountMoneyInputs(el.querySelector("form"));
  const photoInput = el.querySelector("[name=photo]");
  let previewURL;
  photoInput?.addEventListener("change", async () => {
    if (previewURL) URL.revokeObjectURL(previewURL);
    const preview = el.querySelector(".photo-preview");
    preview.replaceChildren();
    try {
      const file = await readImage(photoInput.files[0]);
      el.querySelector("#form-error").textContent = "";
      if (file) {
        previewURL = URL.createObjectURL(file);
        const image = document.createElement("img");
        image.src = previewURL;
        image.alt = "Xem trước ảnh tài sản";
        preview.append(image);
      }
    } catch (error) {
      el.querySelector("#form-error").textContent = error.message;
      photoInput.value = "";
    }
  });
  el.addEventListener(
    "close",
    () => {
      if (previewURL) URL.revokeObjectURL(previewURL);
    },
    { once: true },
  );
  el.showModal();
}
function openForm(type) {
  if (type === "asset")
    modal(
      "Thêm tài sản / sản phẩm",
      `${input("Tên tài sản", "name")}${input("Danh mục (tự đặt)", "category", "text", 'list="categories"')}<datalist id="categories">${["Phương tiện", "Thiết bị", "Bất động sản", "Thời trang", "Sự kiện", "Công cụ"].map((c) => `<option>${c}</option>`).join("")}</datalist><div class="form-grid">${input("Số lượng", "quantity", "number", 'min="1" step="1"')}${input("Đơn giá (₫)", "price", "number", 'min="0" step="1000"')}</div><label>Đơn vị tính<select name="unit"><option>giờ</option><option selected>ngày</option><option>tuần</option><option>tháng</option><option>lượt</option></select></label>${photoField()}`,
      async (d) => {
        const file = await readImage(d.photo);
        const { photo, ...fields } = d;
        const next = structuredClone(state);
        const id = crypto.randomUUID();
        next.assets.push({
          ...fields,
          id,
          quantity: Number(d.quantity),
          price: Number(d.price),
        });
        await commitAssetPhoto(next, file, id);
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
      `<label>Khách thuê<select name="customerId">${state.customers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label><label>Tài sản<select name="assetId">${state.assets.map((a) => `<option value="${a.id}" ${available(a) < 1 ? "disabled" : ""}>${esc(a.name)} · Còn ${available(a)}</option>`).join("")}</select></label><div class="form-grid">${input("Ngày bắt đầu", "start", "date", `value="${today()}"`)}${input("Ngày kết thúc", "end", "date", `value="${today()}"`)}</div>${input("Số lượng tài sản", "quantity", "number", 'value="1" min="1" max="10000" step="1"')}<div class="form-grid">${input("Đơn giá thỏa thuận (₫)", "unitPrice", "number", 'value="0" min="0" max="100000000000" step="1"')}<label>Tính theo<select name="billingUnit"><option>ngày</option><option>tháng</option><option>năm</option></select></label></div><div class="summary-box" id="contract-price-summary" role="status"></div><p class="footnote">Tính cả ngày kết thúc. Ngày tính theo số ngày; tháng/năm làm tròn lên theo chu kỳ lịch từ ngày bắt đầu (ngày cuối tháng được điều chỉnh phù hợp). Đơn giá này chỉ áp dụng cho hợp đồng, không thay giá tài sản.</p>${input("Tiền thuê đã thu (₫)", "paid", "number", 'value="0" min="0" step="1000"')}${input("Tiền cọc đã nhận (₫)", "deposit", "number", 'value="0" min="0" step="1000"')}<label>Ghi chú bàn giao<textarea name="handoverNote" placeholder="Phụ kiện đi kèm, tình trạng tài sản, địa chỉ giao…"></textarea></label>`,
      async (d) => {
        if (d.end < d.start)
          throw Error("Ngày kết thúc phải từ ngày bắt đầu trở đi.");
        const a = state.assets.find((a) => a.id === d.assetId);
        if (!a || Number(d.quantity) > available(a))
          throw Error("Số lượng khả dụng không đủ.");
        const { total, periods } = rentalQuote(
          d.start,
          d.end,
          d.billingUnit,
          Number(d.unitPrice),
          Number(d.quantity),
        );
        if (Number(d.paid) > total)
          throw Error("Tiền đã thu không được vượt tổng hợp đồng.");
        const n = structuredClone(state);
        n.contracts.push({
          ...d,
          id: crypto.randomUUID(),
          code: "HĐ-" + String(n.contracts.length + 1).padStart(4, "0"),
          quantity: Number(d.quantity),
          unitPrice: Number(d.unitPrice),
          billingUnit: d.billingUnit,
          periods,
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
    bindContractPricing();
  }
}
function bindContractPricing() {
  const form = document.querySelector("#modal form");
  const summary = form.querySelector("#contract-price-summary");
  const update = () => {
    try {
      const d = readMoneyForm(form);
      const q = rentalQuote(
        d.start,
        d.end,
        d.billingUnit,
        Number(d.unitPrice),
        Number(d.quantity),
      );
      const days=rentalPeriods(d.start,d.end,'ngày');
      const compactMoney=n=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(n)+'đ';
      summary.innerHTML=`<strong class="contract-formula">Số ${esc(d.billingUnit)} đã thuê: ${q.periods} × Đơn giá: ${compactMoney(Number(d.unitPrice))}${Number(d.quantity)>1?` × ${Number(d.quantity)} tài sản`:''} = <span>${compactMoney(q.total)}</span></strong>${d.billingUnit!=='ngày'?`<span class="contract-duration">Theo lịch: ${days} ngày · ${esc(dateLabel(d.start))} – ${esc(dateLabel(d.end))}</span>`:''}`;
    } catch (e) {
      summary.textContent = e.message;
    }
  };
  form.querySelector("[name=assetId]").addEventListener("change", (e) => {
    const a = state.assets.find((a) => a.id === e.target.value);
    if (a) {
      form.querySelector("[name=unitPrice]").value = [
        "ngày",
        "tháng",
        "năm",
      ].includes(a.unit)
        ? a.price
        : 0;
      form.querySelector("[name=billingUnit]").value = [
        "ngày",
        "tháng",
        "năm",
      ].includes(a.unit)
        ? a.unit
        : "ngày";
    }
    form
      .querySelector("[name=unitPrice]")
      .dispatchEvent(new Event("input", { bubbles: true }));
    update();
  });
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.querySelector("[name=assetId]").dispatchEvent(new Event("change"));
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
    `<div class="summary-box"><strong>${esc(c.code)} · ${esc(assetName(c.assetId))}</strong><p>${esc(c.agreedCustomerName || customerName(c.customerId))} · ${c.quantity} đơn vị</p><p>Còn tiền thuê: ${money(Math.max(0, c.total - c.paid))} · Cọc đang giữ: ${money(held(c))}</p></div>${input("Tiền cọc hoàn ngay (₫)", "refund", "number", `min="0" max="${held(c)}" value="${held(c)}" step="1"`)}<label>Tình trạng nhận trả<textarea name="returnNote" placeholder="Tình trạng, phụ kiện, hư hỏng nếu có…"></textarea></label><p class="footnote">Nhận trả đưa toàn bộ số lượng về kho. Công nợ tiền thuê và phần cọc chưa hoàn vẫn được giữ lại để theo dõi riêng.</p>`,
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
  el.innerHTML = `<div class="modal-title"><div><span class="eyebrow">HỒ SƠ CHO THUÊ</span><h2>${esc(c.code)}</h2></div><button id="close" aria-label="Đóng">×</button></div><div class="summary-box"><h3>${esc(assetName(c.assetId))}</h3><p>${esc(c.agreedCustomerName || customerName(c.customerId))} · ${c.quantity} đơn vị</p><p>Giao ${dateLabel(c.start)} → Hẹn trả ${dateLabel(c.end)}</p></div><div class="detail-money"><div>Tiền thuê<strong>${money(c.total)}</strong></div><div>Đã thu<strong>${money(c.paid)}</strong></div><div>Cọc đang giữ<strong>${money(held(c))}</strong></div></div><p class="footnote">${c.rentalStart ? `Thời gian: ${esc(new Date(c.rentalStart).toLocaleString("vi-VN"))} → ${esc(new Date(c.rentalEnd).toLocaleString("vi-VN"))}` : ""} · Cọc thỏa thuận ${money(c.depositRequired || 0)}</p><p class="footnote">${c.billingUnit ? `Đơn giá hợp đồng: ${money(c.unitPrice)} / ${esc(c.billingUnit)} · ${c.periods} ${esc(c.billingUnit)}` : ""}</p><h3>Ghi chú bàn giao</h3><p class="note-text">${esc(c.handoverNote || "Chưa có ghi chú")}</p><h3>Ghi chú nhận trả</h3><p class="note-text">${esc(c.returnNote || "Chưa nhận trả")}</p><h3>Lịch sử thu · hoàn tiền</h3>${
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
    `<div class="auth-page-header"><a class="brand" href="#"><i></i>Rentbook</a>${accountHeader()}</div><div class="auth"><div class="auth-story"><div class="brand"><i></i>Rentbook</div><span class="eyebrow">HỆ ĐIỀU HÀNH CHO THUÊ ĐA NGÀNH</span><h2>Tài sản luôn luân chuyển.<br>Vận hành luôn trong tầm tay.</h2><p>Từ lần bàn giao đầu tiên đến lần nhận trả cuối cùng.</p><div class="auth-flow"><span>01 / QUẢN LÝ KHO</span><span>02 / GIAO & NHẬN TRẢ</span><span>03 / TIỀN THUÊ & TIỀN CỌC</span></div></div><section class="panel"><span class="eyebrow">KHÔNG GIAN KINH DOANH CỦA BẠN</span><h1>Đăng nhập bàn điều hành.</h1><p>Không gian riêng cho đơn vị kinh doanh cho thuê của bạn.</p><form id="auth-form">${input("Email", "email", "email")}${input("Mật khẩu", "password", "password", 'minlength="8"')}<p id="auth-message" role="status"></p><button class="primary" name="action" value="signin">Đăng nhập</button><button name="action" value="signup">Tạo tài khoản</button></form></section></div>`;
  document.querySelector("[data-login]")?.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelector("#auth-form [name=email]").focus();
  });
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
    db
      .from("records")
      .select("data,version")
      .eq("organization_id", id)
      .maybeSingle(),
    db.from("licenses").select("*").eq("organization_id", id).maybeSingle(),
  ]);
  for (const x of [o, r, l]) if (x.error) throw x.error;
  org = o.data;
  state = r.data?.data || { assets: [], customers: [], contracts: [] };
  state._revision = r.data?.version ?? 0;
  license = l.data;
  const requests = await db
    .from("rental_requests")
    .select("*")
    .eq("organization_id", id)
    .order("created_at", { ascending: false })
    .limit(requestLimit);
  bookingRequests = Array.isArray(requests.data) ? requests.data : [];
  bookingRequestsError = requests.error?.message || "";
  const pending = await db
    .from("rental_requests")
    .select("*", { count: "exact" })
    .eq("organization_id", id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);
  overviewPending = Array.isArray(pending.data)
    ? pending.data.filter((r) => r.status === "pending")
    : [];
  overviewPendingCount = pending.count ?? overviewPending.length;
  bookingRequestsError ||= pending.error?.message || "";
  for (const r of overviewPending)
    if (!bookingRequests.some((x) => x.id === r.id)) bookingRequests.push(r);

  const storefront = await db
    .from("storefronts")
    .select("*")
    .eq("organization_id", id)
    .maybeSingle();
  storefrontConfig = storefront.error ? null : storefront.data;
  await hydrateImages(state);
}
try {
  const theme = localStorage.getItem("rentbook-theme");
  if (["light", "dark"].includes(theme))
    document.documentElement.dataset.theme = theme;
} catch {}
function init() {
  const publicShop = new URLSearchParams(location.search).get("shop");
  if (publicShop !== null) {
    renderStorefront(db, publicShop);
    return;
  }
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
