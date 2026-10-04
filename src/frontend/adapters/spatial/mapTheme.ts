import type { Theme } from "@/frontend/hooks/useTheme";
export function mapPalette(theme: Theme) {
  return theme === "dark"
    ? {
        water: "#101c20",
        land: "#1c2d27",
        border: "#355348",
        teal: "#51c7b2",
        amber: "#efb86a",
        danger: "#f09283",
        network: "#80aaa0",
        ink: "#e3eee8",
        halo: "#152722",
        neutral: "#789c88",
        building: "#52675c",
      }
    : {
        water: "#dce9e8",
        land: "#edf1e8",
        border: "#bdcec2",
        teal: "#087f74",
        amber: "#b77620",
        danger: "#b4483e",
        network: "#62897d",
        ink: "#18342f",
        halo: "#ffffff",
        neutral: "#789c88",
        building: "#b5c4b8",
      };
}
