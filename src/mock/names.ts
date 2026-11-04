// Fictional names only. Phone numbers use the reserved 555-01xx range; emails use example.com.
export const FIRST_NAMES = [
  "Avery", "Jordan", "Riley", "Casey", "Morgan", "Quinn", "Harper", "Rowan", "Emerson", "Finley",
  "Hayden", "Jamie", "Kendall", "Logan", "Parker", "Reese", "Sawyer", "Taylor", "Skyler", "Drew",
  "Elliot", "Blake", "Cameron", "Dakota", "Jesse", "Kai", "Lane", "Micah", "Noel", "Peyton",
  "Sage", "Tatum", "Remy", "Shiloh", "Arden", "Bellamy", "Corin", "Dallas", "Ellis", "Frankie",
];
export const LAST_NAMES = [
  "Ashford", "Brightwater", "Calloway", "Dunmore", "Ellery", "Fairbanks", "Galloway", "Hartwell", "Ingram", "Juniper",
  "Kestrel", "Langford", "Merriweather", "Northcott", "Oakley", "Pemberton", "Quill", "Ravenscroft", "Stanwick", "Thistlewood",
  "Underhill", "Vance", "Whitlock", "Yardley", "Zeller", "Amberly", "Birchall", "Copperfield", "Dovecote", "Elmsworth",
];
export function fakePhone(n: number): string {
  return `(555) 01${String(n % 100).padStart(2, "0")}-${String(1000 + ((n * 37) % 9000)).slice(0, 4)}`;
}
