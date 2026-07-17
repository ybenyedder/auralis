import SwiftUI

// Colour helpers. The app ships a dark, Spotify-like skin; the theme id chosen in
// Settings only swaps the accent tint (the web client's full CSS-var theming is out of
// scope for the first native cut — parity is on screens + playback, not every backdrop).
enum Theme {
    static let background = Color(hex: "#0b0b0d") ?? .black
    static let panel = Color(hex: "#181818") ?? Color(white: 0.09)
    static let panel2 = Color(hex: "#222225") ?? Color(white: 0.13)

    private static let accents: [String: String] = [
        "spotify": "#1ED760", "galaxy": "#a855f7", "meteor": "#22d3ee", "comet": "#34d399",
        "cobalt": "#3b82f6", "mars": "#f97316", "oxide": "#D95F45", "verdigris": "#6EB29E",
        "brass": "#C6A15B", "aurora": "#34d399", "nebula": "#fb7185", "ocean": "#38bdf8",
        "slate": "#7A8CA3", "moss": "#8A9A5B", "andromeda": "#c084fc", "polaris": "#cbd5e1",
        "eclipse": "#f59e0b", "milkyway": "#a5b4fc", "lagoon": "#14b8a6", "ultraviolet": "#8b5cf6",
        "lanterns": "#fbbf24", "storm": "#60a5fa",
    ]

    static func accent(_ theme: String) -> Color {
        Color(hex: accents[theme] ?? "#1ED760") ?? .green
    }
}

extension Color {
    /// #rrggbb (optionally #rgb / #rrggbbaa) → Color. Nil on malformed input.
    init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        guard let value = UInt64(s, radix: 16) else { return nil }
        let r, g, b, a: Double
        switch s.count {
        case 3:
            r = Double((value >> 8) & 0xF) / 15
            g = Double((value >> 4) & 0xF) / 15
            b = Double(value & 0xF) / 15
            a = 1
        case 6:
            r = Double((value >> 16) & 0xFF) / 255
            g = Double((value >> 8) & 0xFF) / 255
            b = Double(value & 0xFF) / 255
            a = 1
        case 8:
            r = Double((value >> 24) & 0xFF) / 255
            g = Double((value >> 16) & 0xFF) / 255
            b = Double((value >> 8) & 0xFF) / 255
            a = Double(value & 0xFF) / 255
        default:
            return nil
        }
        self = Color(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}

/// Deterministic two-colour gradient for entities without cover art (mirrors the
/// web client's paletteForName — a stable hue derived from the name).
func palette(for name: String) -> [Color] {
    var hash: UInt64 = 5381
    for byte in name.utf8 { hash = (hash &* 33) ^ UInt64(byte) }
    let hue = Double(hash % 360) / 360
    let c0 = Color(hue: hue, saturation: 0.55, brightness: 0.55)
    let c1 = Color(hue: (hue + 0.08).truncatingRemainder(dividingBy: 1), saturation: 0.6, brightness: 0.38)
    return [c0, c1]
}

func trackColors(_ track: Track) -> [Color] {
    if let hex = track.color, hex.count > 1, let a = Color(hex: hex[0]), let b = Color(hex: hex[1]) {
        return [a, b]
    }
    return palette(for: track.trackhash)
}

/// Album cover gradient — the album's own colours if usable, else a name-derived pair.
/// Always returns at least two colours so LinearGradient never gets an empty array.
func albumColors(_ album: Album) -> [Color] {
    if let hex = album.color, !hex.isEmpty {
        let cs = hex.compactMap { Color(hex: $0) }
        if cs.count >= 2 { return cs }
        if let one = cs.first { return [one, one.opacity(0.55)] }
    }
    return palette(for: album.albumhash)
}
