import SwiftUI

enum MoreRoute: Hashable { case recents, folders, insights, admin }

// MARK: Récents

struct RecentsView: View {
    @EnvironmentObject var app: AppState
    var body: some View {
        ScrollView {
            LazyVStack(spacing: 4) {
                let list = app.recentTracks
                if list.isEmpty { Text("Aucune écoute récente").foregroundStyle(.secondary).padding(.top, 40) }
                ForEach(list) { TrackRowView(track: $0, list: list) }
            }
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 120)
        }
        .navigationTitle("Historique").navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: Dossiers

struct FoldersView: View {
    @EnvironmentObject var app: AppState

    private func flatten(_ nodes: [FolderNode], depth: Int = 0) -> [(node: FolderNode, depth: Int)] {
        nodes.flatMap { [(node: $0, depth: depth)] + flatten($0.children, depth: depth + 1) }
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 2) {
                let rows = flatten(app.library.folders)
                if rows.isEmpty { Text("Aucun dossier").foregroundStyle(.secondary).padding(.top, 40) }
                ForEach(rows, id: \.node.path) { row in
                    Button {
                        let t = app.tracks(inFolder: row.node.path)
                        if !t.isEmpty { app.playAll(t) }
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "folder.fill").foregroundStyle(app.accentColor)
                            Text(row.node.name.isEmpty ? row.node.path : row.node.name)
                                .font(.subheadline).foregroundStyle(.white).lineLimit(1)
                            Spacer()
                            Text("\(row.node.trackcount)").font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.leading, CGFloat(row.depth) * 16)
                        .padding(.vertical, 10).contentShape(Rectangle())
                    }.buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 120)
        }
        .navigationTitle("Dossiers").navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: Insights (stats + recap)

struct InsightsView: View {
    @EnvironmentObject var app: AppState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                SectionTitle(text: "Vos écoutes")
                HStack(spacing: 12) {
                    tile("\(app.stats.totalPlays)", "Total")
                    tile("\(app.stats.weekPlays)", "7 jours")
                    tile("\(app.stats.streak)", "Série")
                }
                let hours = Int(app.stats.totalListeningSeconds / 3600)
                tile("\(hours) h", "Temps d'écoute total").frame(maxWidth: .infinity)

                if let r = app.recap.recap, r.totalPlays > 0 {
                    SectionTitle(text: r.label + (r.inProgress ? " · en cours" : ""))
                    VStack(alignment: .leading, spacing: 10) {
                        Text(r.moodWord ?? Moods.byId[r.dominantMood ?? ""]?.label ?? "—")
                            .font(.title.weight(.black)).foregroundStyle(.white)
                        if !r.narrative.isEmpty {
                            Text(r.narrative).font(.subheadline).foregroundStyle(.white.opacity(0.85))
                        }
                        ForEach(r.moods.prefix(6)) { m in
                            HStack(spacing: 8) {
                                Text(Moods.byId[m.mood]?.label ?? m.mood).font(.caption).foregroundStyle(.secondary)
                                    .frame(width: 96, alignment: .leading)
                                GeometryReader { geo in
                                    ZStack(alignment: .leading) {
                                        Capsule().fill(Theme.panel2)
                                        Capsule().fill((Moods.byId[m.mood]?.hexes.first.flatMap { Color(hex: $0) }) ?? app.accentColor)
                                            .frame(width: max(6, geo.size.width * m.share))
                                    }
                                }.frame(height: 8)
                                Text("\(Int(m.share * 100))%").font(.caption2).foregroundStyle(.secondary).frame(width: 36)
                            }
                        }
                    }
                    .padding(14).background(Theme.panel, in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 120)
        }
        .navigationTitle("Analyse").navigationBarTitleDisplayMode(.inline)
    }

    private func tile(_ v: String, _ l: String) -> some View {
        VStack(spacing: 2) {
            Text(v).font(.title3.weight(.heavy)).foregroundStyle(.white)
            Text(l).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 16)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: Admin — user management

struct AdminUsersView: View {
    @EnvironmentObject var app: AppState
    @State private var users: [UserRow] = []
    @State private var me = -1
    @State private var newName = ""
    @State private var newPass = ""
    @State private var newAdmin = false
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SectionTitle(text: "Comptes")
                ForEach(users) { u in
                    HStack {
                        Image(systemName: u.isAdmin ? "person.badge.key.fill" : "person.fill").foregroundStyle(app.accentColor)
                        Text(u.username).font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                        if u.id == me { Text("vous").font(.caption2).foregroundStyle(.secondary) }
                        Spacer()
                        if u.id != me {
                            Button(role: .destructive) {
                                Task { if await app.deleteUser(u.id) { await reload() } }
                            } label: { Image(systemName: "trash") }
                        }
                    }
                    .padding(12).background(Theme.panel, in: RoundedRectangle(cornerRadius: 10))
                }

                SectionTitle(text: "Nouveau compte")
                VStack(spacing: 10) {
                    TextField("Identifiant", text: $newName)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .padding(12).background(Theme.panel, in: RoundedRectangle(cornerRadius: 10)).foregroundStyle(.white)
                    SecureField("Mot de passe", text: $newPass)
                        .padding(12).background(Theme.panel, in: RoundedRectangle(cornerRadius: 10)).foregroundStyle(.white)
                    Toggle("Administrateur", isOn: $newAdmin).tint(app.accentColor).foregroundStyle(.white)
                    Button {
                        busy = true
                        Task {
                            if await app.createUser(newName, newPass, isAdmin: newAdmin) {
                                newName = ""; newPass = ""; newAdmin = false; await reload()
                            }
                            busy = false
                        }
                    } label: {
                        Text(busy ? "Création…" : "Créer le compte")
                            .font(.subheadline.weight(.bold)).frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(app.accentColor, in: Capsule()).foregroundStyle(.black)
                    }
                    .disabled(newName.isEmpty || newPass.isEmpty || busy)
                }
            }
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 120)
        }
        .navigationTitle("Utilisateurs").navigationBarTitleDisplayMode(.inline)
        .task { await reload() }
    }

    private func reload() async {
        let r = await app.loadUsers()
        users = r.users; me = r.me
    }
}
