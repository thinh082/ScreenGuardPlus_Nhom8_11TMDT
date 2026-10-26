// Fixed fictional fixture. Never use these findings for an arbitrary imported image.
export const DEMO_ID = "screenguard-contact-fixture-v1";
export const SAMPLE_FINDINGS = [
  {
    id: "demo-email",
    type: "email",
    label: "Địa chỉ email",
    text: "minhan.demo@example.com",
    risk: "medium",
    box: { x: 280, y: 216, width: 426, height: 42 },
  },
  {
    id: "demo-phone",
    type: "phone",
    label: "Số điện thoại",
    text: "0900 000 000",
    risk: "medium",
    box: { x: 280, y: 286, width: 260, height: 42 },
  },
  {
    id: "demo-cccd",
    type: "cccd",
    label: "Căn cước công dân",
    text: "000 000 000 000",
    risk: "high",
    box: { x: 280, y: 356, width: 290, height: 42 },
  },
  {
    id: "demo-student",
    type: "student",
    label: "Mã số sinh viên",
    text: "SV20240000",
    risk: "medium",
    box: { x: 280, y: 426, width: 250, height: 42 },
  },
  {
    id: "demo-bank",
    type: "bank",
    label: "Tài khoản ngân hàng",
    text: "0000 0000 0000",
    risk: "high",
    box: { x: 280, y: 496, width: 280, height: 42 },
  },
];
export function mockScan(fixtureId, config) {
  if (fixtureId !== DEMO_ID)
    throw new Error("Mock Scanner chỉ xử lý ảnh mẫu tích hợp.");
  return {
    status: "demo",
    source: "mock",
    width: 960,
    height: 640,
    findings: structuredClone(
      SAMPLE_FINDINGS.filter((f) => config.types[f.type]),
    ),
    message: "Dữ liệu mẫu cố định, không phải kết quả OCR.",
  };
}
export function createDemoCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 640;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#edf2f5";
  ctx.fillRect(0, 0, 960, 640);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(32, 28, 896, 584);
  ctx.fillStyle = "#113b40";
  ctx.fillRect(32, 28, 896, 116);
  ctx.fillStyle = "#72eed0";
  ctx.font = "bold 18px system-ui";
  ctx.fillText("SCREENGUARD+ / TÀI LIỆU MINH HỌA", 68, 66);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px system-ui";
  ctx.fillText("Thông tin liên hệ", 68, 110);
  ctx.fillStyle = "#64748b";
  ctx.font = "16px system-ui";
  ctx.fillText(
    "Nhân vật: Minh An  •  Tất cả thông tin dưới đây là hư cấu",
    68,
    180,
  );
  const labels = [
    "Email",
    "Điện thoại",
    "Số CCCD",
    "Mã sinh viên",
    "Tài khoản",
  ];
  SAMPLE_FINDINGS.forEach((finding, i) => {
    const y = 244 + i * 70;
    ctx.fillStyle = "#64748b";
    ctx.font = "18px system-ui";
    ctx.fillText(labels[i], 68, y);
    ctx.fillStyle = "#16343c";
    ctx.font = "bold 23px system-ui";
    ctx.fillText(finding.text, 290, y);
    ctx.fillStyle = "#edf2f5";
    ctx.fillRect(68, y + 22, 820, 1);
  });
  ctx.fillStyle = "#64748b";
  ctx.font = "14px system-ui";
  ctx.fillText(
    "ẢNH MẪU CỐ ĐỊNH · KHÔNG SỬ DỤNG CHO GIAO DỊCH HAY ĐỊNH DANH",
    68,
    584,
  );
  return canvas;
}
