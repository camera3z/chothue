export function parseMoneyInput(value, editing = false) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const clean = text.replace(/(?:₫|đ|VND)\s*$/i, "").trim();
  if (
    !editing &&
    !(
      /^\d+$/.test(clean) ||
      /^\d{1,3}(?:\.\d{3})+$/.test(clean) ||
      /^\d{1,3}(?:,\d{3})+$/.test(clean) ||
      /^\d{1,3}(?:[\s\u00a0]\d{3})+$/.test(clean)
    )
  )
    throw Error("Nhập số tiền nguyên, ví dụ 300.000 hoặc 300000.");
  const raw = clean.replace(/[.,\s\u00a0]/g, "");
  if (!/^\d+$/.test(raw))
    throw Error("Chỉ nhập số tiền nguyên, không nhập số âm hoặc ký tự khác.");
  const amount = Number(raw);
  if (!Number.isSafeInteger(amount)) throw Error("Số tiền quá lớn.");
  return String(amount);
}
export function formatMoneyInput(value) {
  const raw = parseMoneyInput(value);
  return raw === "" ? "" : raw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
export function readMoneyForm(form) {
  const values = Object.fromEntries(new FormData(form));
  for (const field of form.querySelectorAll("[data-money]"))
    values[field.name] = parseMoneyInput(field.value);
  return values;
}
export function mountMoneyInputs(form) {
  for (const field of form.querySelectorAll("[data-money]")) {
    const sync = () => {
      const cursor = field.selectionStart ?? field.value.length;
      const digitsBefore = field.value
        .slice(0, cursor)
        .replace(/\D/g, "").length;
      try {
        const raw = parseMoneyInput(field.value, true);
        const n = Number(raw);
        const min = Number(field.getAttribute("min") || 0);
        const max = Number(
          field.getAttribute("max") || Number.MAX_SAFE_INTEGER,
        );
        field.setCustomValidity(
          raw !== "" && (n < min || n > max)
            ? `Số tiền phải từ ${formatMoneyInput(min)} đến ${formatMoneyInput(max)} ₫.`
            : "",
        );
        field.value = formatMoneyInput(raw);
        if (document.activeElement === field) {
          let at = 0,
            count = 0;
          while (at < field.value.length && count < digitsBefore) {
            if (/\d/.test(field.value[at])) count++;
            at++;
          }
          field.setSelectionRange(at, at);
        }
      } catch (error) {
        field.setCustomValidity(error.message);
      }
    };
    field.addEventListener("paste", (e) => {
      e.preventDefault();
      try {
        const value = parseMoneyInput(e.clipboardData.getData("text"));
        field.setRangeText(
          value,
          field.selectionStart,
          field.selectionEnd,
          "end",
        );
        field.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (error) {
        field.setCustomValidity(error.message);
        field.reportValidity();
      }
    });
    field.addEventListener("input", sync);
    field.addEventListener("blur", sync);
    sync();
  }
}
