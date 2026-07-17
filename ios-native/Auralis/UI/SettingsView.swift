import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var app: AppState

    private let themeIds = ["spotify", "galaxy", "meteor", "comet", "cobalt", "mars", "oxide",
                            "verdigris", "brass", "aurora", "nebula", "ocean", "slate", "moss",
                            "andromeda", "polaris", "eclipse", "milkyway", "lagoon", "ultraviolet",
                            "lanterns", "storm"]
    private let grid = [GridItem(.adaptive(minimum: 60), spacing: 12)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Account
                VStack(alignment: .leading, spacing: 6) {
                    SectionTitle(text: "Compte")
                    Text(app.username).font(.headline).foregroundStyle(.white)
                    Text(app.base).font(.caption).foregroundStyle(.secondary)
                }

                // Stats
                VStack(alignment: .leading, spacing: 8) {
                    SectionTitle(text: "Écoutes")
                    HStack(spacing: 12) {
                        stat("\(app.stats.totalPlays)", "Total")
                        stat("\(app.stats.weekPlays)", "7 jours")
                        stat("\(app.stats.streak)", "Série")
                    }
                }

                // Theme
                VStack(alignment: .leading, spacing: 10) {
                    SectionTitle(text: "Thème")
                    LazyVGrid(columns: grid, spacing: 12) {
                        ForEach(themeIds, id: \.self) { id in
                            Button { app.setTheme(id) } label: {
                                Circle()
                                    .fill(Theme.accent(id))
                                    .frame(width: 44, height: 44)
                                    .overlay(Circle().strokeBorder(.white, lineWidth: app.theme == id ? 3 : 0))
                            }.buttonStyle(.plain)
                        }
                    }
                }

                // Actions
                VStack(spacing: 10) {
                    if app.isAdmin {
                        NavigationLink(value: MoreRoute.admin) {
                            Label("Gérer les utilisateurs", systemImage: "person.2.fill")
                                .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 12).padding(.horizontal, 4)
                                .background(Theme.panel2, in: RoundedRectangle(cornerRadius: 12))
                                .foregroundStyle(.white)
                        }.buttonStyle(.plain)
                    }
                    Button {
                        Task { await app.loadAll() }
                    } label: {
                        Label("Rafraîchir la bibliothèque", systemImage: "arrow.clockwise")
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(Theme.panel2, in: RoundedRectangle(cornerRadius: 12))
                            .foregroundStyle(.white)
                    }.buttonStyle(.plain)

                    Button(role: .destructive) { app.logout() } label: {
                        Label("Se déconnecter", systemImage: "rectangle.portrait.and.arrow.right")
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(Theme.panel2, in: RoundedRectangle(cornerRadius: 12))
                            .foregroundStyle(.red)
                    }.buttonStyle(.plain)
                }

                Text("Auralis iOS · v1.0.0").font(.caption2).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 120)
        }
        .navigationTitle("Réglages")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.title3.weight(.heavy)).foregroundStyle(.white)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 14)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 12))
    }
}
