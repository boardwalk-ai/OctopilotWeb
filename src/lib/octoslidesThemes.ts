/** Fixed OctoSlides palettes offered when a request does not specify colors. */
export const OCTOSLIDES_THEMES = [
  { name: "Ember Daisy", colors: ["D72638", "F4C542", "FFFFFF"], description: "Red + Yellow + White" },
  { name: "Midnight Citrus", colors: ["151922", "FF8A28", "C9F05A"], description: "Charcoal + Orange + Lime" },
  { name: "Tidal Ink", colors: ["102A43", "00B8D9", "F7FBFF"], description: "Navy + Cyan + White" },
  { name: "Orchid Haze", colors: ["512B58", "B794C7", "FFF9F2"], description: "Plum + Lavender + Ivory" },
  { name: "Moss Ledger", colors: ["234D3C", "9DBF9E", "F8F3E7"], description: "Forest + Sage + Cream" },
  { name: "Cobalt Bloom", colors: ["2354C9", "FF6F61", "F7F8FC"], description: "Cobalt + Coral + White" },
  { name: "Copper Dusk", colors: ["A34F37", "D69E6B", "F5E9D8"], description: "Terracotta + Copper + Sand" },
  { name: "Glacier Signal", colors: ["D8F1FA", "108C9E", "243746"], description: "Ice Blue + Teal + Slate" },
  { name: "Neon Orchard", colors: ["2B174D", "E94EAB", "A9F0CE"], description: "Purple + Magenta + Mint" },
  { name: "Solar Noir", colors: ["171717", "E6B84A", "FFF8E8"], description: "Black + Gold + Ivory" },
] as const;

export function findOctoSlidesTheme(answer: string) {
  return OCTOSLIDES_THEMES.find((theme) => theme.name.toLowerCase() === answer.trim().toLowerCase());
}

export function themeCatalogForPrompt() {
  return OCTOSLIDES_THEMES.map((theme) => `- ${theme.name}: ${theme.description} (#${theme.colors.join(", #")})`).join("\n");
}
