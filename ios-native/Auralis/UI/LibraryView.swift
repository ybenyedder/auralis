import SwiftUI

struct LibraryView: View {
    @EnvironmentObject var app: AppState
    @State private var tab = 0
    @State private var showCreate = false
    @State private var newName = ""
    private let tabs = ["Titres", "Albums", "Artistes", "J'aime", "Playlists"]
    private let grid = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Picker("", selection: $tab) {
                    ForEach(tabs.indices, id: \.self) { Text(tabs[$0]).tag($0) }
                }
                .pickerStyle(.segmented)

                switch tab {
                case 0: trackList(app.library.tracks.sorted { $0.title < $1.title })
                case 1: albumGrid(app.library.albums.sorted { $0.title < $1.title })
                case 2: artistGrid(app.library.artists.sorted { $0.name < $1.name })
                case 3: trackList(app.likedTracks)
                default: playlistTab
                }

                // "Plus" — secondary destinations (like the web library's More list).
                VStack(spacing: 0) {
                    moreLink("Historique", "clock.arrow.circlepath", MoreRoute.recents)
                    moreLink("Dossiers", "folder", MoreRoute.folders)
                    moreLink("Analyse", "chart.bar.fill", MoreRoute.insights)
                }
                .padding(.top, 8)
            }
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 120)
        }
        .navigationTitle("Bibliothèque")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: SettingsRoute()) { Image(systemName: "gearshape") }
            }
        }
        .alert("Nouvelle playlist", isPresented: $showCreate) {
            TextField("Nom", text: $newName)
            Button("Créer") {
                let name = newName.trimmingCharacters(in: .whitespaces)
                newName = ""
                if !name.isEmpty { Task { _ = await app.createPlaylist(name: name) } }
            }
            Button("Annuler", role: .cancel) { newName = "" }
        }
    }

    private var playlistTab: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { showCreate = true } label: {
                Label("Nouvelle playlist", systemImage: "plus")
                    .font(.subheadline.weight(.bold)).padding(.horizontal, 16).padding(.vertical, 10)
                    .background(Theme.panel2, in: Capsule()).foregroundStyle(.white)
            }.buttonStyle(.plain)
            playlistList(app.user.playlists)
        }
    }

    private func moreLink(_ title: String, _ icon: String, _ route: MoreRoute) -> some View {
        NavigationLink(value: route) {
            HStack(spacing: 12) {
                Image(systemName: icon).foregroundStyle(.secondary).frame(width: 22)
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
            }
            .padding(.vertical, 12).contentShape(Rectangle())
        }.buttonStyle(.plain)
    }

    private func trackList(_ tracks: [Track]) -> some View {
        LazyVStack(spacing: 4) {
            if tracks.isEmpty { emptyLabel("Aucun titre") }
            ForEach(tracks) { TrackRowView(track: $0, list: tracks) }
        }
    }

    private func albumGrid(_ albums: [Album]) -> some View {
        LazyVGrid(columns: grid, spacing: 16) {
            ForEach(albums) { album in
                NavigationLink(value: album) {
                    VStack(alignment: .leading, spacing: 6) {
                        CoverArt(url: app.artURL(album.image), colors: palette(for: album.albumhash), corner: 8)
                            .aspectRatio(1, contentMode: .fit)
                        Text(album.title).font(.footnote.weight(.semibold)).foregroundStyle(.white).lineLimit(1)
                        Text(album.artistName).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                    }
                }.buttonStyle(.plain)
            }
        }
    }

    private func artistGrid(_ artists: [Artist]) -> some View {
        LazyVGrid(columns: grid, spacing: 16) {
            ForEach(artists) { artist in
                NavigationLink(value: artist) {
                    VStack(spacing: 6) {
                        CoverArt(url: app.artURL(artist.image), colors: palette(for: artist.artisthash), corner: 100)
                            .aspectRatio(1, contentMode: .fit).clipShape(Circle())
                        Text(artist.name).font(.footnote.weight(.semibold)).foregroundStyle(.white).lineLimit(1)
                    }
                }.buttonStyle(.plain)
            }
        }
    }

    private func playlistList(_ playlists: [PlaylistDto]) -> some View {
        LazyVStack(spacing: 8) {
            if playlists.isEmpty { emptyLabel("Aucune playlist") }
            ForEach(playlists) { pl in
                NavigationLink(value: pl) {
                    HStack(spacing: 12) {
                        CoverArt(url: app.artURL(pl.imageHash.map { "/api/art/\($0)" }), colors: palette(for: pl.id), corner: 6)
                            .frame(width: 52, height: 52)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(pl.name).font(.subheadline.weight(.semibold)).foregroundStyle(.white).lineLimit(1)
                            Text("\(pl.trackhashes.count) titres").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button(role: .destructive) { app.deletePlaylist(pl.id) } label: {
                        Label("Supprimer", systemImage: "trash")
                    }
                }
            }
        }
    }

    private func emptyLabel(_ text: String) -> some View {
        Text(text).foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.top, 40)
    }
}
