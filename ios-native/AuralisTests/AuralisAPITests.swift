import XCTest
@testable import Auralis

/// Unit tests for the pure URL-building helpers on `AuralisAPI`. These run on
/// the host (no device/simulator) and guard the encoding / sizing rules the
/// player + lock-screen artwork depend on — mirroring the Android JVM tests.
final class AuralisAPITests: XCTestCase {

    func testNormalizeBaseStripsTrailingSlashAndForcesHttp() {
        XCTAssertEqual(AuralisAPI.normalizeBase("http://host:4237/"), "http://host:4237")
        XCTAssertEqual(AuralisAPI.normalizeBase("host:4237/"), "http://host:4237")
        XCTAssertEqual(AuralisAPI.normalizeBase("https://x.example"), "https://x.example")
    }

    func testStreamURLEncodesSegments() {
        let url = AuralisAPI.streamURL(base: "http://host:4237", filepath: "Artist/Album/Song ?.mp3")
        XCTAssertEqual(url?.absoluteString, "http://host:4237/api/stream/Artist/Album/Song%20%3F.mp3")
    }

    func testStreamURLCollapsesSeparators() {
        let url = AuralisAPI.streamURL(base: "http://host", filepath: "\\a//b\\c.mp3")
        XCTAssertEqual(url?.absoluteString, "http://host/api/stream/a/b/c.mp3")
    }

    func testAssetURLReturnsNilForEmpty() {
        XCTAssertNil(AuralisAPI.assetURL(base: "http://host", image: nil))
        XCTAssertNil(AuralisAPI.assetURL(base: "http://host", image: ""))
    }

    func testAssetURLPassesExternalThrough() {
        let url = AuralisAPI.assetURL(base: "http://host", image: "https://cdn.example/x.png")
        XCTAssertEqual(url?.absoluteString, "https://cdn.example/x.png")
    }

    func testAssetURLPrefixesBaseForRelativePaths() {
        XCTAssertEqual(
            AuralisAPI.assetURL(base: "http://host:4237", image: "/api/art/abc")?.absoluteString,
            "http://host:4237/api/art/abc"
        )
        XCTAssertEqual(
            AuralisAPI.assetURL(base: "http://host:4237", image: "api/art/abc")?.absoluteString,
            "http://host:4237/api/art/abc"
        )
    }

    func testAssetURLAppendsWidthForArtEndpointOnly() {
        XCTAssertEqual(
            AuralisAPI.assetURL(base: "http://host", image: "/api/art/abc", width: 512)?.absoluteString,
            "http://host/api/art/abc?w=512"
        )
        // External URL untouched.
        XCTAssertEqual(
            AuralisAPI.assetURL(base: "http://host", image: "https://cdn.example/x.png", width: 512)?.absoluteString,
            "https://cdn.example/x.png"
        )
        // nil in → nil out.
        XCTAssertNil(AuralisAPI.assetURL(base: "http://host", image: nil, width: 256))
    }
}
