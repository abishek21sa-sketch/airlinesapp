// Hand-curated full names for the airports people actually look up most --
// general public knowledge (not derived from the flight data). BTS on-time
// data doesn't include an airport's official long name, only its IATA code
// plus city/state, so this covers major hubs specifically to avoid
// guessing at names for airports we're not confident about. Anything not
// in this list falls back to city/state from the data itself via
// airportDisplayName() below -- never a guessed "official" name for an
// airport not in this curated set.
export const AIRPORT_FULL_NAMES: Record<string, string> = {
  ATL: "Hartsfield-Jackson Atlanta International Airport",
  DFW: "Dallas/Fort Worth International Airport",
  DEN: "Denver International Airport",
  ORD: "Chicago O'Hare International Airport",
  LAX: "Los Angeles International Airport",
  JFK: "John F. Kennedy International Airport",
  LAS: "Harry Reid International Airport",
  MCO: "Orlando International Airport",
  MIA: "Miami International Airport",
  CLT: "Charlotte Douglas International Airport",
  SEA: "Seattle-Tacoma International Airport",
  PHX: "Phoenix Sky Harbor International Airport",
  EWR: "Newark Liberty International Airport",
  SFO: "San Francisco International Airport",
  IAH: "George Bush Intercontinental Airport",
  BOS: "Logan International Airport",
  FLL: "Fort Lauderdale-Hollywood International Airport",
  MSP: "Minneapolis-Saint Paul International Airport",
  LGA: "LaGuardia Airport",
  DTW: "Detroit Metropolitan Wayne County Airport",
  PHL: "Philadelphia International Airport",
  SLC: "Salt Lake City International Airport",
  DCA: "Ronald Reagan Washington National Airport",
  SAN: "San Diego International Airport",
  IAD: "Washington Dulles International Airport",
  BWI: "Baltimore/Washington International Thurgood Marshall Airport",
  TPA: "Tampa International Airport",
  AUS: "Austin-Bergstrom International Airport",
  MDW: "Chicago Midway International Airport",
  HNL: "Daniel K. Inouye International Airport",
  STL: "St. Louis Lambert International Airport",
  RDU: "Raleigh-Durham International Airport",
  HOU: "William P. Hobby Airport",
  SMF: "Sacramento International Airport",
  MCI: "Kansas City International Airport",
  SJC: "Norman Y. Mineta San Jose International Airport",
  OAK: "Oakland International Airport",
  PDX: "Portland International Airport",
  SNA: "John Wayne Airport",
  CLE: "Cleveland Hopkins International Airport",
  IND: "Indianapolis International Airport",
  CVG: "Cincinnati/Northern Kentucky International Airport",
  MSY: "Louis Armstrong New Orleans International Airport",
  PIT: "Pittsburgh International Airport",
  CMH: "John Glenn Columbus International Airport",
  MKE: "Milwaukee Mitchell International Airport",
  OGG: "Kahului Airport",
  BNA: "Nashville International Airport",
  DAL: "Dallas Love Field",
  BUR: "Hollywood Burbank Airport",
  ONT: "Ontario International Airport",
  RSW: "Southwest Florida International Airport",
};

// Returns a display name for the profile header: the curated full name if
// we have one, otherwise falls back to "City, State" from the data, or
// just the code if neither is available.
export function airportDisplayName(code: string, city?: string | null, state?: string | null): string {
  return AIRPORT_FULL_NAMES[code] ?? (city && state ? `${city}, ${state} Airport` : code);
}
