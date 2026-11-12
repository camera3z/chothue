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
  try {
    const { data, error } = await db.rpc("get_public_storefront", {
      p_shop: shopId,
    });
    if (error) throw error;
    if (!data) {
      root.innerHTML =
        '<div class="storefront-loading"><h1>Trang trưng bày chưa mở</h1><p>Shop chưa công khai hoặc hiện không có gói sử dụng còn hạn.</p><a href="/">Về Rentbook</a></div>';
      return;
    }
    const assets = data.assets || [];
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
              `<article class="card acard"><div class="asset-photo">${urls.has(a.imagePath) ? `<img src="${esc(urls.get(a.imagePath))}" alt="${esc(a.name)}" loading="lazy">` : '<span class="asset-photo-placeholder">Chưa có ảnh</span>'}</div><div class="t"><h3>${esc(a.name)}</h3><span class="pill st-ready">Còn ${Number(a.available)} sẵn sàng</span></div><div class="r-sub">${esc(a.category)}</div><div class="pr">${money(a.price)} / ${esc(a.unit)}</div></article>`,
          )
          .join("") ||
        '<div class="empty"><b>Chưa có tài sản phù hợp</b>Thử đổi từ khóa hoặc quay lại sau.</div>'
      );
    }
    root.innerHTML = `<div class="public-storefront"><header class="storefront-header"><a class="brand" href="?shop=${encodeURIComponent(shopId)}"><i></i>${esc(data.name)}</a><a class="btn sm" href="/">Quản trị / Đăng nhập</a></header><section class="storefront-hero"><span class="eyebrow">TÀI SẢN CHO THUÊ</span><h1>Tìm tài sản phù hợp cho bạn</h1><p>Những tài sản hiện còn sẵn sàng tại ${esc(data.name)}.</p></section><div class="filters"><input type="search" id="public-search" placeholder="Tìm tên tài sản, loại hình…" aria-label="Tìm tài sản"><select id="public-category" aria-label="Loại hình"><option value="all">Tất cả loại hình</option>${[...new Set(assets.map((a) => a.category))].map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select></div><div class="grid2" id="public-assets">${cards()}</div><footer>Rentbook · Thông tin khả dụng tại thời điểm tải trang. Vui lòng xác nhận với shop trước khi thuê.</footer></div>`;
    root.querySelector("#public-search").oninput = (e) => {
      query = e.target.value;
      root.querySelector("#public-assets").innerHTML = cards();
    };
    root.querySelector("#public-category").onchange = (e) => {
      category = e.target.value;
      root.querySelector("#public-assets").innerHTML = cards();
    };
  } catch {
    root.innerHTML =
      '<div class="storefront-loading"><h1>Chưa tải được trang trưng bày</h1><p>Vui lòng thử lại sau hoặc liên hệ shop.</p><a href="/">Về Rentbook</a></div>';
  }
}
