import SwiftUI

/// Cover art with a deterministic gradient fallback while loading / when absent.
struct CoverArt: View {
    let url: URL?
    let colors: [Color]
    var corner: CGFloat = 6
    var initial: String? = nil

    var body: some View {
        ZStack {
            LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
            if let initial, url == nil {
                Text(initial).font(.system(size: 22, weight: .black)).foregroundStyle(.white.opacity(0.9))
            }
            if let url {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img): img.resizable().scaledToFill()
                    default: Color.clear
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: corner, style: .continuous))
    }
}

/// One track row: art, title, artist, favourite heart. Tapping plays it in `list`.
struct TrackRowView: View {
    @EnvironmentObject var app: AppState
    let track: Track
    let list: [Track]

    var body: some View {
        Button { app.play(track, in: list) } label: {
            HStack(spacing: 12) {
                CoverArt(url: app.artURL(track.image), colors: trackColors(track), corner: 4)
                    .frame(width: 48, height: 48)
                VStack(alignment: .leading, spacing: 2) {
                    Text(track.title).font(.subheadline.weight(.semibold))
                        .foregroundStyle(isCurrent ? app.accentColor : .white)
                        .lineLimit(1)
                    Text(track.displayArtist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 8)
                if app.user.favorites.contains(track.trackhash) {
                    Image(systemName: "heart.fill").font(.caption).foregroundStyle(app.accentColor)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                app.toggleFavorite(track.trackhash)
            } label: {
                Label(app.user.favorites.contains(track.trackhash) ? "Retirer des favoris" : "Ajouter aux favoris",
                      systemImage: "heart")
            }
            Button { app.toggleDislike(track.trackhash) } label: {
                Label("Je n'aime pas", systemImage: "hand.thumbsdown")
            }
            if !app.user.playlists.isEmpty {
                Menu {
                    ForEach(app.user.playlists) { pl in
                        Button(pl.name) { app.addToPlaylist(pl.id, trackhash: track.trackhash) }
                    }
                } label: { Label("Ajouter à une playlist", systemImage: "text.badge.plus") }
            }
        }
    }

    private var isCurrent: Bool { app.currentTrack?.trackhash == track.trackhash }
}

/// Docked mini-player above the tab bar; tap opens the full player.
struct MiniPlayer: View {
    @EnvironmentObject var app: AppState

    var body: some View {
        if let track = app.currentTrack {
            Button { app.showPlayer = true } label: {
                HStack(spacing: 10) {
                    CoverArt(url: app.artURL(track.image), colors: trackColors(track), corner: 4)
                        .frame(width: 40, height: 40)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(track.title).font(.footnote.weight(.semibold)).foregroundStyle(.white).lineLimit(1)
                        Text(track.displayArtist).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer()
                    Button { app.togglePlay() } label: {
                        Image(systemName: app.player.isPlaying ? "pause.fill" : "play.fill")
                            .font(.title3).foregroundStyle(.white)
                    }.buttonStyle(.plain)
                    Button { app.playNext(manual: true) } label: {
                        Image(systemName: "forward.fill").font(.body).foregroundStyle(.white)
                    }.buttonStyle(.plain)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(Theme.panel2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .padding(.horizontal, 8)
            }
            .buttonStyle(.plain)
        }
    }
}

/// Small section header with a title.
struct SectionTitle: View {
    let text: String
    var body: some View {
        Text(text).font(.title3.weight(.bold)).foregroundStyle(.white)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension AppState {
    var accentColor: Color { Theme.accent(theme) }
}

func formatTime(_ seconds: Double) -> String {
    guard seconds.isFinite, seconds >= 0 else { return "0:00" }
    let s = Int(seconds)
    return String(format: "%d:%02d", s / 60, s % 60)
}
