import SwiftUI

/// Shared detail scaffold: a hero (art + title + subtitle + play/shuffle) over a track list.
private struct DetailScaffold<Header: View>: View {
    @EnvironmentObject var app: AppState
    let tracks: [Track]
    let title: String
    @ViewBuilder let header: () -> Header

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header()
                HStack(spacing: 12) {
                    Button { app.playAll(tracks) } label: {
                        Label("Lire", systemImage: "play.fill")
                            .font(.subheadline.weight(.bold)).padding(.horizontal, 20).padding(.vertical, 10)
                            .background(app.accentColor, in: Capsule()).foregroundStyle(.black)
                    }.buttonStyle(.plain)
                    Button { app.playAll(tracks, shuffled: true) } label: {
                        Image(systemName: "shuffle").font(.headline).foregroundStyle(.white)
                            .padding(12).background(Theme.panel2, in: Circle())
                    }.buttonStyle(.plain)
                }
                LazyVStack(spacing: 4) {
                    ForEach(tracks) { TrackRowView(track: $0, list: tracks) }
                }
            }
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 120)
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct AlbumDetailView: View {
    @EnvironmentObject var app: AppState
    let album: Album
    var body: some View {
        DetailScaffold(tracks: app.tracks(ofAlbum: album.albumhash), title: album.title) {
            heroArt(url: app.artURL(album.image), colors: palette(for: album.albumhash),
                    title: album.title, subtitle: album.artistName, circle: false)
        }
    }
}

struct ArtistDetailView: View {
    @EnvironmentObject var app: AppState
    let artist: Artist
    var body: some View {
        let tracks = app.tracks(ofArtist: artist.artisthash)
        DetailScaffold(tracks: tracks, title: artist.name) {
            heroArt(url: app.artURL(artist.image), colors: palette(for: artist.artisthash),
                    title: artist.name, subtitle: "\(tracks.count) titres", circle: true)
        }
    }
}

struct PlaylistDetailView: View {
    @EnvironmentObject var app: AppState
    let playlist: PlaylistDto
    var body: some View {
        let tracks = app.resolve(playlist.trackhashes)
        DetailScaffold(tracks: tracks, title: playlist.name) {
            heroArt(url: app.artURL(playlist.imageHash.map { "/api/art/\($0)" }), colors: palette(for: playlist.id),
                    title: playlist.name, subtitle: "\(tracks.count) titres", circle: false)
        }
    }
}

@ViewBuilder
private func heroArt(url: URL?, colors: [Color], title: String, subtitle: String, circle: Bool) -> some View {
    VStack(spacing: 12) {
        CoverArt(url: url, colors: colors, corner: circle ? 120 : 10, initial: String(title.prefix(1)))
            .frame(width: 200, height: 200)
            .clipShape(RoundedRectangle(cornerRadius: circle ? 100 : 10, style: .continuous))
            .shadow(color: .black.opacity(0.4), radius: 16, y: 8)
        VStack(spacing: 4) {
            Text(title).font(.title2.weight(.heavy)).foregroundStyle(.white).multilineTextAlignment(.center)
            Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
        }
    }
    .frame(maxWidth: .infinity)
}
