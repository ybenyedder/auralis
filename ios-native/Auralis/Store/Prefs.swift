import Foundation
import Security

// Local persistence: the server URL + username + playback prefs live in UserDefaults;
// the session token lives in the Keychain (equivalent role to android-native's DataStore
// "auralis" store, with the token upgraded to secure storage on iOS). Library content and
// per-user state stay authoritative on the server.
enum Prefs {
    private static let d = UserDefaults.standard

    static var serverBase: String {
        get { d.string(forKey: "auralis.base") ?? "" }
        set { d.set(newValue, forKey: "auralis.base") }
    }
    static var username: String {
        get { d.string(forKey: "auralis.username") ?? "" }
        set { d.set(newValue, forKey: "auralis.username") }
    }
    static var theme: String {
        get { d.string(forKey: "auralis.theme") ?? "spotify" }
        set { d.set(newValue, forKey: "auralis.theme") }
    }
    static var shuffle: Bool {
        get { d.bool(forKey: "auralis.shuffle") }
        set { d.set(newValue, forKey: "auralis.shuffle") }
    }
    static var repeatMode: Int { // 0 off, 1 all, 2 one
        get { d.integer(forKey: "auralis.repeat") }
        set { d.set(newValue, forKey: "auralis.repeat") }
    }

    static func clearSession() {
        Keychain.delete("auralis.token")
        d.removeObject(forKey: "auralis.username")
    }

    static var token: String? {
        get { Keychain.read("auralis.token") }
        set {
            if let newValue { Keychain.set(newValue, for: "auralis.token") }
            else { Keychain.delete("auralis.token") }
        }
    }
}

/// Minimal Keychain wrapper for a single string secret per key.
enum Keychain {
    private static let service = "local.auralis.client"

    static func set(_ value: String, for key: String) {
        delete(key)
        guard let data = value.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    static func read(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
