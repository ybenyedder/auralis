import Foundation
import AVFoundation
import MediaPlayer
import UIKit
import Combine

// AVPlayer-backed playback with background audio + Control Center / lock-screen
// integration (the iOS counterpart of android-native's Media3 PlaybackService). The
// bearer token is attached as an Authorization header on the AVURLAsset so the stream
// request authenticates without a ?token= query.
@MainActor
final class AudioPlayer: ObservableObject {
    @Published var isPlaying = false
    @Published var position: Double = 0
    @Published var duration: Double = 0
    /// Localized failure message for the current item (nil while healthy) — set
    /// when the AVPlayerItem reports `.failed`, cleared on each new load. The UI
    /// can surface it; the queue does not auto-advance past a broken track.
    @Published var playbackError: String?

    private let player = AVPlayer()
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    private var statusObserver: NSKeyValueObservation?
    private var interruptionObserver: NSObjectProtocol?
    private var routeObserver: NSObjectProtocol?
    /// Bumped on every Now Playing metadata update — in-flight artwork downloads
    /// bail when it has moved on, so a slow cover never lands on the new track.
    private var artworkGeneration = 0

    /// Fired when the current item plays through to the end (drives auto-advance).
    var onEnded: (() -> Void)?
    /// Remote-command hooks, wired by AppState.
    var onNext: (() -> Void)?
    var onPrev: (() -> Void)?
    var onTogglePlay: (() -> Void)?

    init() {
        configureSession()
        configureRemoteCommands()
        observeAudioSessionEvents()
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main
        ) { [weak self] t in
            guard let self else { return }
            self.position = t.seconds.isFinite ? t.seconds : 0
            if let dur = self.player.currentItem?.duration.seconds, dur.isFinite, dur > 0 {
                self.duration = dur
            }
            self.updateNowPlayingElapsed()
        }
    }

    private func configureSession() {
        let s = AVAudioSession.sharedInstance()
        try? s.setCategory(.playback, mode: .default)
        try? s.setActive(true)
    }

    private func observeAudioSessionEvents() {
        // Interruptions (incoming call, Siri, another app taking audio): pause on
        // .began; on .ended only resume when the system says we may (.shouldResume).
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
        ) { [weak self] note in
            guard let info = note.userInfo,
                  let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            var canResume = false
            if let rawOptions = info[AVAudioSessionInterruptionOptionKey] as? UInt {
                canResume = AVAudioSession.InterruptionOptions(rawValue: rawOptions).contains(.shouldResume)
            }
            Task { @MainActor in self?.handleInterruption(type, canResume: canResume) }
        }
        // Route changes: .oldDeviceUnavailable means the device we were playing
        // through (wired headphones, Bluetooth, car) went away — pause so music
        // does not suddenly blast out of the built-in speaker.
        routeObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
        ) { [weak self] note in
            guard let info = note.userInfo,
                  let raw = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
            Task { @MainActor in self?.handleRouteChange(reason) }
        }
    }

    private func handleInterruption(_ type: AVAudioSession.InterruptionType, canResume: Bool) {
        switch type {
        case .began:
            pause() // also refreshes Now Playing elapsed + rate
        case .ended:
            if canResume { play() }
        @unknown default:
            break
        }
    }

    private func handleRouteChange(_ reason: AVAudioSession.RouteChangeReason) {
        if reason == .oldDeviceUnavailable { pause() }
    }

    func load(url: URL, token: String?, title: String, artist: String, artworkURL: URL?) {
        var options: [String: Any] = [:]
        if let token { options["AVURLAssetHTTPHeaderFieldsKey"] = ["Authorization": "Bearer \(token)"] }
        let asset = AVURLAsset(url: url, options: options)
        let item = AVPlayerItem(asset: asset)

        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.onEnded?() }
        }

        // Watch the load status so a dead URL / undecodable file surfaces as an
        // error instead of a stuck "playing" state. A failed item never fires the
        // end-of-item notification, so the queue does not auto-advance.
        statusObserver?.invalidate()
        statusObserver = item.observe(\.status, options: [.new]) { [weak self] observedItem, _ in
            let status = observedItem.status
            let error = observedItem.error
            Task { @MainActor in self?.handleItemStatus(status, underlyingError: error) }
        }

        player.replaceCurrentItem(with: item)
        player.play()
        isPlaying = true
        position = 0
        duration = 0
        playbackError = nil
        updateNowPlayingInfo(title: title, artist: artist, artworkURL: artworkURL)
    }

    func play() { player.play(); isPlaying = true; updateNowPlayingElapsed() }
    func pause() { player.pause(); isPlaying = false; updateNowPlayingElapsed() }
    func toggle() { isPlaying ? pause() : play() }

    func seek(to seconds: Double) {
        player.seek(to: CMTime(seconds: max(0, seconds), preferredTimescale: 600))
        position = seconds
        updateNowPlayingElapsed()
    }

    func stop() {
        statusObserver?.invalidate()
        statusObserver = nil
        player.pause()
        player.replaceCurrentItem(with: nil)
        isPlaying = false
        position = 0
        duration = 0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    // MARK: Now Playing / remote commands

    private func configureRemoteCommands() {
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            Task { @MainActor in self.play() }
            return .success
        }
        c.pauseCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            Task { @MainActor in self.pause() }
            return .success
        }
        c.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            Task { @MainActor in self.onTogglePlay?() }
            return .success
        }
        c.nextTrackCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            Task { @MainActor in self.onNext?() }
            return .success
        }
        c.previousTrackCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            Task { @MainActor in self.onPrev?() }
            return .success
        }
        c.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self, let e = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            Task { @MainActor in self.seek(to: e.positionTime) }
            return .success
        }
    }

    private func handleItemStatus(_ status: AVPlayerItem.Status, underlyingError: Error?) {
        switch status {
        case .failed:
            // Surface the failure (rate 0 in Now Playing) and keep the queue put.
            isPlaying = false
            playbackError = underlyingError?.localizedDescription ?? "Impossible de lire ce morceau"
            updateNowPlayingElapsed()
        case .readyToPlay:
            playbackError = nil
        case .unknown:
            break
        @unknown default:
            break
        }
    }

    private func updateNowPlayingInfo(title: String, artist: String, artworkURL: URL?) {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: artist,
            MPNowPlayingInfoPropertyPlaybackRate: 1.0,
        ]
        if duration > 0 { info[MPMediaItemPropertyPlaybackDuration] = duration }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info

        guard let artworkURL else { return }
        artworkGeneration += 1
        let gen = artworkGeneration
        Task { // inherits the main actor (this type is @MainActor)
            guard let (data, _) = try? await URLSession.shared.data(from: artworkURL),
                  let image = UIImage(data: data) else { return }
            // A newer track took over while this download was in flight — drop
            // the stale artwork instead of pasting it on the new Now Playing.
            guard gen == artworkGeneration else { return }
            let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            var cur = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
            cur[MPMediaItemPropertyArtwork] = artwork
            MPNowPlayingInfoCenter.default().nowPlayingInfo = cur
        }
    }

    private func updateNowPlayingElapsed() {
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = position
        if duration > 0 { info[MPMediaItemPropertyPlaybackDuration] = duration }
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
