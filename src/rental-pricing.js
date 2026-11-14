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
  const days = (b - a) / 86400000 + 1;
  return days / (unit === "tháng" ? 30 : unit === "năm" ? 365 : 1);
}
export function rentalQuote(start, end, unit, price, quantity) {
  const periods = rentalPeriods(start, end, unit);
  if (
    !Number.isSafeInteger(price) ||
    price < 0 ||
    price > 100000000000 ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10000
  )
    throw Error("Đơn giá hoặc số lượng không hợp lệ.");
  const total = Math.round(price * quantity * periods);
  if (!Number.isSafeInteger(total))
    throw Error("Tổng tiền vượt giới hạn hoặc đơn giá không phải số nguyên.");
  return { periods, total };
}
