export const CARRIER_NAMES: Record<string, string> = {
  AA: "American Airlines",
  DL: "Delta Air Lines",
  UA: "United Airlines",
  WN: "Southwest Airlines",
  AS: "Alaska Airlines",
  B6: "JetBlue Airways",
  NK: "Spirit Airlines",
  F9: "Frontier Airlines",
  G4: "Allegiant Air",
  HA: "Hawaiian Airlines",
  VX: "Virgin America",
};

// Approximate brand colors, for visual identification only -- not sourced
// from an official brand guideline.
export const CARRIER_COLORS: Record<string, string> = {
  AA: "#0078D2",
  DL: "#C8102E",
  UA: "#1E5FA8",
  WN: "#F9B612",
  AS: "#00B2A9",
  B6: "#00A9E0",
  NK: "#FFEB3B",
  F9: "#00874E",
  G4: "#F68B1F",
  HA: "#6F2C91",
  VX: "#EC008C",
};

export function carrierColor(code: string): string {
  return CARRIER_COLORS[code] ?? "#9099a8";
}

export function carrierName(code: string): string {
  return CARRIER_NAMES[code] ?? code;
}

// Hand-curated background facts for the carrier profile pages -- general
// public knowledge (founding, headquarters), not derived from the flight
// data itself. Kept separate from the data-driven stats so it's clear
// which parts of a profile are sourced from this warehouse and which are
// static context.
export type CarrierProfile = {
  founded: string;
  headquarters: string;
  overview: string;
  note?: string;
};

export const CARRIER_PROFILES: Record<string, CarrierProfile> = {
  WN: {
    founded: "1967 (began service 1971)",
    headquarters: "Dallas, Texas",
    overview: "Low-cost carrier known for a point-to-point route network (rather than hub-and-spoke), no assigned seating, and two free checked bags.",
  },
  AA: {
    founded: "1926",
    headquarters: "Fort Worth, Texas",
    overview: "The world's largest airline by fleet size and passengers carried. Founding member of the Oneworld alliance.",
  },
  DL: {
    founded: "1925 (passenger service from 1929)",
    headquarters: "Atlanta, Georgia",
    overview: "Began as a crop-dusting operation before becoming a passenger airline. Founding member of the SkyTeam alliance.",
  },
  UA: {
    founded: "1926",
    headquarters: "Chicago, Illinois",
    overview: "Founding member of the Star Alliance.",
  },
  AS: {
    founded: "1932",
    headquarters: "Seattle, Washington",
    overview: "Completed its acquisition of Hawaiian Airlines in September 2024.",
    note: "The combined carrier received a single FAA operating certificate in October 2025, and Hawaiian's own \"HA\" flight code was retired in April 2026 -- new bookings, including on Hawaiian-operated flights, now use Alaska's \"AS\" code. Recent Hawaiian-operated flights may appear under AS in this data as a result.",
  },
  B6: {
    founded: "1998 (began service 2000)",
    headquarters: "Long Island City, New York",
    overview: "Low-cost carrier known for extra legroom and free seatback entertainment/WiFi.",
  },
  NK: {
    founded: "1980 (as Charter One; rebranded Spirit in 1992)",
    headquarters: "Miramar, Florida",
    overview: "Ultra-low-cost carrier with an unbundled fare model (base fare plus optional add-ons).",
  },
  F9: {
    founded: "1994",
    headquarters: "Denver, Colorado",
    overview: "Ultra-low-cost carrier, known for its animal-themed tail logos.",
  },
  G4: {
    founded: "1997",
    headquarters: "Las Vegas, Nevada",
    overview: "Ultra-low-cost carrier focused on leisure travel, often serving smaller secondary airports.",
  },
  HA: {
    founded: "1929 (as Inter-Island Airways)",
    headquarters: "Honolulu, Hawaii",
    overview: "The oldest continuously operating airline in the United States.",
    note: "Acquired by Alaska Air Group in September 2024. As of April 2026, Hawaiian's own \"HA\" flight code was retired -- new bookings, including on Hawaiian-operated flights, now use Alaska's \"AS\" code, so the most recent flights in this data may be coded as AS rather than HA even when Hawaiian actually operated them.",
  },
  VX: {
    founded: "2004 (began service 2007)",
    headquarters: "Burlingame, California",
    overview: "Acquired by Alaska Airlines in 2016 and ceased operating as a separate brand in 2018.",
    note: "Because the brand was retired in 2018, this data should show little to no VX activity after that point -- Virgin America flights fold into Alaska's \"AS\" code from then on.",
  },
};
