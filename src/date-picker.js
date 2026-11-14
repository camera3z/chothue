const pad = (n) => String(n).padStart(2, "0");
const key = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;
const today = () => {
  const d = new Date();
  return key(d.getFullYear(), d.getMonth(), d.getDate());
};
export function mountDatePickers(form) {
  for (const input of form.querySelectorAll("input[type=date]")) {
    if (input.dataset.calendarMounted) return;
    input.dataset.calendarMounted = "true";
    const wrap = document.createElement("span");
    wrap.className = "date-control";
    input.replaceWith(wrap);
    wrap.append(input);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "date-open";
    button.setAttribute(
      "aria-label",
      "Mở lịch " + (input.name === "end" ? "ngày kết thúc" : "ngày bắt đầu"),
    );
    button.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>';
    wrap.append(button);
    const open = (e) => {
      e.preventDefault();
      if (!input.disabled) openCalendar(input);
    };
    button.onclick = open;
    input.addEventListener("pointerdown", (e) => {
      if (e.button === 0) e.preventDefault();
    });
    input.addEventListener("click", open);
    input.addEventListener("keydown", (e) => {
      if ((e.altKey && e.key === "ArrowDown") || e.key === "F4") open(e);
    });
  }
}
function openCalendar(input) {
  if (document.querySelector(".calendar-picker[open]")) return;
  const owner = input.closest("dialog"),
    popup = document.createElement("dialog");
  popup.className = "calendar-picker";
  popup.setAttribute("aria-label", "Chọn ngày");
  let selected = input.value;
  let [year, month] = (selected || today()).split("-").map(Number);
  month--;
  let accepted = false;
  const allowed = (value) =>
    (!input.min || value >= input.min) && (!input.max || value <= input.max);
  const position = () => {
    const rect = input.getBoundingClientRect(),
      width = popup.offsetWidth,
      height = popup.offsetHeight;
    popup.style.left =
      Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + "px";
    popup.style.top =
      Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - height - 8)) +
      "px";
  };
  const render = () => {
    const first = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7,
      days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const thisYear = new Date().getFullYear();
    const low = Math.max(100, Math.min(year, thisYear) - 100),
      high = Math.min(9999, Math.max(year, thisYear) + 100);
    popup.innerHTML = `<div class="calendar-heading"><button type="button" data-prev aria-label="Tháng trước">‹</button><select data-month aria-label="Chọn tháng">${Array.from({ length: 12 }, (_, m) => `<option value="${m}" ${m === month ? "selected" : ""}>Tháng ${m + 1}</option>`).join("")}</select><select data-year aria-label="Chọn năm">${Array.from({ length: high - low + 1 }, (_, i) => `<option value="${low + i}" ${low + i === year ? "selected" : ""}>${low + i}</option>`).join("")}</select><button type="button" data-next aria-label="Tháng sau">›</button><button type="button" data-dismiss aria-label="Đóng lịch">×</button></div><div class="calendar-weekdays">${["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => `<span>${d}</span>`).join("")}</div><div class="calendar-days">${"<span></span>".repeat(first)}${Array.from(
      { length: days },
      (_, i) => {
        const value = key(year, month, i + 1);
        return `<button type="button" data-day="${value}" aria-label="${i + 1}/${month + 1}/${year}" aria-pressed="${selected === value}" ${!allowed(value) ? "disabled" : ""} class="${value === today() ? "is-today" : ""}">${i + 1}</button>`;
      },
    ).join(
      "",
    )}</div><div class="calendar-actions"><button type="button" data-clear>Xóa</button><button type="button" data-today ${allowed(today()) ? "" : "disabled"}>Hôm nay</button><button type="button" data-confirm>Chọn</button></div>`;
    position();
  };
  popup.onclick = (e) => {
    const button = e.target.closest("button");
    if (!button) {
      if (e.target === popup) {
        const r = popup.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          popup.close();
      }
      return;
    }
    if (button.hasAttribute("data-dismiss")) {
      popup.close();
      return;
    }
    if (button.hasAttribute("data-confirm")) {
      accepted = true;
      input.value = selected;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      popup.close();
      return;
    }
    if (button.dataset.day) {
      selected = button.dataset.day;
      render();
      popup.querySelector(`[data-day="${selected}"]`).focus();
      return;
    }
    if (button.hasAttribute("data-clear")) selected = "";
    else if (button.hasAttribute("data-today")) {
      selected = today();
      [year, month] = selected.split("-").map(Number);
      month--;
    } else {
      month += button.hasAttribute("data-prev") ? -1 : 1;
      if (month < 0) {
        month = 11;
        year--;
      }
      if (month > 11) {
        month = 0;
        year++;
      }
      year = Math.max(100, Math.min(9999, year));
    }
    render();
  };
  popup.onchange = (e) => {
    if (e.target.matches("[data-month]")) month = Number(e.target.value);
    if (e.target.matches("[data-year]")) year = Number(e.target.value);
    render();
  };
  popup.onkeydown = (e) => {
    if (!e.target.matches("[data-day]")) return;
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
      e.key
    ];
    if (!delta) return;
    e.preventDefault();
    const d = new Date((selected || e.target.dataset.day) + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + delta);
    const value = key(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (!allowed(value)) return;
    selected = value;
    year = d.getUTCFullYear();
    month = d.getUTCMonth();
    render();
    popup.querySelector(`[data-day="${selected}"]`)?.focus();
  };
  const close = () => {
    if (popup.open) popup.close();
  };
  popup.addEventListener(
    "close",
    () => {
      window.removeEventListener("resize", position);
      owner?.removeEventListener("close", close);
      popup.remove();
      if (input.isConnected) input.focus();
      if (accepted && input.value === "") input.reportValidity();
    },
    { once: true },
  );
  owner?.addEventListener("close", close);
  document.body.append(popup);
  popup.showModal();
  render();
  window.addEventListener("resize", position);
  popup
    .querySelector(selected ? `[data-day="${selected}"]` : "[data-confirm]")
    ?.focus();
}
