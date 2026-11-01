package local.auralis.client.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import local.auralis.client.R

// Auralis design system — "Liner" edition. The signature: the CONTENT is the
// colour. A near-black stage (#000) with translucent glass surfaces floats over
// a soft ambient wash driven by the cover art; chrome stays neutral so the
// artwork — never the UI — sets the mood. One red accent (#FF4D4D) is the only
// saturated UI colour, echoed from the artwork's warm tones.

/** Liner red accent (identical in both modes). */
private val LinerRed = Color(0xFFFF4D4D)
/** Softer red steps for hovers/glows. */
private val LinerRedSoft = Color(0xFFFF8A8A)

/**
 * Palette consumed by call sites via [LocalAuralis]. The field set is preserved
 * from the legacy theme engine so components keep compiling; every field is now
 * bound to one of the Liner tokens below.
 */
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
    val verdigris: Color = LinerRed,
    val destructive: Color = Color(0xFFFF453A),
)

// ---- Liner palettes ---------------------------------------------------------
// Token values mirror Liner's globals.css (dark #000 stage, glass surfaces, one
// red accent). Dark is the DEFAULT mode — the app boots dark and stays there
// unless the user picks light.

/**
 * Public accessor for the dark palette. Used to force the fullscreen now-playing
 * stage to its always-dark treatment regardless of the system setting (the stage
 * is dominated by the ambient blurred cover, so it is always dark).
 */
fun auralisDarkColors(): AuralisColors = darkColors()

private fun darkColors() = AuralisColors(
    foreground = Color(0xFFFFFFFF),        // --text-primary
    background = Color(0xFF000000),        // --bg-canvas (deep black stage)
    paper = Color(0xFF0A0A0A),             // --bg-surface alias
    ink = Color(0xFFFFFFFF),               // text on the red accent
    panel = Color(0xFF0A0A0A),             // --bg-surface (cards, near-black)
    panel2 = Color(0xFF141414),            // --bg-elevated
    panel3 = Color(0xFF1A1A1A),            // --bg-panel (active/pressed)
    line = Color(0x14FFFFFF),              // rgba(255,255,255,0.08) hairline
    lineStrong = Color(0x33FFFFFF),        // rgba(255,255,255,0.2) emphasis
    textMuted = Color(0xB3FFFFFF),         // rgba(255,255,255,0.7)
    textFaint = Color(0x73FFFFFF),         // rgba(255,255,255,0.45)
    accent = LinerRed,                     // --accent-primary
    accentSoft = LinerRedSoft,             // --accent-soft
    accentDeep = Color(0xFFE03535),
    brass = Color(0xB3FFFFFF),             // eyebrow text → muted
    verdigris = LinerRed,
    destructive = Color(0xFFFF453A),
)

private fun lightColors() = AuralisColors(
    foreground = Color(0xFF18181B),        // --text-primary (zinc-900)
    background = Color(0xFFFFFFFF),        // --bg-canvas
    paper = Color(0xFFF5F5F7),             // --bg-primary alias
    ink = Color(0xFFFFFFFF),               // text on the red accent
    panel = Color(0xFFF5F5F7),             // --bg-primary (soft cards)
    panel2 = Color(0xFFE6E6EB),            // --bg-elevated
    panel3 = Color(0xFFDEDEE3),            // --bg-panel
    line = Color(0x0F000000),              // rgba(0,0,0,0.06) hairline
    lineStrong = Color(0x24000000),        // rgba(0,0,0,0.14)
    textMuted = Color(0xA6000000),         // rgba(0,0,0,0.65)
    textFaint = Color(0x73000000),         // rgba(0,0,0,0.45)
    accent = Color(0xFFFF3B3B),            // --accent-primary (light)
    accentSoft = Color(0xFFFF5C5C),
    accentDeep = Color(0xFFE02B2B),
    brass = Color(0xA6000000),
    verdigris = Color(0xFFFF3B3B),
    destructive = Color(0xFFFF3B30),
)

/** Palette for the current mode — dark is the default before first composition. */
val LocalAuralis = staticCompositionLocalOf { darkColors() }

/**
 * Resolves a relative asset path (cover hash, artwork path) to a fully-qualified URL
 * against the connected server. Provided by AppRoot from the live API client so any
 * composable can build image URLs without threading the client through manually.
 * Defaults to the identity function so previews/@Previews still compile standalone.
 */
val LocalApiUrl = staticCompositionLocalOf<(String?) -> String?> { { url: String? -> url } }

// ---- Apple Music type scale -------------------------------------------------
// The iOS text-rhythm (Large Title → Caption2), mirroring SF Pro metrics.
// SF Pro is not redistributable, so Inter — the type community's de-facto
// SF substitute (near-identical x-height/rhythm) — ships in res/font and is
// wired through every style, AMType and Material alike.

/** The app-wide SF Pro stand-in: Inter 400/500/600/700 (res/font, OFL). */
val AMFont = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_medium, FontWeight.Medium),
    Font(R.font.inter_semibold, FontWeight.SemiBold),
    Font(R.font.inter_bold, FontWeight.Bold),
)

object AMType {
    /** Navigation large title (each tab's collapsed identity). */
    val LargeTitle = TextStyle(fontFamily = AMFont, fontWeight = FontWeight.Bold, fontSize = 34.sp, lineHeight = 41.sp, letterSpacing = 0.4.sp)

    /** Screen titles: playlist/album hero names, big headers. */
    val Title1 = TextStyle(fontFamily = AMFont, fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 34.sp, letterSpacing = 0.3.sp)

    /** Now-playing song title, section heroes. */
    val Title2 = TextStyle(fontFamily = AMFont, fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 28.sp, letterSpacing = 0.2.sp)

    /** Shelf headers ("Écoutés récemment"), now-playing artist. */
    val Title3 = TextStyle(fontFamily = AMFont, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 25.sp)

    /** Row titles, collapsed nav-bar title. */
    val Headline = TextStyle(fontFamily = AMFont, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, lineHeight = 22.sp)

    /** Default reading size (labels, list primary text). */
    val Body = TextStyle(fontFamily = AMFont, fontWeight = FontWeight.Normal, fontSize = 17.sp, lineHeight = 22.sp)

    /** Secondary rows, card subtitles. */
    val Subhead = TextStyle(fontFamily = AMFont, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 20.sp)

    /** "Tout afficher" links, small metadata. */
    val Footnote = TextStyle(fontFamily = AMFont, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 18.sp)

    /** Tab-bar labels, timers. */
    val Caption1 = TextStyle(fontFamily = AMFont, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp)

    /** Smallest legal text. */
    val Caption2 = TextStyle(fontFamily = AMFont, fontWeight = FontWeight.Normal, fontSize = 11.sp, lineHeight = 13.sp)
}

val EyebrowStyle = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.6.sp)

// Inter everywhere (the SF Pro stand-in), so raw Text() calls that inherit the
// Material style land on the same family as AMType. Weights follow the
// Apple Music hierarchy — Bold for large titles, SemiBold for headers — no
// Black anywhere (the pre-redesign stack over-weighted everything).
private val AuralisType = Typography().let { d ->
    val f = AMFont
    Typography(
        displayLarge = d.displayLarge.copy(fontFamily = f, fontWeight = FontWeight.Bold, fontSize = 34.sp),
        headlineMedium = d.headlineMedium.copy(fontFamily = f, fontWeight = FontWeight.Bold, fontSize = 28.sp),
        titleLarge = d.titleLarge.copy(fontFamily = f, fontWeight = FontWeight.Bold, fontSize = 22.sp),
        titleMedium = d.titleMedium.copy(fontFamily = f, fontWeight = FontWeight.SemiBold, fontSize = 20.sp),
        bodyLarge = d.bodyLarge.copy(fontFamily = f, fontSize = 17.sp),
        bodyMedium = d.bodyMedium.copy(fontFamily = f, fontSize = 15.sp),
        labelLarge = d.labelLarge.copy(fontFamily = f, fontWeight = FontWeight.SemiBold, fontSize = 15.sp),
        labelSmall = d.labelSmall.copy(fontFamily = f, fontWeight = FontWeight.Medium, fontSize = 11.sp),
    )
}

/**
 * Root theme. [mode] is the persisted appearance setting ("dark" | "light" |
 * "auto"); "auto" follows the system setting. No animated backdrop (flat opaque
 * surfaces, Apple-Music style).
 */
@Composable
fun AuralisTheme(
    mode: String = "auto",
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val dark = when (mode) {
        "dark" -> true
        "light" -> false
        else -> darkTheme
    }
    val colors = if (dark) darkColors() else lightColors()
    val scheme = if (dark) {
        darkColorScheme(
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
    } else {
        lightColorScheme(
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
    }
    CompositionLocalProvider(LocalAuralis provides colors) {
        MaterialTheme(colorScheme = scheme, typography = AuralisType, shapes = AuralisShapes, content = content)
    }
}

// Every Material3 component (dialogs, buttons, text fields) rounds on the same
// token scale as the hand-built surfaces (see Tokens.kt AMShapes).
private val AuralisShapes = Shapes(
    extraSmall = RoundedCornerShape(Radius.xs),
    small = RoundedCornerShape(Radius.sm),
    medium = RoundedCornerShape(Radius.md),
    large = RoundedCornerShape(Radius.lg),
    extraLarge = RoundedCornerShape(Radius.xl),
)
