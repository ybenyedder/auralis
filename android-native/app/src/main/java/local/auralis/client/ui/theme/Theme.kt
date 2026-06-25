package local.auralis.client.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Full theme engine ported from the web (src/lib/auralis/themes.ts): 14 themes in
// three groups. "classic" themes are opaque; "cosmic"/"vivid" turn on `glass`
// (translucent panels) over an animated ThemeBackdrop.

@Immutable
data class AuralisColors(
    val foreground: Color,
    val background: Color,
    val paper: Color,
    val ink: Color,
    val panel: Color,
    val panel2: Color,
    val panel3: Color,
    val line: Color,
    val lineStrong: Color,
    val textMuted: Color,
    val textFaint: Color,
    val accent: Color,
    val accentSoft: Color,
    val accentDeep: Color,
    val brass: Color,
    val verdigris: Color = Color(0xFF6EB29E),
    val destructive: Color = Color(0xFFE25B50),
)

@Immutable
data class Backdrop(
    val kind: String,
    val colors: List<Color>,
    val intensity: Float = 1f,
    val meteors: Int = 2,
)

@Immutable
data class ThemeDef(
    val id: String,
    val label: String,
    val group: String,
    val glass: Boolean,
    val colors: AuralisColors,
    val backdrop: Backdrop,
)

val LocalAuralis = staticCompositionLocalOf { THEMES.getValue("oxide").colors }
val LocalBackdrop = staticCompositionLocalOf { THEMES.getValue("oxide").backdrop }
val LocalGlass = staticCompositionLocalOf { false }

// ---- color parsing ---------------------------------------------------------

internal fun parseColor(s: String): Color {
    val v = s.trim()
    if (v.equals("transparent", true)) return Color.Transparent
    if (v.startsWith("#")) {
        val hex = v.substring(1)
        return when (hex.length) {
            6 -> Color(("FF$hex").toLong(16))
            8 -> { // #rrggbbaa -> argb
                val r = hex.substring(0, 2); val g = hex.substring(2, 4); val b = hex.substring(4, 6); val a = hex.substring(6, 8)
                Color(("$a$r$g$b").toLong(16))
            }
            3 -> {
                val r = hex[0]; val g = hex[1]; val b = hex[2]
                Color(("FF$r$r$g$g$b$b").toLong(16))
            }
            else -> Color.Magenta
        }
    }
    if (v.startsWith("rgba(") || v.startsWith("rgb(")) {
        val inner = v.substringAfter('(').substringBefore(')')
        val parts = inner.split(',').map { it.trim() }
        val r = parts[0].toFloat() / 255f
        val g = parts[1].toFloat() / 255f
        val b = parts[2].toFloat() / 255f
        val a = if (parts.size > 3) parts[3].toFloat() else 1f
        return Color(r, g, b, a)
    }
    return Color.Magenta
}

private fun spec(
    id: String, label: String, group: String, glass: Boolean,
    foreground: String, bgSolid: String, panel: String, panel2: String, panel3: String,
    line: String, lineStrong: String, primary: String, soft: String, deep: String,
    eyebrow: String, paper: String = "#ede3cf", ink: String = "#151411",
    textMuted: String = "rgba(255,255,255,0.62)", textFaint: String = "rgba(255,255,255,0.40)",
    backdropKind: String = "none", backdropColors: List<String> = emptyList(),
    intensity: Float = 1f, meteors: Int = 2,
): ThemeDef = ThemeDef(
    id = id, label = label, group = group, glass = glass,
    colors = AuralisColors(
        foreground = parseColor(foreground), background = parseColor(bgSolid),
        paper = parseColor(paper), ink = parseColor(ink),
        panel = parseColor(panel), panel2 = parseColor(panel2), panel3 = parseColor(panel3),
        line = parseColor(line), lineStrong = parseColor(lineStrong),
        textMuted = parseColor(textMuted), textFaint = parseColor(textFaint),
        accent = parseColor(primary), accentSoft = parseColor(soft), accentDeep = parseColor(deep),
        brass = parseColor(eyebrow),
    ),
    backdrop = Backdrop(backdropKind, backdropColors.map { parseColor(it) }, intensity, meteors),
)

val THEMES: Map<String, ThemeDef> = listOf(
    // ---- classic (opaque) ----
    spec("oxide", "Oxide", "classic", false, "#f3efe6", "#100b0a", "#181110", "#1f1613", "#291b16",
        "rgba(229,161,132,0.12)", "rgba(229,161,132,0.22)", "#D95F45", "#E5A184", "#923725", "#E5A184",
        textMuted = "#a49b8d", textFaint = "#70695f"),
    spec("verdigris", "Verdigris", "classic", false, "#eef3f0", "#0a0f0e", "#101614", "#141e1a", "#192822",
        "rgba(110,178,158,0.13)", "rgba(110,178,158,0.24)", "#6EB29E", "#B5D6C7", "#356E61", "#8FCBB9",
        textMuted = "#9aa8a1", textFaint = "#67726c"),
    spec("brass", "Brass", "classic", false, "#f3eee2", "#100d09", "#16130c", "#1d1810", "#272015",
        "rgba(198,161,91,0.14)", "rgba(198,161,91,0.26)", "#C6A15B", "#E5C985", "#7B6130", "#E5C985",
        textMuted = "#a59c87", textFaint = "#6f6957"),
    spec("paper", "Paper", "classic", false, "#f3efe6", "#0f0f0d", "#151512", "#1b1a16", "#232119",
        "rgba(237,227,207,0.11)", "rgba(237,227,207,0.18)", "#EDE3CF", "#FFF2D8", "#8F8473", "#C6A15B",
        textMuted = "#a49b8d", textFaint = "#70695f"),
    // ---- cosmic (glass) ----
    spec("galaxy", "Galaxy", "cosmic", true, "#efeafd", "#070512", "rgba(26,18,52,0.56)", "rgba(33,24,64,0.64)", "rgba(43,31,80,0.72)",
        "rgba(168,139,250,0.16)", "rgba(168,139,250,0.30)", "#a855f7", "#d8b4fe", "#7c3aed", "#c4b5fd",
        paper = "#ede9fe", ink = "#160a2b", textMuted = "rgba(220,214,245,0.66)", textFaint = "rgba(200,194,230,0.42)",
        backdropKind = "galaxy", backdropColors = listOf("#a855f7", "#6366f1", "#22d3ee", "#ec4899"), intensity = 1.05f, meteors = 3),
    spec("nocturne", "Nocturne", "cosmic", true, "#eaf2fb", "#05070f", "rgba(13,21,38,0.56)", "rgba(17,28,50,0.64)", "rgba(23,37,64,0.72)",
        "rgba(125,211,252,0.14)", "rgba(125,211,252,0.26)", "#38bdf8", "#7dd3fc", "#0284c7", "#7dd3fc",
        paper = "#e0f2fe", ink = "#08131f", textMuted = "rgba(208,221,238,0.64)", textFaint = "rgba(190,205,225,0.40)",
        backdropKind = "starfield", backdropColors = listOf("#e0f2fe", "#7dd3fc", "#bae6fd")),
    spec("aurora", "Aurora", "cosmic", true, "#e9f6f0", "#030f0c", "rgba(8,28,23,0.54)", "rgba(11,36,30,0.62)", "rgba(15,46,38,0.72)",
        "rgba(52,211,153,0.16)", "rgba(52,211,153,0.3)", "#34d399", "#a7f3d0", "#059669", "#6ee7b7",
        paper = "#d1fae5", ink = "#06231a", textMuted = "rgba(206,232,222,0.66)", textFaint = "rgba(188,214,204,0.42)",
        backdropKind = "aurora", backdropColors = listOf("#34d399", "#22d3ee", "#a78bfa", "#10b981")),
    spec("nebula", "Rose Nebula", "cosmic", true, "#fbeaf1", "#0f0610", "rgba(36,14,32,0.56)", "rgba(46,18,40,0.64)", "rgba(58,24,50,0.72)",
        "rgba(251,113,133,0.16)", "rgba(251,113,133,0.3)", "#fb7185", "#fecdd3", "#be123c", "#fda4af",
        paper = "#ffe4e6", ink = "#2a0a18", textMuted = "rgba(238,212,224,0.66)", textFaint = "rgba(220,196,208,0.42)",
        backdropKind = "nebula", backdropColors = listOf("#fb7185", "#f59e0b", "#a855f7", "#f472b6")),
    spec("ocean", "Abyss", "cosmic", true, "#e6f3fb", "#030c18", "rgba(7,26,46,0.56)", "rgba(9,34,58,0.64)", "rgba(13,44,72,0.72)",
        "rgba(56,189,248,0.16)", "rgba(56,189,248,0.3)", "#38bdf8", "#7dd3fc", "#0369a1", "#67e8f9",
        paper = "#e0f2fe", ink = "#05192c", textMuted = "rgba(200,222,238,0.66)", textFaint = "rgba(182,206,224,0.42)",
        backdropKind = "ocean", backdropColors = listOf("#38bdf8", "#0ea5e9", "#22d3ee", "#1e3a8a")),
    spec("cobalt", "Cobalt", "cosmic", true, "#e9eefc", "#04060f", "rgba(12,22,48,0.56)", "rgba(16,28,58,0.64)", "rgba(22,38,76,0.72)",
        "rgba(96,165,250,0.16)", "rgba(96,165,250,0.30)", "#3b82f6", "#93c5fd", "#1d4ed8", "#60a5fa",
        paper = "#dbeafe", ink = "#0a1230", textMuted = "rgba(210,222,245,0.66)", textFaint = "rgba(190,205,235,0.42)",
        backdropKind = "galaxy", backdropColors = listOf("#3b82f6", "#60a5fa", "#22d3ee", "#818cf8"), intensity = 1.15f, meteors = 6),
    spec("mars", "Mars", "cosmic", true, "#fbeae3", "#0f0503", "rgba(38,14,9,0.56)", "rgba(50,18,11,0.64)", "rgba(64,24,15,0.72)",
        "rgba(249,115,22,0.16)", "rgba(249,115,22,0.30)", "#f97316", "#fdba74", "#c2410c", "#fb923c",
        paper = "#ffedd5", ink = "#2a0d06", textMuted = "rgba(236,214,202,0.66)", textFaint = "rgba(216,194,182,0.42)",
        backdropKind = "galaxy", backdropColors = listOf("#f97316", "#ef4444", "#f59e0b", "#fb7185"), meteors = 4),
    // ---- vivid (glass) ----
    spec("synthwave", "Synthwave", "vivid", true, "#fdeaf6", "#120726", "rgba(33,15,62,0.56)", "rgba(43,19,78,0.64)", "rgba(55,25,96,0.72)",
        "rgba(255,95,162,0.18)", "rgba(255,95,162,0.32)", "#ff5fa2", "#ffa8cf", "#c026d3", "#fbbf24",
        paper = "#ffe4f1", ink = "#2a0a2b", textMuted = "rgba(240,210,232,0.66)", textFaint = "rgba(222,192,214,0.42)",
        backdropKind = "mesh", backdropColors = listOf("#c026d3", "#7c3aed", "#ff5fa2", "#fb923c")),
    spec("ember", "Solar Ember", "vivid", true, "#fbeede", "#140803", "rgba(40,18,10,0.56)", "rgba(52,24,12,0.64)", "rgba(66,32,16,0.72)",
        "rgba(251,146,60,0.18)", "rgba(251,146,60,0.32)", "#fb923c", "#fed7aa", "#c2410c", "#fbbf24",
        paper = "#ffedd5", ink = "#2a1206", textMuted = "rgba(236,216,196,0.66)", textFaint = "rgba(216,196,176,0.42)",
        backdropKind = "mesh", backdropColors = listOf("#c2410c", "#b91c1c", "#fb923c", "#f59e0b"), intensity = 0.9f),
    spec("velvet", "Velvet Noir", "vivid", true, "#efebf7", "#0a0710", "rgba(24,18,40,0.56)", "rgba(31,23,52,0.64)", "rgba(40,30,66,0.72)",
        "rgba(167,139,250,0.15)", "rgba(167,139,250,0.28)", "#8b5cf6", "#c4b5fd", "#6d28d9", "#c4b5fd",
        paper = "#ede9fe", ink = "#170f2b", textMuted = "rgba(220,214,238,0.64)", textFaint = "rgba(202,196,222,0.40)",
        backdropKind = "nebula", backdropColors = listOf("#a78bfa", "#6d28d9", "#f0abfc", "#4c1d95"), intensity = 0.7f),
).associateBy { it.id }

val THEME_LIST: List<ThemeDef> = THEMES.values.toList()
val THEME_GROUPS = listOf("classic" to "Classiques", "cosmic" to "Cosmiques", "vivid" to "Vibrants")

fun themeDef(id: String): ThemeDef = THEMES[id] ?: THEMES.getValue("oxide")

/** Back-compat: accent palette for a theme id (used by older call sites). */
fun accentFor(id: String): AuralisColors = themeDef(id).colors

val EyebrowStyle = TextStyle(fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.2.sp)

private val AuralisType = Typography().let { d ->
    val f = FontFamily.SansSerif
    Typography(
        displayLarge = d.displayLarge.copy(fontFamily = f, fontWeight = FontWeight.Black),
        headlineMedium = d.headlineMedium.copy(fontFamily = f, fontWeight = FontWeight.Black),
        titleLarge = d.titleLarge.copy(fontFamily = f, fontWeight = FontWeight.Bold),
        titleMedium = d.titleMedium.copy(fontFamily = f, fontWeight = FontWeight.SemiBold),
        bodyLarge = d.bodyLarge.copy(fontFamily = f),
        bodyMedium = d.bodyMedium.copy(fontFamily = f),
        labelLarge = d.labelLarge.copy(fontFamily = f, fontWeight = FontWeight.SemiBold),
        labelSmall = d.labelSmall.copy(fontFamily = f, fontWeight = FontWeight.SemiBold),
    )
}

@Composable
fun AuralisTheme(themeId: String = "oxide", content: @Composable () -> Unit) {
    val def = themeDef(themeId)
    val colors = def.colors
    val scheme = darkColorScheme(
        primary = colors.accent,
        onPrimary = colors.ink,
        secondary = colors.brass,
        background = colors.background,
        onBackground = colors.foreground,
        surface = colors.panel,
        onSurface = colors.foreground,
        surfaceVariant = colors.panel2,
        onSurfaceVariant = colors.textMuted,
        error = colors.destructive,
        outline = colors.lineStrong,
    )
    CompositionLocalProvider(
        LocalAuralis provides colors,
        LocalBackdrop provides def.backdrop,
        LocalGlass provides def.glass,
    ) {
        MaterialTheme(colorScheme = scheme, typography = AuralisType, content = content)
    }
}
