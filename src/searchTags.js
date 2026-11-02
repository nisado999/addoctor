/* Template search: people type what an ad shows ("phone", "shoes", "tier list"), while the template text says it in
   other words ("lock screen notification", "sneakers", "ranked tiers"). Each word in a group also matches the others. */

// Words that say nothing about the ad itself.
export const STOP = new Set(["template", "templates", "ad", "ads", "creative", "creatives", "a", "an", "the", "of", "for", "with", "that", "have", "has", "show", "shows", "showing", "featuring", "and", "in", "on", "my", "me", "i", "some", "any", "type", "types", "kind", "style", "styles", "format", "formats"]);

// "phones" -> "phone", "sneakers" -> "sneaker", "boxes" -> "box"
export const stem = (w) => (w === "news" ? w : /(ch|sh|x|ss|zz)es$/.test(w) && w.length > 4 ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

const GROUPS = [
  ["phone", "iphone", "smartphone", "mobile", "lock screen", "notification", "text message", "imessage", "chat", "notes app", "app screen", "screenshot"],
  ["shoe", "sneaker", "trainer", "boot", "runner", "running shoe", "kicks", "footwear", "slipper", "sandal", "slide", "flip flop", "heel", "cleat"],
  ["tier list", "tier", "ranking", "ranked", "rank"],
  ["tee", "t-shirt", "tshirt", "shirt", "blouse", "polo"],
  ["hoodie", "sweatshirt", "sweater", "jumper", "knitwear", "cardigan", "fleece"],
  ["pants", "trousers", "jeans", "denim", "leggings", "sweatpants", "joggers", "shorts", "chinos"],
  ["jacket", "coat", "puffer", "parka", "bomber", "blazer", "overcoat", "raincoat", "windbreaker"],
  ["dress", "gown", "skirt", "jumpsuit", "swimsuit", "bikini"],
  ["bag", "tote", "backpack", "handbag", "purse", "duffel", "luggage", "suitcase", "wallet", "crossbody"],
  ["jewelry", "jewellery", "necklace", "ring", "earring", "hoops", "bracelet", "pearl", "pendant", "watch"],
  ["makeup", "lipstick", "mascara", "foundation", "nail polish", "lip gloss", "blush", "eyeshadow", "lash"],
  ["skincare", "serum", "cream", "moisturiser", "moisturizer", "sunscreen", "spf", "face mask", "balm", "cleanser", "toner"],
  ["hair", "shampoo", "conditioner", "hair oil", "hair dryer", "curling", "hair clip"],
  ["perfume", "fragrance", "cologne", "scent", "body mist"],
  ["candle", "wax", "diffuser"],
  ["coffee", "espresso", "latte", "mug", "cold brew", "barista"],
  ["drink", "bottle", "tea", "juice", "soda", "water bottle", "tumbler", "flask", "smoothie", "cocktail", "wine"],
  ["food", "snack", "pasta", "pizza", "chocolate", "sauce", "honey", "bread", "cake", "cookie", "granola"],
  ["pet", "dog", "cat", "puppy", "kitten", "leash", "collar"],
  ["baby", "newborn", "infant", "toddler", "kids", "child", "children", "nursery", "bib"],
  ["home", "sofa", "couch", "bed", "blanket", "pillow", "rug", "lamp", "curtain", "towel", "bedroom"],
  ["kitchen", "pan", "knife", "blender", "toaster", "kettle", "cookware", "air fryer", "mixer"],
  ["fitness", "gym", "yoga", "workout", "running", "protein", "dumbbell", "kettlebell", "activewear"],
  ["tech", "laptop", "headphone", "earbud", "airpod", "speaker", "keyboard", "mouse", "charger", "power bank", "camera", "gadget", "electronics", "smartwatch", "controller"],
  ["car", "vehicle", "car wash", "vacuum", "air freshener"],
  ["person", "people", "model", "woman", "man", "girl", "boy", "portrait", "selfie"],
  ["hand", "holding", "hand-held", "held"],
  ["discount", "sale", "offer", "deal", "% off", "percent off", "bogo", "buy 1 get 1", "bundle", "free shipping"],
  ["review", "star rating", "testimonial", "rating", "verified", "social proof", "ugc"],
  ["before after", "before", "after", "transformation", "old vs new", "comparison", "versus"],
  ["news", "breaking news", "newspaper"],
  ["doodle", "cartoon", "drawing", "sketch", "illustration", "line art", "hand drawn"],
  ["poster", "flyer", "bag sale", "plastic bag"],
  ["stamp", "rubber stamp"],
  ["ticket", "admit one"],
  ["receipt"],
  ["note", "handwritten", "sticky note", "notes app"],
  ["email", "inbox", "cart email"],
  ["holiday", "christmas", "xmas", "black friday", "cyber monday", "halloween", "valentine", "easter", "thanksgiving", "new year", "summer", "back to school"],
  ["y2k", "retro", "vintage", "holographic", "glitter"],
  ["meme", "funny", "joke", "humor", "humour"],
];

// Every one-word entry points at its whole group, so "sneakers" also finds "boots" ads.
export const SYN = {};
for (const g of GROUPS) for (const w of g) if (!w.includes(" ")) { const k = stem(w); (SYN[k] = SYN[k] || new Set()); g.forEach((x) => SYN[k].add(x)); }

// A synonym must be a whole word (so "ring" does not match "spring"); the typed word itself may match inside a word.
const rx = new Map();
const whole = (a) => rx.get(a) || (rx.set(a, new RegExp(`(^|[^a-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?($|[^a-z0-9])`)), rx.get(a));

// Does this lower-case template text answer the typed word?
export const hits = (hay, w) => hay.includes(w) || (SYN[w] ? [...SYN[w]].some((a) => whole(a).test(hay)) : false);

/* Ad style: how the ad is built, apart from the niche it sells in. Each template gets the first style whose pattern
   matches its layout label (the "format" line) or title; videos are their own style. */
const RAW = [
  ["compare", "Tier lists & comparisons", /tier list|venn|comparison|versus|old and new|split|matrix|grid|myth and fact|problem and solution|before|two versions|crossed|struck|checklist|timeline|callouts|lineup|six bottles/],
  ["screens", "Phone & app screens", /text message|imessage|message thread|group text|chat|notification|alerts|search|email|forum|social post|feed-style|screenshot|notes list|dark notes|story-style|podcast|poll|phone selfie|lock|pointing at a screen/],
  ["news", "News & headlines", /news|newspaper|breaking/],
  ["proof", "Reviews & proof", /review|rating|stars|quote card|stat|trend line|testimonial|authority|proof/],
  ["doodle", "Doodles & illustration", /doodle|hand-drawn|line-art|whiteboard|claymation|marker|illustration|ink/],
  ["paper", "Notes, tags & paper", /note|handwritten|typed script|apology|bulletin|tag|label|prescription|sleeve|door hanger|receipt|ticket|stamp|finger-written|mirror|fridge|calendar|30 days|06:30/],
  ["flyer", "Sale posters & flyers", /flyer|bag|offer poster|clearance|starburst|bundle|banner|warning|alert|price|offer, |sale/],
  ["concept", "Concept posters", /concept poster|surreal|miniature|globe|giant|3d|landscape|splash hero|glowing ring/],
  ["hand", "Hand-held product", /hand-held|warped|held|lifted/],
  ["ugc", "UGC & candid", /ugc|candid|selfie|painted sign|try-on|phone-style/],
  ["model", "Model photoshoots", /model|editorial|portrait|street-style|lifestyle|couple|shoot|practitioner|back view|technician|tradesman|joyful/],
];
// every pattern must start at a word boundary, so "ink" does not match "crinkled"
export const STYLES = RAW.map(([id, label, re]) => [id, label, new RegExp("\\b(?:" + re.source + ")")]);
export const STYLE_OTHER = ["still", "Product shots"];

export const styleOf = (t) => {
  if (t.type === "video") return "video";
  const text = `${t.format || ""} ${t.title || ""}`.toLowerCase().split("·").slice(2).join(" ") + ` ${(t.title || "").toLowerCase()}`;
  const hit = STYLES.find(([, , re]) => re.test(text));
  return hit ? hit[0] : STYLE_OTHER[0];
};
export const STYLE_LABELS = [...STYLES.map(([id, label]) => [id, label]), ["video", "Video"], STYLE_OTHER];
