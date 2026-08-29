import SwiftUI

struct PlayerView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var showLyrics = false
    @State private var scrubbing = false
    @State private var scrubValue: Double = 0

    var body: some View {
        ZStack {
            backdrop
            VStack(spacing: 20) {
                HStack {
                    Button { dismiss() } label: { Image(systemName: "chevron.down").font(.headline) }
                    Spacer()
                    Text(app.currentTrack?.album ?? "À l'écoute").font(.caption.weight(.semibold)).lineLimit(1)
                    Spacer()
                    Button { showLyrics.toggle() } label: {
                        Image(systemName: "text.quote").font(.headline)
                            .foregroundStyle(showLyrics ? app.accentColor : .white)
                    }
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 20).padding(.top, 12)

                if showLyrics, app.lyrics.status == "found" {
                    lyricsPane
                } else {
                    Spacer()
                    cover
                    Spacer()
                }

                controls
            }
        }
    }

    /// Apple Music signature backdrop: a blown-up, heavily blurred copy of the cover
    /// art, dimmed by a vertical scrim so the now-playing stage reads as an ambient
    /// colour field (always dark, like Apple Music's full-screen player). The stage
    /// text is forced to white above, so it stays legible in light + dark mode.
    private var backdrop: some View {
        let colors = app.currentTrack.map(trackColors) ?? [.gray, .black]
        return ZStack {
            Theme.background.ignoresSafeArea()
            CoverArt(url: app.artURL(app.currentTrack?.image), colors: colors, corner: 0)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .scaleEffect(1.25)
                .blur(radius: 55)
                .opacity(0.85)
                .ignoresSafeArea()
            LinearGradient(
                colors: [.black.opacity(0.50), .black.opacity(0.18), .black.opacity(0.30), .black.opacity(0.66)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        }
    }

    private var cover: some View {
        CoverArt(url: app.artURL(app.currentTrack?.image), colors: app.currentTrack.map(trackColors) ?? [.gray, .black], corner: 14,
                 initial: app.currentTrack.map { String($0.title.prefix(1)) })
            .frame(width: 300, height: 300)
            .shadow(color: .black.opacity(0.5), radius: 30, y: 14)
            .padding(.horizontal, 24)
    }

    private var lyricsPane: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(Array(app.lyrics.lines.enumerated()), id: \.offset) { idx, line in
                        Text(line.text.isEmpty ? "♪" : line.text)
                            .font(.title3.weight(.bold))
                            .foregroundStyle(idx == currentLine ? .white : .white.opacity(0.4))
                            .id(idx)
                    }
                }
                .padding(.horizontal, 24).padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .onChange(of: currentLine) { line in
                withAnimation(.easeInOut) { proxy.scrollTo(line, anchor: .center) }
            }
        }
    }

    private var currentLine: Int {
        guard app.lyrics.isSynced else { return -1 }
        let pos = app.player.position
        var idx = -1
        for (i, line) in app.lyrics.lines.enumerated() where line.time <= pos { idx = i }
        return idx
    }

    private var controls: some View {
        VStack(spacing: 14) {
            if let track = app.currentTrack {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(track.title).font(.title3.weight(.heavy)).foregroundStyle(.white).lineLimit(1)
                        Text(track.displayArtist).font(.subheadline).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
                    }
                    Spacer()
                    Button { app.toggleFavorite(track.trackhash) } label: {
                        Image(systemName: app.user.favorites.contains(track.trackhash) ? "heart.fill" : "heart")
                            .font(.title3).foregroundStyle(app.user.favorites.contains(track.trackhash) ? app.accentColor : .white)
                    }
                }
                .padding(.horizontal, 24)
            }

            VStack(spacing: 4) {
                Slider(value: Binding(
                    get: { scrubbing ? scrubValue : app.player.position },
                    set: { scrubValue = $0 }
                ), in: 0...max(1, app.player.duration), onEditingChanged: { editing in
                    scrubbing = editing
                    if !editing { app.player.seek(to: scrubValue) }
                })
                .tint(app.accentColor)
                HStack {
                    Text(formatTime(scrubbing ? scrubValue : app.player.position))
                    Spacer()
                    Text(formatTime(app.player.duration))
                }
                .font(.caption2).foregroundStyle(.white.opacity(0.6))
            }
            .padding(.horizontal, 24)

            HStack(spacing: 36) {
                Button { app.shuffle.toggle() } label: {
                    Image(systemName: "shuffle").foregroundStyle(app.shuffle ? app.accentColor : .white.opacity(0.7))
                }
                Button { app.playPrev() } label: { Image(systemName: "backward.fill").font(.title2) }
                Button { app.togglePlay() } label: {
                    Image(systemName: app.player.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 64))
                }
                Button { app.playNext(manual: true) } label: { Image(systemName: "forward.fill").font(.title2) }
                Button { app.cycleRepeat() } label: {
                    Image(systemName: app.repeatMode == 2 ? "repeat.1" : "repeat")
                        .foregroundStyle(app.repeatMode > 0 ? app.accentColor : .white.opacity(0.7))
                }
            }
            .foregroundStyle(.white)
            .padding(.bottom, 28)
        }
    }
}
