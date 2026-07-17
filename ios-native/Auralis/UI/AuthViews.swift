import SwiftUI

/// Server-connection onboarding: the user types their self-hosted server URL, we probe
/// /api/health, then move on to the login step.
struct ConnectView: View {
    @EnvironmentObject var app: AppState
    @State private var url: String = Prefs.serverBase
    @State private var busy = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            VStack(spacing: 8) {
                Image(systemName: "waveform.circle.fill").font(.system(size: 56)).foregroundStyle(app.accentColor)
                Text("Auralis").font(.largeTitle.weight(.heavy)).foregroundStyle(.white)
                Text("Connectez-vous à votre serveur").font(.subheadline).foregroundStyle(.secondary)
            }
            VStack(spacing: 12) {
                TextField("http://192.168.1.10:4123", text: $url)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .padding(14)
                    .background(Theme.panel, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(.white)
                if let err = app.errorMessage {
                    Text(err).font(.caption).foregroundStyle(.red)
                }
                Button {
                    busy = true
                    Task { await app.connect(url); busy = false }
                } label: {
                    Text(busy ? "Connexion…" : "Continuer")
                        .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(app.accentColor, in: Capsule()).foregroundStyle(.black)
                }
                .disabled(url.trimmingCharacters(in: .whitespaces).isEmpty || busy)
            }
            Spacer()
        }
        .padding(24)
    }
}

/// Account picker + password. Loads the server's account list for a quick tap-to-fill.
struct LoginView: View {
    @EnvironmentObject var app: AppState
    @State private var username = Prefs.username.isEmpty ? "admin" : Prefs.username
    @State private var password = ""
    @State private var accounts: [String] = []
    @State private var busy = false

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Text("Connexion").font(.largeTitle.weight(.heavy)).foregroundStyle(.white)
            Text(app.base).font(.caption).foregroundStyle(.secondary)

            if !accounts.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(accounts, id: \.self) { name in
                            Button { username = name } label: {
                                Text(name)
                                    .font(.subheadline.weight(.semibold))
                                    .padding(.horizontal, 14).padding(.vertical, 8)
                                    .background(username == name ? app.accentColor : Theme.panel2, in: Capsule())
                                    .foregroundStyle(username == name ? .black : .white)
                            }.buttonStyle(.plain)
                        }
                    }.padding(.horizontal, 2)
                }
            }

            VStack(spacing: 12) {
                TextField("Identifiant", text: $username)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .padding(14).background(Theme.panel, in: RoundedRectangle(cornerRadius: 12)).foregroundStyle(.white)
                SecureField("Mot de passe", text: $password)
                    .padding(14).background(Theme.panel, in: RoundedRectangle(cornerRadius: 12)).foregroundStyle(.white)
                if let err = app.errorMessage {
                    Text(err).font(.caption).foregroundStyle(.red)
                }
                Button {
                    busy = true
                    Task { await app.login(username: username, password: password); busy = false }
                } label: {
                    Text(busy ? "Connexion…" : "Se connecter")
                        .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(app.accentColor, in: Capsule()).foregroundStyle(.black)
                }
                .disabled(username.isEmpty || busy)

                Button("Changer de serveur") { app.phase = .connect }
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(24)
        .task { accounts = await app.api.accounts(probeBase: app.base) }
    }
}
