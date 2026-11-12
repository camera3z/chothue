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
  const start = new Date(Date.now() + 3600000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 86400000);
  dialog.innerHTML = `<form><div class="modal-title"><h2>Đặt thuê · ${esc(asset.name)}</h2><button type="button" data-close aria-label="Đóng">×</button></div><p class="footnote">Đây là yêu cầu chờ shop xác nhận, chưa giữ chỗ và chưa phát sinh thanh toán.</p><label>Họ tên<input name="name" required minlength="2" maxlength="120" autocomplete="name"></label><label>Số điện thoại<input name="phone" type="tel" required minlength="9" maxlength="24" autocomplete="tel"></label><div class="form-grid"><label>Bắt đầu<input type="datetime-local" name="start" required value="${localInput(start)}"></label><label>Kết thúc<input type="datetime-local" name="end" required value="${localInput(end)}"></label></div><label>Số lượng<input name="quantity" type="number" required min="1" max="10000" step="1" value="1"></label><label>Ghi chú<textarea name="note" maxlength="1500" placeholder="Địa chỉ giao, phụ kiện hoặc nhu cầu của bạn…"></textarea></label><div class="booking-honeypot" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div><label class="chk"><input type="checkbox" required name="consent">Tôi đồng ý gửi thông tin để shop liên hệ xác nhận yêu cầu thuê.</label><p class="booking-estimate" role="status"></p><p class="booking-error" role="alert"></p><div class="modal-actions"><button type="button" data-close>Hủy</button><button class="primary" type="submit">Gửi yêu cầu thuê</button></div></form>`;
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog
    .querySelectorAll("[data-close]")
    .forEach((b) => (b.onclick = () => dialog.close()));
  const form = dialog.querySelector("form"),
    estimate = dialog.querySelector(".booking-estimate"),
    error = dialog.querySelector(".booking-error");
  function calculate() {
    const d = Object.fromEntries(new FormData(form));
    const duration = new Date(d.end) - new Date(d.start);
    if (duration <= 0) {
      estimate.textContent = "Ngày kết thúc phải sau ngày bắt đầu.";
      return;
    }
    const ms =
      {
        giờ: 3600000,
        ngày: 86400000,
        tuần: 604800000,
        tháng: 2592000000,
        lượt: duration,
      }[asset.unit] || 86400000;
    const price =
      Math.ceil(duration / ms) * Number(asset.price) * Number(d.quantity);
    estimate.textContent =
      "Tiền thuê dự kiến: " +
      new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
      }).format(price) +
      " · Chưa gồm cọc, giao nhận và phụ phí. Giá tháng tạm tính 30 ngày; shop sẽ xác nhận lại.";
  }
  form.addEventListener("input", calculate);
  calculate();
  form.onsubmit = async (event) => {
    event.preventDefault();
    const b = event.submitter;
    b.disabled = true;
    error.textContent = "";
    try {
      const d = Object.fromEntries(new FormData(form));
      const starts = new Date(d.start),
        ends = new Date(d.end);
      if (
        !Number.isFinite(starts.getTime()) ||
        !Number.isFinite(ends.getTime()) ||
        ends <= starts
      )
        throw Error("Thời gian thuê không hợp lệ.");
      if (
        !/^\+?[0-9\s().-]{9,24}$/.test(d.phone) ||
        d.phone.replace(/\D/g, "").length < 9
      )
        throw Error("Vui lòng kiểm tra số điện thoại.");
      const { data, error: err } = await db.rpc("submit_rental_request", {
        p_shop: shop,
        p_request: token,
        p_asset: asset.id,
        p_name: d.name.trim(),
        p_phone: d.phone,
        p_start: starts.toISOString(),
        p_end: ends.toISOString(),
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
      form.innerHTML = `<div class="modal-title"><h2>Đã gửi yêu cầu</h2></div><p>Shop sẽ liên hệ số điện thoại bạn đã cung cấp để thỏa thuận và duyệt.</p><p class="code">Mã yêu cầu: ${esc(data.id)}</p><p class="footnote">Yêu cầu chưa giữ chỗ. Không cần gửi lại nếu bạn đã thấy mã xác nhận.</p>${data.cancel_token ? `<label>Liên kết riêng để theo dõi / hủy yêu cầu<input readonly value="${esc(follow.href)}"></label><p class="footnote">Lưu liên kết này và giữ riêng. Bạn có thể tự hủy khi shop chưa duyệt.</p><a class="btn" target="_blank" rel="noopener" href="${esc(follow.href)}">Theo dõi yêu cầu</a>` : ""}<button class="btn pri" type="button">Đóng</button>`;
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
