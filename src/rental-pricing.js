export function rentalPeriods(start, end, unit) {
  const parse = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || ""))
      throw Error("Ngày thuê không hợp lệ.");
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.toISOString().slice(0, 10) !== value)
      throw Error("Ngày thuê không hợp lệ.");
    return date;
  };
  const a = parse(start),
    b = parse(end);
  if (b < a) throw Error("Ngày kết thúc phải từ ngày bắt đầu trở đi.");
  if (!["ngày", "tháng", "năm"].includes(unit))
    throw Error("Chọn tính theo ngày, tháng hoặc năm.");
  if (unit === "ngày") return (b - a) / 86400000 + 1;
  const addMonths = (months) => {
    const month = a.getUTCMonth() + months;
    const first = new Date(Date.UTC(a.getUTCFullYear(), month, 1));
    const last = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
    return new Date(
      Date.UTC(
        first.getUTCFullYear(),
        first.getUTCMonth(),
        Math.min(a.getUTCDate(), last),
      ),
    );
  };
  const span =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    b.getUTCMonth() -
    a.getUTCMonth();
  const step = unit === "năm" ? 12 : 1;
  let count = Math.max(1, Math.floor(span / step));
  while (addMonths(count * step) <= b) count++;
  return count;
}
export function rentalQuote(start, end, unit, price, quantity) {
  const periods = rentalPeriods(start, end, unit);
  if (
    !Number.isFinite(price) ||
    price < 0 ||
    price > 100000000000 ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10000
  )
    throw Error("Đơn giá hoặc số lượng không hợp lệ.");
  const total = price * quantity * periods;
  if (!Number.isSafeInteger(total))
    throw Error("Tổng tiền vượt giới hạn hoặc đơn giá không phải số nguyên.");
  return { periods, total };
}
