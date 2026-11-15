import SwiftUI

// Colour helpers. The app ships a single opaque Apple-Music-style palette that
// follows the system appearance (dark + light) — the multi-accent "cosmic"
// catalogue and dark-only Spotify skin have been retired for parity with the
// redesigned web client (see docs/design-system.md).
enum Theme {
    /// Liner neutral monochrome accent (#F4F4F5 dark, #18181B light) — keeps
    /// chrome quiet so album artwork sets the colour.
    static let accent = Color(UIColor {
        $0.userInterfaceStyle == .dark
            ? UIColor(red: 0xF4/255, green: 0xF4/255, blue: 0xF5/255, alpha: 1)
            : UIColor(red: 0x18/255, green: 0x18/255, blue: 0x1B/255, alpha: 1)
    })
    /// Contrasting foreground ink on `Theme.accent`.
    static let accentInk = Color(UIColor {
        $0.userInterfaceStyle == .dark
            ? UIColor(red: 0x09/255, green: 0x09/255, blue: 0x0B/255, alpha: 1)
            : .white
    })

    /// App stage. Opaque system background so dark + light both resolve.
    static let background = Color(.systemBackground)
    /// Card / panel tier — iOS secondarySystemBackground (surface-1).
    static let panel = Color(.secondarySystemBackground)
    /// Elevated / pressed tier — iOS tertiarySystemBackground (surface-2/3).
    static let panel2 = Color(.tertiarySystemBackground)
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
