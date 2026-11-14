import { mountDatePickers } from "./date-picker.js";
import { rentalQuote, listingUnitPrice } from "./rental-pricing.js";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const localInput = (d) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};
export function openBookingRequest(db, shop, asset) {
  const dialog = document.createElement("dialog");
  dialog.className = "booking-request-dialog";
  const token = crypto.randomUUID();
  const date = new Date();
  const selectedToday = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const initialUnit = ["ngày", "tháng", "năm", "lượt"].includes(asset.unit)
    ? asset.unit
    : "ngày";
  dialog.innerHTML = `<form><div class="modal-title"><h2>Đặt thuê · ${esc(asset.name)}</h2><button type="button" data-close aria-label="Đóng">×</button></div><p class="footnote">Đây là yêu cầu chờ shop xác nhận, chưa giữ chỗ và chưa phát sinh thanh toán.</p><label>Họ tên<input name="name" required minlength="2" maxlength="120" autocomplete="name"></label><label>Số điện thoại<input name="phone" type="tel" required minlength="9" maxlength="24" autocomplete="tel"></label><label>Địa chỉ<textarea name="address" maxlength="500" autocomplete="street-address" placeholder="Số nhà, đường, phường/xã, tỉnh/thành…"></textarea></label><div class="form-grid"><label>Ngày bắt đầu<input type="date" name="start" required min="${selectedToday}" value="${selectedToday}"></label><label>Ngày kết thúc<input type="date" name="end" required min="${selectedToday}" value="${selectedToday}"></label></div><label>Số lượng tài sản<input name="quantity" type="number" required min="1" max="10000" step="1" value="1"></label><div class="form-grid"><label>Đơn giá niêm yết (khách không sửa)<span class="currency-control"><input name="listedPrice" type="text" readonly><span class="currency-suffix" aria-hidden="true">₫</span></span></label><label>Tính theo<select name="billingUnit">${(asset.unit === "lượt" ? ["lượt"] : ["ngày", "tháng", "năm"]).map((u) => `<option ${u === initialUnit ? "selected" : ""}>${u}</option>`).join("")}</select></label></div><label id="public-periods-field" hidden><span data-public-period-label>Số tháng thuê</span><input name="billingPeriods" type="number" min="0.01" max="10000" step="0.01" value="1" disabled></label><div class="summary-box booking-estimate" role="status"></div><p class="footnote" id="public-price-note"></p><label>Ghi chú<textarea name="note" maxlength="1500" placeholder="Phụ kiện hoặc nhu cầu của bạn…"></textarea></label><div class="booking-honeypot" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div><label class="chk"><input type="checkbox" required name="consent">Tôi đồng ý gửi thông tin để shop liên hệ xác nhận yêu cầu thuê.</label><p class="booking-error" role="alert"></p><div class="modal-actions"><button type="button" data-close>Hủy</button><button class="primary" type="submit">Gửi yêu cầu thuê</button></div></form>`;
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog
    .querySelectorAll("[data-close]")
    .forEach((b) => (b.onclick = () => dialog.close()));
  const form = dialog.querySelector("form"),
    estimate = dialog.querySelector(".booking-estimate"),
    error = dialog.querySelector(".booking-error");
  function calculate() {
    const unit = form.querySelector("[name=billingUnit]").value,
      manual = unit !== "ngày";
    const field = form.querySelector("[name=billingPeriods]");
    form.querySelector("#public-periods-field").hidden = !manual;
    field.disabled = !manual;
    field.required = manual;
    form.querySelector("[data-public-period-label]").textContent =
      unit === "năm"
        ? "Số năm thuê"
        : unit === "lượt"
          ? "Số lượt thuê"
          : "Số tháng thuê";
    form.querySelector("#public-price-note").textContent =
      (manual
        ? "Tiền thuê tính theo số kỳ bạn nhập; lịch chỉ dùng cho giao–trả và kiểm tra tồn. "
        : "Tiền thuê tính theo lịch, gồm cả ngày kết thúc. ") +
      "Đơn giá quy đổi từ giá niêm yết theo 1 tháng = 30 ngày, 1 năm = 365 ngày. Đây là giá dự kiến, shop sẽ xác nhận thỏa thuận và khoản trả trước sau.";
    try {
      const d = Object.fromEntries(new FormData(form));
      const price = listingUnitPrice(asset, unit);
      form.querySelector("[name=listedPrice]").value = new Intl.NumberFormat(
        "vi-VN",
      ).format(price);
      const q =
        unit === "lượt"
          ? {
              periods: Number(d.billingPeriods),
              total: Math.round(
                price * Number(d.quantity) * Number(d.billingPeriods),
              ),
            }
          : rentalQuote(
              d.start,
              d.end,
              unit,
              price,
              Number(d.quantity),
              manual ? Number(d.billingPeriods) : undefined,
            );
      if (!Number.isFinite(q.periods) || q.periods <= 0)
        throw Error("Hãy nhập số kỳ thuê.");
      const fmt = (n) =>
        new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n);
      estimate.innerHTML = `<strong class="contract-formula">${fmt(q.periods)} ${esc(unit)} × ${fmt(price)}đ${Number(d.quantity) > 1 ? ` × ${Number(d.quantity)} tài sản` : ""} = <span>${fmt(q.total)}đ</span></strong>`;
    } catch (err) {
      estimate.textContent = err.message;
    }
  }
  mountDatePickers(form);
  form.addEventListener("input", calculate);
  form.addEventListener("change", calculate);
  calculate();
  form.onsubmit = async (event) => {
    event.preventDefault();
    const b = event.submitter;
    b.disabled = true;
    error.textContent = "";
    try {
      const d = Object.fromEntries(new FormData(form));
      const starts = new Date(d.start + "T00:00:00"),
        ends = new Date(d.end + "T00:00:00");
      if (
        !Number.isFinite(starts.getTime()) ||
        !Number.isFinite(ends.getTime()) ||
        ends < starts
      )
        throw Error("Thời gian thuê không hợp lệ.");
      if (
        !/^\+?[0-9\s().-]{9,24}$/.test(d.phone) ||
        d.phone.replace(/\D/g, "").length < 9
      )
        throw Error("Vui lòng kiểm tra số điện thoại.");
      const { data, error: err } = await db.rpc("submit_rental_request_v2", {
        p_shop: shop,
        p_request: token,
        p_asset: asset.id,
        p_name: d.name.trim(),
        p_phone: d.phone,
        p_address: d.address.trim(),
        p_start_date: d.start,
        p_end_date: d.end,
        p_billing_unit: d.billingUnit,
        p_periods: d.billingUnit === "ngày" ? null : Number(d.billingPeriods),
        p_quantity: Number(d.quantity),
        p_note: d.note,
        p_website: d.website,
      });
      if (err) throw err;
      const follow = new URL(location.href);
      follow.hash = new URLSearchParams({
        request: data.id,
        key: data.cancel_token || "",
      }).toString();
      form.innerHTML = `<div class="modal-title"><h2>Đã gửi yêu cầu</h2></div><p>Shop sẽ liên hệ số điện thoại bạn đã cung cấp để thỏa thuận và duyệt.</p><p class="code">Mã yêu cầu: ${esc(data.id)}</p>${Number.isFinite(Number(data.estimated_total)) ? `<p>Giá dự kiến từ shop: ${new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(Number(data.estimated_total))}</p>` : ""}<p class="footnote">Yêu cầu chưa giữ chỗ. Không cần gửi lại nếu bạn đã thấy mã xác nhận.</p>${data.cancel_token ? `<label>Liên kết riêng để theo dõi / hủy yêu cầu<input readonly value="${esc(follow.href)}"></label><p class="footnote">Lưu liên kết này và giữ riêng. Bạn có thể tự hủy khi shop chưa duyệt.</p><a class="btn" target="_blank" rel="noopener" href="${esc(follow.href)}">Theo dõi yêu cầu</a>` : ""}<button class="btn pri" type="button">Đóng</button>`;
      form.querySelector("button").onclick = () => dialog.close();
    } catch (err) {
      error.textContent =
        err.message || "Chưa gửi được yêu cầu. Vui lòng thử lại.";
      b.disabled = false;
    }
  };
  dialog.showModal();
}
export { localInput };

export async function showPublicRequestStatus(db, shop) {
  const params = new URLSearchParams(location.hash.slice(1));
  const id = params.get("request"),
    token = params.get("key");
  if (!id || !token) return;
  const dialog = document.createElement("dialog");
  dialog.className = "request-status-dialog";
  dialog.innerHTML =
    '<h2>Trạng thái yêu cầu</h2><p role="status">Đang kiểm tra…</p>';
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  try {
    const { data, error } = await db.rpc("public_rental_request_status", {
      p_shop: shop,
      p_request: id,
      p_token: token,
    });
    if (error || !data)
      throw Error("Liên kết không hợp lệ hoặc yêu cầu không tồn tại.");
    const labels = {
      pending: "Chờ shop duyệt",
      approved: "Shop đã duyệt — vui lòng liên hệ để xác nhận bàn giao",
      rejected: "Shop đã từ chối yêu cầu",
      cancelled: "Yêu cầu đã hủy",
    };
    dialog.innerHTML = `<h2>Trạng thái yêu cầu</h2><p role="status">${esc(labels[data] || data)}</p><p class="code">${esc(id)}</p><div class="modal-actions">${data === "pending" ? '<button class="btn" data-cancel-request>Hủy yêu cầu thuê</button>' : ""}<button class="btn" data-close-status>Đóng</button></div><p class="booking-error" role="alert"></p>`;
    dialog
      .querySelector("[data-cancel-request]")
      ?.addEventListener("click", async (e) => {
        const button = e.target;
        if (!button.dataset.confirm) {
          button.dataset.confirm = "true";
          button.textContent = "Bấm lần nữa để xác nhận hủy";
          return;
        }
        button.disabled = true;
        try {
          const result = await db.rpc("cancel_public_rental_request", {
            p_shop: shop,
            p_request: id,
            p_token: token,
          });
          if (result.error) throw result.error;
          dialog.querySelector("[role=status]").textContent = "Yêu cầu đã hủy";
          button.remove();
        } catch (err) {
          dialog.querySelector("[role=alert]").textContent = err.message;
          button.disabled = false;
        }
      });
  } catch (err) {
    dialog.innerHTML = `<h2>Không mở được yêu cầu</h2><p>${esc(err.message)}</p><button class="btn" data-close-status>Đóng</button>`;
  }
  dialog.querySelector("[data-close-status]").onclick = () => {
    history.replaceState(null, "", location.pathname + location.search);
    dialog.close();
  };
}
