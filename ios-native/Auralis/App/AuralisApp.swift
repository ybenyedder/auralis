import SwiftUI

@main
struct AuralisApp: App {
    @StateObject private var app = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
                .preferredColorScheme(.dark)
                .tint(Theme.accent(app.theme))
                .task { await app.bootstrap() }
        }
    }
}

/// Phase router — the single source of what fills the screen.
struct RootView: View {
    @EnvironmentObject var app: AppState

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            switch app.phase {
            case .boot, .loading:
                LoadingView()
            case .connect:
                ConnectView()
            case .login:
                LoginView()
            case .ready:
                ShellView()
            case .error:
                VStack(spacing: 12) {
                    Text(app.errorMessage ?? "Une erreur est survenue").foregroundStyle(.secondary)
                    Button("Réessayer") { Task { await app.bootstrap() } }
                }
            }
        }
    }
}

struct LoadingView: View {
    var body: some View {
        VStack(spacing: 16) {
            ProgressView().tint(.white)
            Text("Auralis").font(.title3.weight(.heavy)).foregroundStyle(.white.opacity(0.8))
        }
    }
}
