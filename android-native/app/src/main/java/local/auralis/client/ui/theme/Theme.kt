package local.auralis.client.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
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

// Auralis design system: a single opaque Apple-Music-inspired palette in two
// modes (dark + light), driven by the system setting. The old 14-theme engine
// (cosmic/vivid glass themes + animated starfield/nebula backdrop) has been
// retired, mirroring the web redesign (see docs/design-system.md).

/** Apple Music red accent (identical in both modes). */
private val AppleMusicRed = Color(0xFFFA233B)

/**
 * Palette consumed by call sites via [LocalAuralis]. The field set is preserved
 * from the legacy theme engine so components keep compiling; every field is now
 * bound to one of the Apple Music tokens below.
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
    val verdigris: Color = AppleMusicRed,
    val destructive: Color = Color(0xFFFF453A),
)

// ---- Apple Music palettes --------------------------------------------------
// Token values mirror docs/design-system.md (iOS systemBackground tiers).

/**
 * Public accessor for the dark palette. Used to force the fullscreen now-playing
 * stage to its always-dark Apple Music treatment regardless of the system setting
 * (the stage is dominated by the ambient blurred cover, so it is always dark).
 */
fun auralisDarkColors(): AuralisColors = darkColors()

private fun darkColors() = AuralisColors(
    foreground = Color(0xFFFFFFFF),        // --foreground
    background = Color(0xFF000000),        // --background  (app stage)
    paper = Color(0xFF1C1C1E),             // surface-1 alias (legacy "paper")
    ink = Color(0xFFFFFFFF),               // --ink (text on the red accent)
    panel = Color(0xFF1C1C1E),             // --surface-1 (cards)
    panel2 = Color(0xFF2C2C2E),            // --surface-2 (elevated/hover)
    panel3 = Color(0xFF3A3A3C),            // --surface-3 (active/pressed)
    line = Color(0x14FFFFFF),              // rgba(255,255,255,0.08)
    lineStrong = Color(0x33FFFFFF),        // hairline emphasis
    textMuted = Color(0xFF98989F),         // iOS secondaryLabel
    textFaint = Color(0xFF636366),         // iOS tertiaryLabel
    accent = AppleMusicRed,                // --primary
    accentSoft = AppleMusicRed,            // aliases of the single accent
    accentDeep = AppleMusicRed,
    brass = Color(0xFF98989F),             // eyebrow text → secondaryLabel
    verdigris = AppleMusicRed,
    destructive = Color(0xFFFF453A),       // iOS systemRed (dark)
)

private fun lightColors() = AuralisColors(
    foreground = Color(0xFF000000),        // --foreground
    background = Color(0xFFFFFFFF),        // --background
    paper = Color(0xFFF2F2F7),             // surface-1 alias
    ink = Color(0xFFFFFFFF),               // text on the red accent
    panel = Color(0xFFF2F2F7),             // --surface-1 (iOS secondarySystemBackground)
    panel2 = Color(0xFFE5E5EA),            // --surface-2
    panel3 = Color(0xFFD1D1D6),            // --surface-3
    line = Color(0x14000000),              // rgba(0,0,0,0.08)
    lineStrong = Color(0x33000000),
    textMuted = Color(0x993C3C43),         // rgba(60,60,67,0.6)  iOS secondaryLabel
    textFaint = Color(0x4D3C3C43),         // rgba(60,60,67,0.3)  iOS tertiaryLabel
    accent = AppleMusicRed,
    accentSoft = AppleMusicRed,
    accentDeep = AppleMusicRed,
    brass = Color(0x993C3C43),
    verdigris = AppleMusicRed,
    destructive = Color(0xFFFF3B30),       // iOS systemRed (light)
)

/** Palette for the current mode — defaults to the dark palette before first composition. */
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
 * Root theme. Picks dark or light from the system setting; no per-theme choice
 * and no animated backdrop (flat opaque surfaces, Apple-Music style).
 */
@Composable
fun AuralisTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) darkColors() else lightColors()
    val scheme = if (darkTheme) {
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
        MaterialTheme(colorScheme = scheme, typography = AuralisType, content = content)
    }
}
