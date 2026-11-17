import json
import plistlib
import shutil
import tempfile
import unittest
from pathlib import Path

import lint

HERE = Path(__file__).resolve().parent


class LintTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.root = self.tmp / "cap"
        for rel in ("capacitor.config.json", "package.json", "ios/App/App/Info.plist",
                    "ios/App/App/PrivacyInfo.xcprivacy", "ios/App/App.xcodeproj/project.pbxproj"):
            dest = self.root / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(HERE / rel, dest)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def edit_json(self, rel, fn):
        path = self.root / rel
        data = json.loads(path.read_text())
        fn(data)
        path.write_text(json.dumps(data))

    def edit_plist(self, rel, fn):
        path = self.root / rel
        data = plistlib.loads(path.read_bytes())
        fn(data)
        path.write_bytes(plistlib.dumps(data))

    def problems(self, **kw):
        return lint.lint(self.root, **kw)

    def test_committed_scaffold_is_clean(self):
        self.assertEqual(lint.lint(HERE), [])

    def test_placeholder_app_id_fails(self):
        self.edit_json("capacitor.config.json", lambda d: d.update(appId="invalid.placeholder.bocal"))
        self.assertTrue(any("placeholder" in p for p in self.problems()))

    def test_wrong_namespace_fails(self):
        self.edit_json("capacitor.config.json", lambda d: d.update(appId="com.bocal.music"))
        self.assertTrue(any("com.asoc" in p for p in self.problems()))

    def test_pbxproj_bundle_id_must_match(self):
        path = self.root / "ios/App/App.xcodeproj/project.pbxproj"
        path.write_text(path.read_text().replace("com.asoc.bocal", "com.asoc.other"))
        self.assertTrue(any("PRODUCT_BUNDLE_IDENTIFIER" in p for p in self.problems()))

    def test_background_modes_fail(self):
        self.edit_plist("ios/App/App/Info.plist", lambda d: d.update(UIBackgroundModes=["audio"]))
        self.assertTrue(any("UIBackgroundModes" in p for p in self.problems()))

    def test_ats_exception_fails(self):
        self.edit_plist("ios/App/App/Info.plist", lambda d: d.update(NSAppTransportSecurity={"NSAllowsArbitraryLoads": True}))
        self.assertTrue(any("App Transport Security" in p for p in self.problems()))

    def test_missing_microphone_text_fails(self):
        self.edit_plist("ios/App/App/Info.plist", lambda d: d.pop("NSMicrophoneUsageDescription"))
        self.assertTrue(any("NSMicrophoneUsageDescription" in p for p in self.problems()))

    def test_server_block_fails(self):
        self.edit_json("capacitor.config.json", lambda d: d.update(server={"url": "http://192.168.0.2:3000", "cleartext": True}))
        found = self.problems()
        self.assertTrue(any("server" in p for p in found))
        self.assertTrue(any("cleartext" in p for p in found))

    def test_tracking_or_collection_fails(self):
        self.edit_plist("ios/App/App/PrivacyInfo.xcprivacy", lambda d: d.update(NSPrivacyTracking=True, NSPrivacyCollectedDataTypes=[{"x": 1}]))
        found = self.problems()
        self.assertTrue(any("NSPrivacyTracking" in p for p in found))
        self.assertTrue(any("CollectedDataTypes" in p for p in found))

    def test_extra_plugin_and_unpinned_version_fail(self):
        self.edit_json("package.json", lambda d: d["dependencies"].update({"@capacitor/analytics": "8.0.0", "@capacitor/ios": "^8.6.0"}))
        found = self.problems()
        self.assertTrue(any("unexpected dependency" in p for p in found))
        self.assertTrue(any("exact 8.x.y" in p for p in found))

    def test_embedded_development_team_fails(self):
        path = self.root / "ios/App/App.xcodeproj/project.pbxproj"
        path.write_text(path.read_text().replace("CODE_SIGN_STYLE = Automatic;", "CODE_SIGN_STYLE = Automatic;\n\t\t\t\tDEVELOPMENT_TEAM = ABCDE12345;", 1))
        self.assertTrue(any("DEVELOPMENT_TEAM" in p for p in self.problems()))

    def test_privacy_manifest_must_be_in_resources(self):
        path = self.root / "ios/App/App.xcodeproj/project.pbxproj"
        path.write_text(path.read_text().replace("PrivacyInfo.xcprivacy in Resources", "PrivacyInfo.xcprivacy in Other"))
        self.assertTrue(any("Resources phase" in p for p in self.problems()))

    def test_staged_bundle_must_equal_source(self):
        bundle = self.tmp / "bundle.html"
        bundle.write_bytes(b"<html>a</html>")
        (self.root / "www").mkdir()
        (self.root / "www/index.html").write_bytes(b"<html>b</html>")
        self.assertTrue(any("differs" in p for p in self.problems(bundle=bundle)))
        (self.root / "www/index.html").write_bytes(b"<html>a</html>")
        self.assertEqual(self.problems(bundle=bundle), [])

    def test_unparseable_plist_reported(self):
        (self.root / "ios/App/App/Info.plist").write_text("not a plist")
        self.assertTrue(any("cannot parse" in p for p in self.problems()))


if __name__ == "__main__":
    unittest.main()
