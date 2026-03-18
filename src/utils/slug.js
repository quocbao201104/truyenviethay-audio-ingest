const slugify = require("slugify");

const normalizeVietnameseForSlug = (value) =>
  String(value || "")
    .replace(/Đ/g, "D")
    .replace(/đ/g, "d");

const toSlug = (value) =>
  slugify(normalizeVietnameseForSlug(value), {
    lower: true,
    strict: true,
    remove: /[*+~.()'"!:@[\]|,/]/g,
    trim: true,
  });

const normalizeText = (value) =>
  normalizeVietnameseForSlug(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

module.exports = {
  toSlug,
  normalizeText,
};
