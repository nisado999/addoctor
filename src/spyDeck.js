/* The competitor report as a PowerPoint file. pptxgenjs is loaded on click, so it costs nothing until it is used. */

const BLUE = "2563EB", INK = "151412", MUTED = "6F6A62", LINE = "E7E4DE", TINT = "F3F1ED";
const plain = (s) => String(s == null ? "" : s).replace(/\*\*/g, "").trim();
const clip = (s, n) => { const t = plain(s); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };
const fileName = (brand) => `${(plain(brand) || "competitor").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "competitor"}-ad-analysis`;

export async function downloadSpyDeck({ brand, reports, title }) {
  const { default: Pptx } = await import("pptxgenjs");
  const p = new Pptx();
  p.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  p.title = title;
  p.author = "AdDoctor";
  const month = new Date().toLocaleString("en", { month: "long", year: "numeric" });
  const platforms = ["Google", "Meta", "TikTok"].filter((x) => reports[x]);
  const SRC = { Meta: "Meta Ad Library", Google: "Google Ads Transparency Center", TikTok: "TikTok ad library" };
  const note = `Sources: ${platforms.map((x) => SRC[x]).join(", ")}, ${month}. Ad libraries show what is running, not spend or results.`;

  const frame = (s, head) => {
    s.background = { color: "FFFFFF" };
    s.addText(head, { x: 0.6, y: 0.4, w: 12.1, h: 0.8, fontFace: "Arial", fontSize: 28, bold: true, color: BLUE, fit: "shrink" });
    s.addShape(p.ShapeType.line, { x: 0.6, y: 1.25, w: 12.1, h: 0, line: { color: LINE, width: 1 } });
    s.addText(note, { x: 0.6, y: 6.95, w: 10.6, h: 0.35, fontFace: "Arial", fontSize: 9, italic: true, color: MUTED });
    s.addText("AdDoctor", { x: 11.2, y: 6.95, w: 1.5, h: 0.35, fontFace: "Arial", fontSize: 9, bold: true, color: MUTED, align: "right" });
  };
  const bullets = (s, list, opts) => s.addText(
    list.map((b) => ({ text: plain(b), options: { bullet: { indent: 18 }, breakLine: true, paraSpaceAfter: 10 } })),
    { x: 0.6, y: 1.5, w: 12.1, h: 5.3, fontFace: "Arial", fontSize: 24, color: INK, valign: "top", fit: "shrink", ...opts },
  );

  // Title
  const t = p.addSlide();
  t.background = { color: INK };
  t.addText(plain(brand) || "Competitor", { x: 0.8, y: 2.2, w: 11.7, h: 1.2, fontFace: "Arial", fontSize: 48, bold: true, color: "FFFFFF", fit: "shrink" });
  t.addText("Competitor ad analysis", { x: 0.8, y: 3.4, w: 11.7, h: 0.7, fontFace: "Arial", fontSize: 26, color: "7A9BFF" });
  t.addText(`${platforms.join(", ")} · ${month}`, { x: 0.8, y: 4.2, w: 11.7, h: 0.5, fontFace: "Arial", fontSize: 16, color: "A29D94" });

  // One slide of headline bullets per platform
  for (const x of platforms) {
    const r = reports[x];
    if (!r.slide || !r.slide.length) continue;
    const s = p.addSlide();
    frame(s, `${plain(brand) ? plain(brand) + " · " : ""}${x} ads`);
    bullets(s, r.slide.map((b) => clip(b, 260)));
  }

  // The detailed read, one slide per section
  for (const x of platforms) {
    for (const sec of (reports[x].report || []).slice(0, 6)) {
      if (!sec.bullets || !sec.bullets.length) continue;
      const s = p.addSlide();
      frame(s, `${plain(sec.title)}${platforms.length > 1 ? " · " + x : ""}`);
      bullets(s, sec.bullets.slice(0, 7).map((b) => clip(b, 240)), { fontSize: 22 });
    }
  }

  // The ads behind the bullets
  const ads = platforms.flatMap((x) => reports[x].ads || []).slice(0, 6);
  if (ads.length) {
    const s = p.addSlide();
    frame(s, "Ads behind these findings");
    const W = 3.9, H = 2.4, GAP = 0.2;
    ads.forEach((a, i) => {
      const x = 0.6 + (i % 3) * (W + GAP), y = 1.55 + Math.floor(i / 3) * (H + GAP);
      s.addShape(p.ShapeType.roundRect, { x, y, w: W, h: H, rectRadius: 0.1, fill: { color: TINT }, line: { color: LINE, width: 1 } });
      const meta = [a.format, a.creator ? `Creator: ${a.creator}` : "", a.days != null ? `${a.days} days running` : ""].filter(Boolean).join(" · ");
      s.addText(meta, { x: x + 0.2, y: y + 0.15, w: W - 0.4, h: 0.4, fontFace: "Arial", fontSize: 11, bold: true, color: MUTED, fit: "shrink" });
      s.addText(clip(a.headline || "", 140), { x: x + 0.2, y: y + 0.6, w: W - 0.4, h: 1.2, fontFace: "Arial", fontSize: 15, bold: true, color: INK, valign: "top", fit: "shrink" });
      if (a.promos && a.promos[0]) s.addText(plain(a.promos[0].label), { x: x + 0.2, y: y + 1.85, w: W - 0.4, h: 0.4, fontFace: "Arial", fontSize: 12, bold: true, color: "B45309" });
    });
  }

  // What to do about it
  const insights = platforms.flatMap((x) => reports[x].insights || []);
  if (insights.length) {
    const s = p.addSlide();
    frame(s, "What this may mean for you");
    bullets(s, insights.slice(0, 6).map((b) => clip(b, 240)));
  }

  await p.writeFile({ fileName: `${fileName(brand)}.pptx` });
}
