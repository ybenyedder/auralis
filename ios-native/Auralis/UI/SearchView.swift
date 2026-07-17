import SwiftUI

struct SearchView: View {
    @EnvironmentObject var app: AppState
    @State private var query = ""
    @State private var results = SearchResult.empty
    @State private var searching = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if query.trimmingCharacters(in: .whitespaces).isEmpty {
                    SectionTitle(text: "Parcourir")
                    genreGrid
                } else {
                    if !results.artists.isEmpty {
                        SectionTitle(text: "Artistes")
                        ForEach(results.artists.prefix(6)) { artist in
                            NavigationLink(value: artist) { artistRow(artist) }.buttonStyle(.plain)
                        }
                    }
                    if !results.albums.isEmpty {
                        SectionTitle(text: "Albums")
                        ForEach(results.albums.prefix(6)) { album in
                            NavigationLink(value: album) { albumRow(album) }.buttonStyle(.plain)
                        }
                    }
                    if !results.tracks.isEmpty {
                        SectionTitle(text: "Titres")
                        ForEach(results.tracks.prefix(30)) { track in
                            TrackRowView(track: track, list: results.tracks)
                        }
                    }
                    if results.tracks.isEmpty && results.albums.isEmpty && results.artists.isEmpty && !searching {
                        Text("Aucun résultat pour « \(query) »").foregroundStyle(.secondary).padding(.top, 40)
                    }
                }
            }
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 120)
        }
        .navigationTitle("Recherche")
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Titres, artistes, albums")
        .task(id: query) {
            let q = query.trimmingCharacters(in: .whitespaces)
            guard !q.isEmpty else { results = .empty; return }
            searching = true
            try? await Task.sleep(nanoseconds: 200_000_000) // debounce
            if Task.isCancelled { return }
            results = await app.api.search(q)
            searching = false
        }
    }

    private var genreGrid: some View {
        let genres = Array(Set(app.library.tracks.compactMap { $0.genre })).sorted().prefix(12)
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            ForEach(Array(genres), id: \.self) { genre in
                Button {
                    let gt = app.library.tracks.filter { $0.genre == genre }
                    app.playAll(gt, shuffled: true)
                } label: {
                    ZStack(alignment: .topLeading) {
                        palette(for: genre)[0]
                        Color.black.opacity(0.2)
                        Text(genre).font(.headline.weight(.black)).foregroundStyle(.white).padding(12)
                    }
                    .frame(height: 96)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }.buttonStyle(.plain)
            }
        }
    }

    private func artistRow(_ artist: Artist) -> some View {
        HStack(spacing: 12) {
            CoverArt(url: app.artURL(artist.image), colors: palette(for: artist.artisthash), corner: 24)
                .frame(width: 48, height: 48).clipShape(Circle())
            Text(artist.name).font(.subheadline.weight(.semibold)).foregroundStyle(.white)
            Spacer()
        }
    }

    private func albumRow(_ album: Album) -> some View {
        HStack(spacing: 12) {
            CoverArt(url: app.artURL(album.image), colors: palette(for: album.albumhash), corner: 4)
                .frame(width: 48, height: 48)
            VStack(alignment: .leading, spacing: 2) {
                Text(album.title).font(.subheadline.weight(.semibold)).foregroundStyle(.white).lineLimit(1)
                Text(album.artistName).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
        }
    }
}
