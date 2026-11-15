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
                Text("Auralis").font(.largeTitle.weight(.heavy)).foregroundStyle(.primary)
                Text("Connectez-vous à votre serveur").font(.subheadline).foregroundStyle(.secondary)
            }
            VStack(spacing: 14) {
                TextField("http://192.168.1.10:4123", text: $url)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .padding(14)
                    .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.primary.opacity(0.08), lineWidth: 1))
                    .foregroundStyle(.primary)
                if let err = app.errorMessage {
                    Text(err).font(.caption).foregroundStyle(.red)
                }
                Button {
                    busy = true
                    Task { await app.connect(url); busy = false }
                } label: {
                    Text(busy ? "Connexion…" : "Continuer")
                        .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(app.accentColor, in: Capsule()).foregroundStyle(app.accentInk)
                }
                .disabled(url.trimmingCharacters(in: .whitespaces).isEmpty || busy)
            }
            .padding(20)
            .background(Theme.panel2, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(Color.primary.opacity(0.08), lineWidth: 1))
            Spacer()
        }
        .padding(24)
    }
}

private enum AuthMode: String, CaseIterable {
    case login = "Se connecter"
    case register = "Créer un compte"
}

/// Login + open self-service account registration card.
struct LoginView: View {
    @EnvironmentObject var app: AppState
    @State private var mode: AuthMode = .login
    @State private var username = Prefs.username.isEmpty ? "admin" : Prefs.username
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var showPassword = false
    @State private var localError: String? = nil
    @State private var accounts: [String] = []
    @State private var busy = false

    private var activeError: String? { localError ?? app.errorMessage }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Spacer(minLength: 28)
                VStack(spacing: 6) {
                    Text(mode == .login ? "Connexion" : "Créer un compte")
                        .font(.largeTitle.weight(.heavy)).foregroundStyle(.primary)
                    Text(app.base).font(.caption).foregroundStyle(.secondary)
                }

                // Segmented pill switch: Connexion / Créer un compte
                HStack(spacing: 6) {
                    ForEach(AuthMode.allCases, id: \.self) { m in
                        Button {
                            mode = m
                            localError = nil
                            app.errorMessage = nil
                            if m == .register && username == "admin" && Prefs.username.isEmpty {
                                username = ""
                            }
                        } label: {
                            Text(m.rawValue)
                                .font(.subheadline.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(mode == m ? app.accentColor : Color.clear, in: Capsule())
                                .foregroundStyle(mode == m ? app.accentInk : .secondary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(4)
                .background(Theme.panel2, in: Capsule())
                .overlay(Capsule().stroke(Color.primary.opacity(0.08), lineWidth: 1))

                if mode == .login && !accounts.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(accounts, id: \.self) { name in
                                Button {
                                    username = name
                                    localError = nil
                                } label: {
                                    Text(name)
                                        .font(.subheadline.weight(.semibold))
                                        .padding(.horizontal, 14).padding(.vertical, 8)
                                        .background(username == name ? app.accentColor : Theme.panel2, in: Capsule())
                                        .foregroundStyle(username == name ? app.accentInk : .primary)
                                }.buttonStyle(.plain)
                            }
                        }.padding(.horizontal, 2)
                    }
                }

                VStack(spacing: 12) {
                    TextField("Identifiant", text: $username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(14)
                        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.primary.opacity(0.08), lineWidth: 1))
                        .foregroundStyle(.primary)

                    HStack(spacing: 8) {
                        Group {
                            if showPassword {
                                TextField("Mot de passe", text: $password)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                            } else {
                                SecureField("Mot de passe", text: $password)
                            }
                        }
                        Button { showPassword.toggle() } label: {
                            Image(systemName: showPassword ? "eye.slash" : "eye")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(14)
                    .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.primary.opacity(0.08), lineWidth: 1))
                    .foregroundStyle(.primary)

                    if mode == .register {
                        SecureField("Confirmer le mot de passe", text: $confirmPassword)
                            .padding(14)
                            .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.primary.opacity(0.08), lineWidth: 1))
                            .foregroundStyle(.primary)
                        Text("Identifiant : 2 à 32 caractères · Mot de passe : 6 caractères minimum.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if let err = activeError {
                        Text(err).font(.caption).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button {
                        submit()
                    } label: {
                        Text(busy ? (mode == .login ? "Connexion…" : "Création…") : mode.rawValue)
                            .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 14)
                            .background(app.accentColor, in: Capsule()).foregroundStyle(app.accentInk)
                    }
                    .disabled(username.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty || busy)

                    Button("Changer de serveur") { app.phase = .connect }
                        .font(.caption).foregroundStyle(.secondary).padding(.top, 4)
                }
                .padding(20)
                .background(Theme.panel2, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(Color.primary.opacity(0.08), lineWidth: 1))

                Spacer(minLength: 24)
            }
            .padding(24)
        }
        .task { accounts = await app.api.accounts(probeBase: app.base) }
    }

    private func submit() {
        let u = username.trimmingCharacters(in: .whitespaces)
        localError = nil
        app.errorMessage = nil
        if mode == .register {
            if u.count < 2 || u.count > 32 {
                localError = "Identifiant : 2 à 32 caractères"
                return
            }
            if password.count < 6 {
                localError = "Mot de passe : 6 caractères minimum"
                return
            }
            if password != confirmPassword {
                localError = "Les mots de passe ne correspondent pas"
                return
            }
        }
        busy = true
        Task {
            if mode == .login {
                await app.login(username: u, password: password)
            } else {
                await app.register(username: u, password: password)
            }
            busy = false
        }
    }
}
