export type DestinationTheme = {
  emoji: string;
  heroGradient: string;
  accentColor: string;
  patternEmoji: string;
};

export function getDestinationTheme(destination: string): DestinationTheme {
  const d = destination?.toLowerCase() ?? "";

  if (d.includes("יפן") || d.includes("japan") || d.includes("tokyo") || d.includes("osaka")) {
    return {
      emoji: "🇯🇵",
      heroGradient: "linear-gradient(135deg, #1a1a2e, #e8614d22)",
      accentColor: "#E8614D",
      patternEmoji: "⛩️",
    };
  }
  if (d.includes("צרפת") || d.includes("france") || d.includes("paris")) {
    return {
      emoji: "🇫🇷",
      heroGradient: "linear-gradient(135deg, #1a1a3e, #002395aa)",
      accentColor: "#002395",
      patternEmoji: "🗼",
    };
  }
  if (d.includes("איטליה") || d.includes("italy") || d.includes("rome") || d.includes("roma")) {
    return {
      emoji: "🇮🇹",
      heroGradient: "linear-gradient(135deg, #2d1b0e, #c8102e22)",
      accentColor: "#C8102E",
      patternEmoji: "🏛️",
    };
  }
  if (d.includes("תאילנד") || d.includes("thailand") || d.includes("bangkok")) {
    return {
      emoji: "🇹🇭",
      heroGradient: "linear-gradient(135deg, #0d2137, #A51931aa)",
      accentColor: "#A51931",
      patternEmoji: "🛕",
    };
  }
  if (d.includes("ספרד") || d.includes("spain") || d.includes("barcelona") || d.includes("madrid")) {
    return {
      emoji: "🇪🇸",
      heroGradient: "linear-gradient(135deg, #1a0d00, #c60b1e22)",
      accentColor: "#C60B1E",
      patternEmoji: "💃",
    };
  }
  if (d.includes("יוון") || d.includes("greece") || d.includes("athens")) {
    return {
      emoji: "🇬🇷",
      heroGradient: "linear-gradient(135deg, #0d1f3c, #0d5eaf44)",
      accentColor: "#0D5EAF",
      patternEmoji: "🏛️",
    };
  }
  if (d.includes("ישראל") || d.includes("israel") || d.includes("tel aviv") || d.includes("jerusalem")) {
    return {
      emoji: "🇮🇱",
      heroGradient: "linear-gradient(135deg, #0d1f3c, #0038b822)",
      accentColor: "#0038B8",
      patternEmoji: "✡️",
    };
  }

  return {
    emoji: "✈️",
    heroGradient: "linear-gradient(135deg, #1a1614, #E8614D22)",
    accentColor: "#E8614D",
    patternEmoji: "🗺️",
  };
}
