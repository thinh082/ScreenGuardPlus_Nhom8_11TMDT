export const DATA_TYPES = [
  {
    id: "email",
    name: "Địa chỉ email",
    short: "Email",
    icon: "mail",
    example: "ten@vidu.com",
    risk: "medium",
    description: "Địa chỉ email cá nhân, học tập và công việc.",
  },
  {
    id: "phone",
    name: "Số điện thoại",
    short: "Điện thoại",
    icon: "phone",
    example: "09xx xxx xxx",
    risk: "medium",
    description: "Số di động và số điện thoại liên hệ.",
  },
  {
    id: "cccd",
    name: "Căn cước công dân",
    short: "CCCD",
    icon: "card",
    example: "012 xxx xxx xxx",
    risk: "high",
    description: "Số định danh cá nhân trên giấy tờ tùy thân.",
  },
  {
    id: "student",
    name: "Mã số sinh viên",
    short: "MSSV",
    icon: "book",
    example: "SV2024xxxx",
    risk: "medium",
    description: "Mã định danh sinh viên trong tài liệu học tập.",
  },
  {
    id: "bank",
    name: "Tài khoản ngân hàng",
    short: "Ngân hàng",
    icon: "bank",
    example: "1903 xxxx xxxx",
    risk: "high",
    description: "Thông tin tài khoản trong giao dịch và biên lai.",
  },
  {
    id: "custom",
    name: "Quy tắc tùy chỉnh",
    short: "Tùy chỉnh",
    icon: "code",
    example: "Keyword / Regex",
    risk: "custom",
    description: "Mở rộng phạm vi với từ khóa hoặc biểu thức riêng.",
  },
];
export const DEFAULT_CONFIG = {
  types: Object.fromEntries(DATA_TYPES.map((t) => [t.id, true])),
  rules: [],
  mode: "auto",
  sensitivity: "balanced",
  language: "vie+eng",
};
const KEY = "screenguard.config.v1";
let memory = structuredClone(DEFAULT_CONFIG);
export function validateConfig(config) {
  if (
    !config ||
    !["auto", "manual"].includes(config.mode) ||
    !["low", "balanced", "high"].includes(config.sensitivity) ||
    !["vie", "eng", "vie+eng"].includes(config.language)
  )
    throw new Error("Cấu hình không hợp lệ.");
  if (
    !config.types ||
    DATA_TYPES.some((t) => typeof config.types[t.id] !== "boolean")
  )
    throw new Error("Loại dữ liệu không hợp lệ.");
  if (!Array.isArray(config.rules) || config.rules.length > 30)
    throw new Error("Tối đa 30 quy tắc tùy chỉnh.");
  const ids = new Set();
  for (const rule of config.rules) {
    if (
      !rule.id ||
      ids.has(rule.id) ||
      typeof rule.enabled !== "boolean" ||
      !["keyword", "regex"].includes(rule.kind) ||
      !["low", "medium", "high"].includes(rule.risk) ||
      typeof rule.name !== "string" ||
      !rule.name.trim() ||
      rule.name.length > 60 ||
      typeof rule.pattern !== "string" ||
      !rule.pattern.trim() ||
      rule.pattern.length > 200
    )
      throw new Error("Quy tắc không hợp lệ (tên ≤ 60, mẫu ≤ 200 ký tự).");
    ids.add(rule.id);
    if (rule.kind === "regex") {
      try {
        new RegExp(rule.pattern, "iu");
      } catch {
        throw new Error("Biểu thức Regex không hợp lệ.");
      }
    }
  }
  return structuredClone(config);
}
export function getDetectionConfig() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) memory = validateConfig(JSON.parse(raw));
  } catch {
    /* Storage blocked or corrupted: keep valid in-memory defaults. */
  }
  return structuredClone(memory);
}
export function updateDetectionConfig(config) {
  memory = validateConfig(config);
  let persisted = false;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(memory));
    persisted = !!globalThis.localStorage;
  } catch {
    /* Session-only fallback. */
  }
  globalThis.dispatchEvent?.(new Event("configchange"));
  return { config: structuredClone(memory), persisted };
}
export function resetDetectionConfig() {
  return updateDetectionConfig(structuredClone(DEFAULT_CONFIG));
}
