/* GG's Almanac — section registry.
   Add a section here and it appears on the hub and in every section's nav.
   status: "live" | "soon" | "building"   (anything but "live" is shown as a placeholder card) */
export const SECTIONS = [
  {
    id: "life",
    title: "Personal Journal",
    subtitle: "Homework for Life",
    emoji: "✍️",
    href: "life/",
    status: "live",
    blurb: "One storyworthy moment a day. Raw entries, monthly summaries, and analytics on sentiment, themes and streaks.",
    source: "Notion · weekly refresh",
  },
  {
    id: "expenses",
    title: "Expense Analytics",
    subtitle: "Where the money goes",
    emoji: "💳",
    href: "expenses/",
    status: "live",
    blurb: "Every card transaction parsed from monthly statements — spend by month, category, merchant, and home vs abroad.",
    source: "Citi statements (PDF) · monthly",
  },
  {
    id: "work",
    title: "Work Journal",
    subtitle: "Coming soon",
    emoji: "🧭",
    href: "work/",
    status: "soon",
    blurb: "Decisions, wins, lessons and the arc of each role — captured as they happen, reviewed by quarter.",
    source: "TBD",
  },
  {
    id: "travel",
    title: "Travel Journal",
    subtitle: "Coming soon",
    emoji: "🗺️",
    href: "travel/",
    status: "soon",
    blurb: "Trips, places and the stories attached to them, cross-linked to the days in the personal journal and the spend on the card.",
    source: "TBD",
  },
];

export const ALMANAC = {
  name: "GG's Almanac",
  tagline: "A private record of a life in progress — journals, numbers, and the patterns between them.",
};
