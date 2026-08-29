import SwiftUI

struct ShellView: View {
    @EnvironmentObject var app: AppState
    @State private var tab = 0

    var body: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $tab) {
                tabStack { HomeView() }
                    .tabItem { Label("Accueil", systemImage: "house.fill") }.tag(0)
                tabStack { SearchView() }
                    .tabItem { Label("Recherche", systemImage: "magnifyingglass") }.tag(1)
                tabStack { LibraryView() }
                    .tabItem { Label("Bibliothèque", systemImage: "square.stack.fill") }.tag(2)
            }
            .tint(app.accentColor)

            // Mini-player floats just above the tab bar.
            MiniPlayer().padding(.bottom, 52)
        }
        .fullScreenCover(isPresented: $app.showPlayer) { PlayerView() }
    }

    @ViewBuilder
    private func tabStack<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        NavigationStack {
            content()
                .navigationDestination(for: Album.self) { AlbumDetailView(album: $0) }
                .navigationDestination(for: Artist.self) { ArtistDetailView(artist: $0) }
                .navigationDestination(for: PlaylistDto.self) { PlaylistDetailView(playlist: $0) }
                .navigationDestination(for: SettingsRoute.self) { _ in SettingsView() }
                .navigationDestination(for: MoreRoute.self) { route in
                    switch route {
                    case .recents: RecentsView()
                    case .folders: FoldersView()
                    case .insights: InsightsView()
                    case .admin: AdminUsersView()
                    }
                }
                .background(Theme.background.ignoresSafeArea())
        }
    }
}

struct SettingsRoute: Hashable {}
