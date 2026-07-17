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

    private let player = AVPlayer()
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?

    /// Fired when the current item plays through to the end (drives auto-advance).
    var onEnded: (() -> Void)?
    /// Remote-command hooks, wired by AppState.
    var onNext: (() -> Void)?
    var onPrev: (() -> Void)?
    var onTogglePlay: (() -> Void)?

    init() {
        configureSession()
        configureRemoteCommands()
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

        player.replaceCurrentItem(with: item)
        player.play()
        isPlaying = true
        position = 0
        duration = 0
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
        c.playCommand.addTarget { [weak self] _ in Task { @MainActor in self?.play() }; return .success }
        c.pauseCommand.addTarget { [weak self] _ in Task { @MainActor in self?.pause() }; return .success }
        c.togglePlayPauseCommand.addTarget { [weak self] _ in Task { @MainActor in self?.onTogglePlay?() }; return .success }
        c.nextTrackCommand.addTarget { [weak self] _ in Task { @MainActor in self?.onNext?() }; return .success }
        c.previousTrackCommand.addTarget { [weak self] _ in Task { @MainActor in self?.onPrev?() }; return .success }
        c.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let e = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            Task { @MainActor in self?.seek(to: e.positionTime) }
            return .success
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
        Task { // inherits the main actor (this type is @MainActor)
            guard let (data, _) = try? await URLSession.shared.data(from: artworkURL),
                  let image = UIImage(data: data) else { return }
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
