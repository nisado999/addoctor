/* The money maths behind Create an ad. Pure functions, no React, so they can be tested (tools/meta.test.mjs).
   Every number is a rule of thumb from the answers, not a promise of results. */

export const GOALS = {
  sales: { label: "Sell products online", sub: "Orders on my website or shop", objective: "Sales", note: "Pick the Sales objective. For a shop, Advantage+ sales campaign is the simplest set-up.", cta: "Shop now" },
  leads: { label: "Get enquiries or bookings", sub: "Messages, calls, forms, appointments", objective: "Leads", note: "Pick Leads and use an Instant form, or send people to a booking page.", cta: "Book now" },
  traffic: { label: "Send people to my site", sub: "Visits, when I have no tracking yet", objective: "Traffic", note: "Pick Traffic with Landing page views. Use it only when you have no tracking set up yet.", cta: "Learn more" },
  aware: { label: "Get known locally", sub: "Be seen by people nearby", objective: "Awareness", note: "Pick Awareness. It is the cheapest way to be seen, but it does not drive sales by itself.", cta: "Learn more" },
};

/* What they sell. The share is roughly how much of one sale can go to ads before it stops paying (thin-margin
   products like electronics get less). Used only when they do not tell us their profit. */
export const CATS = {
  fashion: ["Clothing and fashion", 0.3],
  beauty: ["Beauty and skincare", 0.35],
  home: ["Home and decor", 0.3],
  food: ["Food and drink", 0.25],
  tech: ["Electronics and gadgets", 0.15],
  health: ["Health and fitness", 0.3],
  jewel: ["Jewellery and accessories", 0.3],
  service: ["A local service", 0.35],
  other: ["Something else", 0.3],
};

/* The answers: [key, label, number]. The number is the middle of the range. 0 means "not sure". */
export const MARGIN = [["thin", "Under 15%", 0.1], ["low", "15 to 30%", 0.22], ["mid", "30 to 50%", 0.4], ["high", "Over 50%", 0.6], ["unsure", "I'm not sure", 0]];
export const REPEAT = [["once", "Mostly just once", 1], ["some", "Some come back", 1.3], ["often", "Many come back often", 1.7], ["unsure", "I'm not sure", 1]];
export const CONV = [["low", "Fewer than 1", 0.007], ["mid", "1 or 2", 0.015], ["good", "2 or 3", 0.025], ["high", "More than 3", 0.04], ["unsure", "I'm not sure", 0]];
export const CLOSE = [["few", "1 or fewer", 0.08], ["some", "2 or 3", 0.25], ["most", "4 to 6", 0.5], ["nearly", "7 or more", 0.8], ["unsure", "I'm not sure", 0.25]];
export const EXP = [["never", "Never"], ["some", "A little"], ["lots", "Yes, regularly"]];
export const HAVE = [["none", "Not really"], ["some", "Some (under 1,000 people)"], ["lots", "A good number (1,000 or more)"]];
export const SEASON = [["no", "No, a normal period"], ["yes", "Yes, a sale or a season like Black Friday"]];

export const SALES_A_DAY = 5; // sales a day Meta should get at the target cost, so it has enough to learn from
export const PER_AD = 5; // a day, about what each ad needs to get a fair test
export const KEEP = 0.7; // we let ads eat 70% of break-even, so about 30% is left as profit
export const GUESS_CONV = 0.015; // 1.5 in 100 visitors, used when they do not know theirs

const num = (list, k) => (list.find((x) => x[0] === k) || [])[2] || 0;
export const clampBudget = (b) => Math.max(1, Math.min(10000, Math.round(Number(b)) || 20));
export const nice = (n) => (n >= 20 ? Math.round(n / 5) * 5 : Math.round(n));

/* What we advise before asking what they can spend. For a sale or a lead: the most one may cost in ads, times the number
   Meta needs a day to learn. With their profit margin that is a real figure; without it, a rule of thumb for the kind of shop.
   Traffic and awareness have nothing to price, so a flat start. */
export function suggest(s) {
  const aov = Math.max(0, Number(s.aov) || 0);
  const leads = s.goal === "leads";
  const margin = num(MARGIN, s.margin); // 0 when they are not sure
  const back = num(REPEAT, s.repeat) || 1;
  const close = leads ? num(CLOSE, s.close) || 0.25 : 1; // share of enquiries that become customers
  const conv = num(CONV, s.conv); // share of visitors who buy or enquire; 0 when not sure
  if ((s.goal === "sales" || leads) && aov > 0) {
    const share = margin ? Math.min(0.8, margin * back * KEEP) : (CATS[s.product] || CATS.other)[1];
    const cpa = aov * share * close;
    const breakEven = margin ? aov * margin * back * close : 0;
    return { aov, share, margin, back, close, conv, breakEven, cpa, daily: Math.max(10, Math.min(1000, nice(cpa * SALES_A_DAY))) };
  }
  return { aov, share: 0, margin, back, close, conv, breakEven: 0, cpa: 0, daily: s.goal === "traffic" ? 15 : 10 };
}

/* The structure. Each ad needs about PER_AD a day to get a fair test, and more than ten ads in one ad set splits the money
   too thin. Bigger budgets get more ad sets so each one still has enough. */
export function recommend(s) {
  const sug = suggest(s);
  const budget = clampBudget(s.budget || sug.daily);
  const adsets = budget < 100 ? 1 : budget < 300 ? 2 : 3;
  const ads = Math.max(3, Math.min(10, Math.round(budget / adsets / PER_AD)));
  const short = budget < sug.daily * 0.8; // they can spend clearly less than we advise
  const tooLow = sug.cpa > 0 && budget < sug.cpa * 2; // under two sales' worth of ad cost a day
  const days = tooLow ? 10 : short ? 7 : 4; // a smaller budget needs longer before the results mean anything
  const salesDay = sug.cpa ? budget / sug.cpa : 0;
  const conv = sug.conv || GUESS_CONV;
  return {
    budget, adsets, ads, days, short, tooLow, sug, total: budget * days, salesDay,
    visitors: salesDay ? salesDay / conv : 0, // visitors a day the ads must bring for that many sales
    maxCpc: sug.cpa ? sug.cpa * conv : 0, // a click dearer than this and the sale costs more than we aim for
    lowVolume: salesDay > 0 && salesDay / adsets < 1, // under one sale a day in each ad set: Meta cannot learn from sales alone
    objective: (GOALS[s.goal] || GOALS.sales).objective,
  };
}
