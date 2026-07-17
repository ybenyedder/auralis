import SwiftUI

struct HomeView: View {
    @EnvironmentObject var app: AppState

    private var greeting: String {
        let h = Calendar.current.component(.hour, from: Date())
        switch h {
        case 5..<12: return "Bonjour"
        case 12..<18: return "Bon après-midi"
        default: return "Bonsoir"
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack {
                    Text(greeting).font(.largeTitle.weight(.heavy)).foregroundStyle(.white)
                    Spacer()
                    NavigationLink(value: SettingsRoute()) {
                        Image(systemName: "gearshape.fill").font(.title3).foregroundStyle(.secondary)
                    }
                }

                if !app.recentTracks.isEmpty {
                    quickGrid(Array(app.recentTracks.prefix(6)))
                }

                if !app.forYou.isEmpty {
                    shelfSection("Fait pour vous", tracks: Array(app.forYou.prefix(12)))
                }

                if !app.library.albums.isEmpty {
                    albumShelf("Albums de votre bibliothèque", albums: Array(app.library.albums.prefix(12)))
                }

                if !app.likedTracks.isEmpty {
                    shelfSection("Vos titres aimés", tracks: Array(app.likedTracks.prefix(12)))
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 120)
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
    }

    private func quickGrid(_ tracks: [Track]) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            ForEach(tracks) { track in
                Button { app.play(track, in: app.recentTracks) } label: {
                    HStack(spacing: 8) {
                        CoverArt(url: app.artURL(track.image), colors: trackColors(track), corner: 4)
                            .frame(width: 48, height: 48)
                        Text(track.title).font(.footnote.weight(.semibold)).foregroundStyle(.white)
                            .lineLimit(2).multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                    }
                    .background(Theme.panel2, in: RoundedRectangle(cornerRadius: 6))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                }.buttonStyle(.plain)
            }
        }
    }

    private func shelfSection(_ title: String, tracks: [Track]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: title)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 14) {
                    ForEach(tracks) { track in
                        Button { app.play(track, in: tracks) } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                CoverArt(url: app.artURL(track.image), colors: trackColors(track), corner: 8)
                                    .frame(width: 140, height: 140)
                                Text(track.title).font(.footnote.weight(.semibold)).foregroundStyle(.white).lineLimit(1)
                                Text(track.displayArtist).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                            }.frame(width: 140)
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func albumShelf(_ title: String, albums: [Album]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: title)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 14) {
                    ForEach(albums) { album in
                        NavigationLink(value: album) {
                            VStack(alignment: .leading, spacing: 6) {
                                CoverArt(url: app.artURL(album.image), colors: albumColors(album), corner: 8)
                                    .frame(width: 140, height: 140)
                                Text(album.title).font(.footnote.weight(.semibold)).foregroundStyle(.white).lineLimit(1)
                                Text(album.artistName).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                            }.frame(width: 140)
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
    }
}
