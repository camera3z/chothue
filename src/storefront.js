import {
  openBookingRequest,
  showPublicRequestStatus,
} from "./booking-request.js";
export async function renderStorefront(db, shopId) {
  const root = document.querySelector("#app");
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const money = (n) =>
    new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(n);
  root.innerHTML =
    '<div class="storefront-loading" role="status">Đang tải tài sản cho thuê…</div>';
  if (!db) {
    root.innerHTML =
      '<div class="storefront-loading">Trang trưng bày cần kết nối Supabase.</div>';
    return;
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      shopId,
    )
  ) {
    root.textContent = "Đường dẫn shop không hợp lệ.";
    return;
  }
  await showPublicRequestStatus(db, shopId);
  const onRequestLink = () => {
    if (!document.querySelector(".request-status-dialog"))
      showPublicRequestStatus(db, shopId);
  };
  window.addEventListener("hashchange", onRequestLink);
  window.addEventListener(
    "pagehide",
    () => window.removeEventListener("hashchange", onRequestLink),
    { once: true },
  );
  try {
    const { data, error } = await db.rpc("get_public_storefront", {
      p_shop: shopId,
    });
    if (error) throw error;
    if (!data) {
      root.innerHTML =
        '<div class="storefront-loading"><h1>Trang trưng bày chưa mở</h1><p>Shop chưa công khai hoặc hiện không có gói sử dụng còn hạn.</p></div>';
      return;
    }
    let assets = (data.assets || []).filter((a) => Number(a.available) > 0);
    const urls = new Map();
    const paths = assets
      .map((a) => a.imagePath)
      .filter((p) => typeof p === "string" && p.startsWith(shopId + "/"));
    if (paths.length) {
      const result = await db.storage
        .from("asset-images")
        .createSignedUrls([...new Set(paths)], 3600);
      for (const item of result.data || [])
        if (item.signedUrl) urls.set(item.path, item.signedUrl);
    }
    let query = "",
      category = "all";
    function cards() {
      const filtered = assets.filter(
        (a) =>
          (category === "all" || a.category === category) &&
          `${a.name} ${a.category}`.toLowerCase().includes(query.toLowerCase()),
      );
      return (
        filtered
          .map(
            (a) =>
              `<article class="card acard"><div class="asset-photo">${urls.has(a.imagePath) ? `<img src="${esc(urls.get(a.imagePath))}" alt="${esc(a.name)}" loading="lazy">` : '<span class="asset-photo-placeholder">Chưa có ảnh</span>'}</div><div class="t"><h3 title="${esc(a.name)}">${esc(a.name)}</h3><span class="pill st-ready">Số lượng còn: ${Number(a.available)}</span></div><div class="r-sub">${esc(a.category)}</div><div class="pr">${money(a.price)} / ${esc(a.unit)}</div><button class="btn pri" data-book="${esc(a.id)}">Đặt thuê</button></article>`,
          )
          .join("") ||
        '<div class="empty"><b>Chưa có tài sản phù hợp</b>Thử đổi từ khóa hoặc quay lại sau.</div>'
      );
    }
    root.innerHTML = `<div class="public-storefront"><header class="storefront-header"><a class="brand" href="?shop=${encodeURIComponent(shopId)}"><i></i>${esc(data.name)}</a></header><section class="storefront-hero"><span class="eyebrow">TÀI SẢN CHO THUÊ</span><h1>Tìm tài sản phù hợp cho bạn</h1><p>Những tài sản hiện còn sẵn sàng tại ${esc(data.name)}.</p></section><div class="filters"><input type="search" id="public-search" placeholder="Tìm tên tài sản, loại hình…" aria-label="Tìm tài sản"><select id="public-category" aria-label="Loại hình"><option value="all">Tất cả loại hình</option>${[...new Set(assets.map((a) => a.category))].map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select></div><div class="grid2" id="public-assets">${cards()}</div><footer>Rentbook · Tự cập nhật mỗi 30 giây. Vui lòng xác nhận với shop trước khi thuê.</footer></div>`;
    root.querySelector("#public-search").oninput = (e) => {
      query = e.target.value;
      root.querySelector("#public-assets").innerHTML = cards();
    };
    root.querySelector("#public-category").onchange = (e) => {
      category = e.target.value;
      root.querySelector("#public-assets").innerHTML = cards();
    };
    let bookingDialog = null;
    let bookingRevision = 0;
    let refreshAfterClose = false;
    root.querySelector("#public-assets").onclick = (e) => {
      const button = e.target.closest("[data-book]");
      if (button) {
        const asset = assets.find((a) => a.id === button.dataset.book);
        if (asset) {
          bookingRevision++;
          bookingDialog = openBookingRequest(db, shopId, asset);
          bookingDialog.addEventListener("close", () => {
            bookingDialog = null;
            refreshAfterClose = true;
            refresh();
          }, { once: true });
        }
      }
    };
    let refreshing = false;
    let imageExpiry = Date.now() + 45 * 60000;
    const refresh = async () => {
      if (refreshing || document.hidden || bookingDialog?.open) return;
      refreshAfterClose = false;
      const revision = bookingRevision;
      refreshing = true;
      try {
        const response = await db.rpc("get_public_storefront", {
          p_shop: shopId,
        });
        if (bookingDialog?.open || revision !== bookingRevision) return;
        if (response.error) throw response.error;
        if (!response.data) {
          assets = [];
          root.querySelector("#public-assets").innerHTML =
            '<div class="empty"><b>Trang trưng bày tạm đóng</b>Vui lòng quay lại sau.</div>';
          return;
        }
        assets = (response.data.assets || []).filter(
          (a) => Number(a.available) > 0,
        );
        if (Date.now() > imageExpiry) {
          urls.clear();
          imageExpiry = Date.now() + 45 * 60000;
        }
        const paths = assets
          .map((a) => a.imagePath)
          .filter(
            (p) =>
              typeof p === "string" &&
              p.startsWith(shopId + "/") &&
              !urls.has(p),
          );
        if (paths.length) {
          const images = await db.storage
            .from("asset-images")
            .createSignedUrls([...new Set(paths)], 3600);
          for (const item of images.data || [])
            if (item.signedUrl) urls.set(item.path, item.signedUrl);
        }
        if (bookingDialog?.open || revision !== bookingRevision) return;
        const categories = [...new Set(assets.map((a) => a.category))];
        if (category !== "all" && !categories.includes(category))
          category = "all";
        const select = root.querySelector("#public-category");
        select.innerHTML =
          '<option value="all">Tất cả loại hình</option>' +
          categories
            .map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)
            .join("");
        select.value = category;
        root.querySelector(".storefront-header .brand").innerHTML =
          "<i></i>" + esc(response.data.name);
        root.querySelector("#public-assets").innerHTML = cards();
        root.querySelector("footer").textContent =
          "Rentbook · Tự cập nhật mỗi 30 giây. Vui lòng xác nhận với shop trước khi thuê.";
      } catch {
        if (bookingDialog?.open || revision !== bookingRevision) return;
        root.querySelector("footer").textContent =
          "Chưa cập nhật được tình trạng mới nhất. Vui lòng tải lại trang hoặc liên hệ shop.";
      } finally {
        refreshing = false;
        if (refreshAfterClose && !bookingDialog?.open && !document.hidden) refresh();
      }
    };
    const interval = setInterval(refresh, 30000);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(
      "pagehide",
      () => {
        clearInterval(interval);
        document.removeEventListener("visibilitychange", onVisible);
      },
      { once: true },
    );
  } catch {
    root.innerHTML =
      '<div class="storefront-loading"><h1>Chưa tải được trang trưng bày</h1><p>Vui lòng thử lại sau hoặc liên hệ shop.</p></div>';
  }
}
